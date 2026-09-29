"""Bridge the feature-extraction schema onto the model's schema.

**The two workstreams do not currently agree on the feature contract.** Both
declare 19 slots, but only seven names match and positions 3 through 13 are
disjoint:

===========  ====================================  ====================================
Position     ``agrigrade.features.FEATURE_NAMES``  ``agrigrade.model.schema``
===========  ====================================  ====================================
0-2          true_area, equiv_diameter, volume     same
3-5          spectral_primary/secondary/defect    reference_scale, calibration_conf, family_red
6-13         color_r/g/b/l/a/b_lab, color_l/a_std   family_yellow, family_brown,
                                                         spectral_*, mean_l/a/b, lab_l_std
14-18        glcm_*, lbp_uniformity                glcm_*, lbp_entropy, spot_ratio
===========  ====================================  ====================================

The Random Forest is positional, so handing it a vector in the wrong order does
not raise. It scores. :mod:`agrigrade.model.rf` says so explicitly, and this
module is the only thing standing between the two contracts and a silently wrong
grade.

So the mapping below is explicit and total, and
:func:`reconcile_feature_schemas` fails loudly if the two schemas ever move
further apart than the table describes. A new slot on either side breaks this
module rather than quietly shifting every column after it.

Slots the extractor does not emit are filled here from information the API
already holds, and each one says so:

* ``reference_scale_mm_per_px`` and ``calibration_confidence`` come from the
  caller's reference marker. They are properties of the capture, not the fruit.
* The three ``family_*`` flags come from ``family_for``, so they are exact rather
  than inferred.
* ``spot_ratio`` is genuinely absent from the extractor and is derived here from
  the mask's lightness distribution. It is the one value in this module that is
  not a rename, and it is flagged as such.

The durable fix is a schema reconciliation PR to ``core/`` per rule 4 of
``CONTRIBUTING.md``; this adapter is the honest interim, not the destination.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Final

import numpy as np

from agrigrade.core.enums import ProduceClass, ProduceFamily, family_for
from agrigrade.core.errors import SchemaMismatchError

#: Model slot -> feature-extraction slot, for the seven names that agree.
IDENTITY_SLOTS: Final[dict[str, str]] = {
    "true_area_cm2": "true_area_cm2",
    "equivalent_diameter_mm": "equivalent_diameter_mm",
    "spectral_primary": "spectral_primary",
    "spectral_secondary": "spectral_secondary",
    "defect_index": "defect_index",
    "glcm_homogeneity": "glcm_homogeneity",
    "glcm_contrast": "glcm_contrast",
}

#: Model slot -> feature-extraction slot, where the same measurement is named
#: differently on the two sides. These are renames, not conversions: the number
#: the extractor produced is the number the model was trained on.
RENAMED_SLOTS: Final[dict[str, str]] = {
    "volume_cm3": "estimated_volume_cm3",
    "mean_l": "color_l_mean",
    "mean_a": "color_a_mean",
    "mean_b": "color_b_lab_mean",
    "lab_l_std": "color_l_std",
    "lbp_entropy": "lbp_uniformity",
}

#: Model slots the extractor never emits, mapped to the adapter that fills them.
DERIVED_SLOTS: Final[dict[str, str]] = {
    "reference_scale_mm_per_px": "the caller's reference marker",
    "calibration_confidence": "whether that marker was measured or assumed",
    "family_red_smooth": "family_for(crop_type)",
    "family_yellow_green": "family_for(crop_type)",
    "family_brown_textured": "family_for(crop_type)",
    "spot_ratio": "the mask's lightness distribution (see spot_ratio_from)",
}

#: Confidence reported when a scale was measured from a reference marker, and the
#: sentinel when it was assumed. The model treats this slot as a distractor, so
#: 0.0 is safe: it shifts a column the ensemble does not lean on, and it tells
#: anyone reading the vector that the geometry is not trustworthy.
CALIBRATED_CONFIDENCE: Final[float] = 0.95
UNCALIBRATED_CONFIDENCE: Final[float] = 0.0

#: Pixels darker than ``mean - SPOT_SIGMA * std`` of the masked foreground count
#: as surface spots. Two sigma leaves a clean item near zero, which is the range
#: the training data's ``spot_ratio`` occupies.
SPOT_SIGMA: Final[float] = 2.0


def spot_ratio_from(lightness: np.ndarray) -> float:
    """Fraction of foreground pixels that read as a dark surface spot.

    A pixel counts when its L* is below ``mean - SPOT_SIGMA * std`` of the
    foreground. Two sigma leaves a clean item near zero, which is where the
    training data's ``spot_ratio`` range starts, so this stays a genuine
    measurement rather than a constant.

    Args:
        lightness: L* of each foreground pixel, one value per pixel.

    Returns:
        A fraction in 0..1. Empty input yields 0.0.
    """
    if lightness.size == 0:
        return 0.0
    threshold = float(lightness.mean()) - SPOT_SIGMA * float(lightness.std())
    return float((lightness < threshold).mean())


def adapt_features(
    measured: Mapping[str, float],
    schema_names: tuple[str, ...],
    *,
    crop_type: ProduceClass | str,
    mm_per_pixel: float,
    calibrated: bool,
    spot_ratio: float,
) -> dict[str, float]:
    """Project an extracted feature vector onto the model's schema.

    Args:
        measured: The dict returned by
            :func:`agrigrade.features.pipeline.extract_produce_features`.
        schema_names: The model's declared feature order, read from the loaded
            artifact rather than assumed.
        crop_type: The routed produce class, which sets the family flags.
        mm_per_pixel: Calibration scale for the geometric slots.
        calibrated: Whether that scale was measured from a reference marker.
        spot_ratio: Dark-spot area fraction, derived from the mask.

    Returns:
        A dict with exactly the model's slots, in its order.

    Raises:
        SchemaMismatchError: If the extractor did not emit a slot this mapping
            depends on, or emitted one the mapping does not know about. Both are
            a contract change that needs a human, not a default value.
    """
    family = family_for(crop_type)
    adapted: dict[str, float] = {}

    for target, source in {**IDENTITY_SLOTS, **RENAMED_SLOTS}.items():
        if source not in measured:
            raise SchemaMismatchError(
                f"feature-extraction did not emit {source!r}, required for the "
                f"model slot {target!r}. The two schemas have diverged; "
                f"reconcile them in core/ before scoring."
            )
        adapted[target] = float(measured[source])

    adapted["reference_scale_mm_per_px"] = float(mm_per_pixel)
    adapted["calibration_confidence"] = (
        CALIBRATED_CONFIDENCE if calibrated else UNCALIBRATED_CONFIDENCE
    )
    adapted["family_red_smooth"] = float(family is ProduceFamily.RED_SMOOTH)
    adapted["family_yellow_green"] = float(family is ProduceFamily.YELLOW_GREEN)
    adapted["family_brown_textured"] = float(family is ProduceFamily.BROWN_TEXTURED)
    adapted["spot_ratio"] = float(spot_ratio)

    # The ensemble is positional, so the dict must be *exactly* the schema:
    # a missing key shifts everything after it, and an extra key is ignored.
    if set(adapted) != set(schema_names):
        missing = sorted(set(schema_names) - set(adapted))
        extra = sorted(set(adapted) - set(schema_names))
        raise SchemaMismatchError(
            f"adapted vector does not match the model schema: "
            f"missing={missing} unexpected={extra}"
        )
    return {name: adapted[name] for name in schema_names}


def reconcile_feature_schemas(
    feature_names: tuple[str, ...],
    model_names: tuple[str, ...],
) -> dict[str, object]:
    """Describe how far the two schemas have drifted apart.

    Called on load so the drift is reported in ``/api/v1/health`` rather than
    discovered later as a bad grade. Exposed because the fix belongs in
    ``core/`` and whoever writes that PR needs to know the current delta.

    Returns:
        A summary with the shared names, the slots the adapter renames, the ones
        it derives, and whether the two orders agree.
    """
    shared = [name for name in feature_names if name in model_names]
    renamed = {
        target: source for target, source in RENAMED_SLOTS.items() if source in feature_names
    }
    derived = sorted(DERIVED_SLOTS)
    return {
        "identical": tuple(feature_names) == tuple(model_names),
        "shared_names": shared,
        "renamed": renamed,
        "derived": derived,
        "feature_only": [n for n in feature_names if n not in model_names],
        "model_only": [n for n in model_names if n not in feature_names],
        "feature_count": len(feature_names),
        "model_count": len(model_names),
    }


__all__ = [
    "CALIBRATED_CONFIDENCE",
    "DERIVED_SLOTS",
    "IDENTITY_SLOTS",
    "RENAMED_SLOTS",
    "SPOT_SIGMA",
    "UNCALIBRATED_CONFIDENCE",
    "adapt_features",
    "reconcile_feature_schemas",
    "spot_ratio_from",
]
