"""The orchestration layer: one captured frame in, one explained grade out.

This is the only module that knows how the workstreams fit together. The
specification's data flow, with the seams made explicit:

1. decode the uploaded bytes to an RGB array
2. :mod:`agrigrade.segmentation` produces a foreground mask and a class
3. :mod:`agrigrade.core.enums` maps that class to a colour family
4. :mod:`agrigrade.features` runs the family's recipe over the masked foreground
5. :mod:`agrigrade.api.adapter` projects that vector onto the model's schema
6. :mod:`agrigrade.model` returns a grade, a confidence and an explanation
7. :mod:`agrigrade.api.schemas` serialises the three together

Steps 2 to 6 are all injected or lazily imported, which is what makes this
testable and what keeps the server bootable when a workstream's dependencies are
absent: a missing import becomes a 501, not a crash at startup.

Nothing here logs image bytes or reference measurements. The ``segment`` and
``grade`` handlers accept a photograph of someone's stock, and the reference
marker plus the resulting area are a direct read on that farm's throughput.
"""

from __future__ import annotations

import io
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import numpy as np
import numpy.typing as npt
from PIL import Image, UnidentifiedImageError

from agrigrade.api.adapter import SPOT_SIGMA, adapt_features, spot_ratio_from
from agrigrade.api.model_runtime import LoadedModel, load_model
from agrigrade.api.schemas import (
    Attribution,
    FeatureValue,
    GradeResult,
    ModelInfo,
    TreeVote,
)
from agrigrade.core.enums import GRADE_ORDER, ProduceClass, ProduceFamily
from agrigrade.core.errors import (
    CalibrationError,
    WorkstreamNotImplementedError,
)
from agrigrade.segmentation import SegmentationResult, ThresholdSegmenter

#: Assumed mm-per-pixel when the caller supplies no reference marker. Only fills
#: the geometric slots so the vector is schema-complete; the response reports
#: ``scale_mm_per_pixel: null`` so the client shows "Not calibrated" rather than
#: a number nobody measured.
NOMINAL_MM_PER_PIXEL = 0.25

#: Hard ceiling on decoded pixels. A phone frame is a few megapixels; this is
#: generous, and it exists so a decompression bomb cannot exhaust the box.
MAX_PIXELS = 40_000_000

#: How many features to attribute and return. Enough to explain a decision
#: without sending a payload the client has to scroll to read.
TOP_K_FEATURES = 6

Extractor = Callable[[np.ndarray, np.ndarray, str, float], dict[str, float]]
Segmenter = Callable[..., SegmentationResult]


class ImageDecodeError(ValueError):
    """The uploaded bytes are not a decodable image."""


def features_extractor() -> Extractor:
    """Resolve the feature-extraction workstream on demand.

    Deferred because ``agrigrade.features`` imports OpenCV at module scope, and
    per the API's boundary rules a missing workstream must surface as a 501 from
    the handler rather than stop the server booting.

    Raises:
        WorkstreamNotImplementedError: The workstream or its deps are absent.
    """
    try:
        from agrigrade.features import extract_produce_features
    except ImportError as exc:
        raise WorkstreamNotImplementedError(
            f"the feature-extraction workstream is unavailable ({exc}); "
            f"install the 'features' extra"
        ) from exc
    return extract_produce_features


def model_reporting() -> tuple[Callable[..., Any], Callable[..., Any]]:
    """Resolve the model's confidence and XAI helpers on demand.

    Returns:
        ``(build_report, explain)``.

    Raises:
        WorkstreamNotImplementedError: The workstream or its deps are absent.
    """
    try:
        from agrigrade.model.confidence import build_report
        from agrigrade.model.xai import explain
    except ImportError as exc:
        raise WorkstreamNotImplementedError(
            f"the model workstream is unavailable ({exc}); install the 'model' extra"
        ) from exc
    return build_report, explain


@dataclass(frozen=True, slots=True)
class Calibration:
    """Scale recovered from an on-screen reference marker, if one was sent."""

    mm_per_pixel: float
    calibrated: bool

    @classmethod
    def from_reference(
        cls,
        diameter_mm: float | None,
        diameter_px: float | None,
    ) -> Calibration:
        """Build a calibration from the caller's reference measurements.

        Both values are required. One without the other is a caller bug and
        raises, because a silently half-calibrated size is worse than an
        honestly uncalibrated one.
        """
        if diameter_mm is None and diameter_px is None:
            return cls(NOMINAL_MM_PER_PIXEL, False)
        if diameter_mm is None or diameter_px is None:
            raise CalibrationError(
                "reference_diameter_mm and reference_diameter_px must be sent together"
            )
        if diameter_mm <= 0 or diameter_px <= 0:
            raise CalibrationError("reference diameters must be positive")
        return cls(diameter_mm / diameter_px, True)


def decode_image(data: bytes) -> np.ndarray:
    """Decode image bytes to an ``(H, W, 3)`` float array of sRGB in 0..1.

    Raises:
        ImageDecodeError: On an unsupported, truncated or oversized payload.
    """
    try:
        with Image.open(io.BytesIO(data)) as handle:
            width, height = handle.size
            if width * height > MAX_PIXELS:
                raise ImageDecodeError(
                    f"image is {width}x{height} pixels, over the {MAX_PIXELS} limit"
                )
            array = np.asarray(handle.convert("RGB"), dtype=np.float64)
    except ImageDecodeError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageDecodeError(f"could not decode image: {exc}") from exc
    return np.clip(array / 255.0, 0.0, 1.0)


def foreground_lightness(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """L* of every masked pixel, for the adapter's ``spot_ratio`` derivation.

    The extractor does not emit ``spot_ratio`` and the model's schema wants it,
    so the orchestration layer measures it here from the same pixels the feature
    stage saw. Same sRGB companding and D65 white point as the Lab conversion in
    :mod:`agrigrade.segmentation`, kept as a local copy because duplicating three
    lines of colour maths beats coupling two packages' internals.
    """
    pixels = image[mask]
    if pixels.size == 0:
        return np.empty(0, dtype=np.float64)
    linear = np.where(pixels <= 0.04045, pixels / 12.92, ((pixels + 0.055) / 1.055) ** 2.4)
    xyz = linear @ np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    ).T
    scaled = xyz[:, 1] / 1.00000
    delta = 6.0 / 29.0
    f = np.where(scaled > delta**3, np.cbrt(scaled), scaled / (3 * delta**2) + 4.0 / 29.0)
    return 116.0 * f - 16.0


class QualityGraderLike(Protocol):
    """The slice of ``QualityGrader`` this layer calls.

    A Protocol rather than a concrete import, because ``agrigrade.model.rf``
    pulls in scikit-learn and the API must import without it. Naming the two
    methods also documents exactly what the orchestration layer depends on.
    """

    def predict_proba(
        self, features: Mapping[str, Any] | Sequence[float]
    ) -> npt.NDArray[np.float64]: ...

    def tree_votes(
        self, features: Mapping[str, Any] | Sequence[float]
    ) -> npt.NDArray[np.int_]: ...


class GradingOrchestrator:
    """Runs the pipeline and returns wire-ready results.

    Args:
        model: A loaded ensemble. Resolved lazily from the artifact directory
            when omitted.
        extractor: Feature extraction callable, injected so tests can exercise
            the orchestration without the feature workstream's heavy deps.
        segmenter: Foreground segmenter, injected for the same reason.
    """

    def __init__(
        self,
        model: LoadedModel | None = None,
        *,
        extractor: Extractor | None = None,
        segmenter: Segmenter | None = None,
    ) -> None:
        self._model = model
        self._extractor = extractor
        self._segmenter = segmenter or ThresholdSegmenter().segment

    @property
    def model(self) -> LoadedModel:
        """The ensemble, loaded on first use."""
        if self._model is None:
            self._model = load_model()
        return self._model

    # --- stages ---------------------------------------------------------

    def segment(
        self,
        image: np.ndarray,
        class_hint: ProduceClass | str | None = None,
    ) -> SegmentationResult:
        """Mask the frame and resolve its class."""
        return self._segmenter(image, class_hint)

    def measure(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        produce_class: ProduceClass,
        calibration: Calibration,
    ) -> dict[str, float]:
        """Run feature extraction, then project onto the model's schema.

        Raises:
            SchemaMismatchError: If the two workstreams' schemas have drifted
                further apart than :mod:`agrigrade.api.adapter` describes.
        """
        measured = (self._extractor or features_extractor())(
            image, mask, str(produce_class), calibration.mm_per_pixel
        )
        spot_ratio = spot_ratio_from(foreground_lightness(image, mask))
        return adapt_features(
            measured,
            self.model.feature_names,
            crop_type=produce_class,
            mm_per_pixel=calibration.mm_per_pixel,
            calibrated=calibration.calibrated,
            spot_ratio=spot_ratio,
        )

    def grade(
        self,
        data: bytes,
        *,
        class_hint: str | None = None,
        reference_diameter_mm: float | None = None,
        reference_diameter_px: float | None = None,
    ) -> tuple[GradeResult, SegmentationResult]:
        """Grade one captured frame.

        Returns:
            The grade and the segmentation it was measured from, so the caller
            can render an overlay without segmenting twice.
        """
        image = decode_image(data)
        segmentation = self.segment(image, class_hint)
        calibration = Calibration.from_reference(
            reference_diameter_mm, reference_diameter_px
        )
        features = self.measure(
            image, segmentation.mask, segmentation.produce_class, calibration
        )
        result = self._score(features, segmentation, calibration)
        return result, segmentation

    # --- scoring --------------------------------------------------------

    def _score(
        self,
        features: dict[str, float],
        segmentation: SegmentationResult,
        calibration: Calibration,
    ) -> GradeResult:
        """Run the ensemble and assemble the wire result."""
        model = self.model
        grader = model.grader
        build_report, explain = model_reporting()

        probabilities = grader.predict_proba(features)[0]
        report = build_report(probabilities)
        distribution = {
            grade: round(float(probability) * 100.0, 4)
            for grade, probability in zip(GRADE_ORDER, probabilities, strict=True)
        }
        tree_votes = self._tree_votes(grader, features)
        explanation = explain(
            grader, features, segmentation.family, top_k=TOP_K_FEATURES
        )
        importance = self._normalise_importance(explanation.attributions)

        return GradeResult(
            id=uuid.uuid4().hex,
            produce_class=segmentation.produce_class,
            family=segmentation.family,
            grade=report.grade,
            confidence=round(report.confidence_pct, 4),
            grade_distribution=distribution,
            features=[
                FeatureValue(
                    name=name,
                    value=round(float(value), 6),
                    unit=model_unit(name),
                    importance=importance.get(name, 0.0),
                )
                for name, value in features.items()
            ],
            scale_mm_per_pixel=(
                round(calibration.mm_per_pixel, 6) if calibration.calibrated else None
            ),
            true_area_cm2=(
                round(float(features["true_area_cm2"]), 4)
                if calibration.calibrated
                else None
            ),
            tree_votes=tree_votes,
            captured_at=datetime.now(UTC).isoformat(),
            is_confident=report.is_confident,
            abstain_reason=report.reason,
            margin=round(report.margin, 6),
            entropy=round(report.entropy, 6),
            explanation=[
                Attribution(
                    name=a.name,
                    label=a.label,
                    value=round(a.value, 6),
                    baseline=round(a.baseline, 6),
                    unit=a.unit or None,
                    contribution=round(a.contribution, 6),
                    direction=a.direction,
                )
                for a in explanation.attributions
            ],
            model=ModelInfo(
                schema_version=model.schema_version,
                n_estimators=model.n_estimators,
                n_features=len(model.feature_names),
                checksum=model.checksum,
            ),
        )

    def _tree_votes(
        self, grader: QualityGraderLike, features: dict[str, float]
    ) -> list[TreeVote]:
        """Sample a spread of trees so the client's histogram has bars.

        The forest holds 100 trees and the response would otherwise carry all of
        them. Deterministic stride sampling keeps the payload small and the
        chart honest about being a sample.
        """
        votes = grader.tree_votes(features)[:, 0]
        stride = max(1, len(votes) // 12)
        sampled = votes[::stride][:12]
        return [
            TreeVote(grade=GRADE_ORDER[int(index)], probability=1.0)
            for index in sampled
        ]

    @staticmethod
    def _normalise_importance(attributions: Sequence[Any]) -> dict[str, float]:
        """Scale |contribution| into 0..1 against the strongest driver.

        Occlusion contributions are not additive, so they are not used as a
        decomposition. The *ranking* is the reliable output, and that is what a
        bar chart shows.
        """
        peak = max((abs(a.contribution) for a in attributions), default=0.0)
        if peak <= 0.0:
            return {a.name: 0.0 for a in attributions}
        return {a.name: round(min(1.0, abs(a.contribution) / peak), 6) for a in attributions}


#: Slot units, for the feature table. Kept here rather than read from the schema
#: so a unit change on the model side cannot silently relabel the client's units.
UNITS: dict[str, str] = {
    "true_area_cm2": "cm²",
    "equivalent_diameter_mm": "mm",
    "volume_cm3": "cm³",
    "reference_scale_mm_per_px": "mm/px",
    "mean_l": "L*",
    "mean_a": "a*",
    "mean_b": "b*",
    "lab_l_std": "L*",
    "lbp_entropy": "bits",
}


def model_unit(name: str) -> str | None:
    """Display unit for a model feature slot, or None when dimensionless."""
    return UNITS.get(name)


def produce_family_of(produce_class: str) -> ProduceFamily:
    """Routing family for a class string, for the catalog route."""
    from agrigrade.core.enums import family_for

    return family_for(produce_class)


__all__ = [
    "MAX_PIXELS",
    "NOMINAL_MM_PER_PIXEL",
    "SPOT_SIGMA",
    "Calibration",
    "Extractor",
    "GradingOrchestrator",
    "ImageDecodeError",
    "Segmenter",
    "decode_image",
    "foreground_lightness",
    "model_unit",
    "produce_family_of",
]
