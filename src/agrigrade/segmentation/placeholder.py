"""Foreground segmentation for the orchestration layer.

.. warning::

   **Placeholder, not the YOLOv8 detector.** The specification calls for an
   Ultralytics YOLOv8-seg instance segmenter, which is a heavyweight dependency
   and a separate piece of work. What is here is a dependency-light stand-in so
   the API is runnable end to end today. It is a *background subtractor*, not a
   learned detector, and it is honest about the difference:

   * It assumes the produce sits on a reasonably uniform backdrop. A cluttered
     crate, a strong cast shadow, or a second piece of produce will all end up
     in the mask, and their pixels will be measured.
   * It predicts a class from colour statistics rather than from a trained
     detector. It routes a single well-framed item sensibly and is unreliable
     otherwise. Callers that know the class should send ``produce_class_hint``
     and skip the guess entirely.

   When the YOLOv8 adapter lands it goes in ``yolo.py`` behind the same
   :class:`Segmenter` protocol, and nothing above this module changes.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image
from scipy import ndimage

from agrigrade.core.enums import ProduceClass, ProduceFamily, family_for
from agrigrade.core.errors import ProduceNotFoundError

#: Colour distance from the estimated background, on the 0..1 channel scale, for
#: a pixel to count as foreground. Tuned against the demo frames; a real
#: detector makes this unnecessary.
FOREGROUND_THRESHOLD: float = 0.14

#: Structuring element for the binary opening that removes speckle.
_MORPH_RADIUS: int = 2

#: An object's area must be at least this fraction of the largest candidate's, so
#: a second small object in frame is dropped rather than merged.
_AREAS_RATIO: float = 0.35


@dataclass(frozen=True, slots=True)
class SegmentationResult:
    """A foreground mask and the class predicted for it.

    Attributes:
        mask: ``(H, W)`` boolean array, True on produce.
        produce_class: Predicted class, or ``unknown`` when unconfident.
        family: The routing family for that class.
        coverage: Foreground fraction of the frame, 0..1.
    """

    mask: np.ndarray
    produce_class: ProduceClass
    family: ProduceFamily
    coverage: float

    def overlay_png_base64(self, image: np.ndarray) -> str:
        """Return the mask drawn over ``image`` as a base64 PNG.

        The client renders this straight into an ``<img>``, so the bytes are
        returned rather than a path: the API is stateless and must not write
        frames to disk.
        """
        overlay = (np.clip(image, 0.0, 1.0) * 255.0).astype(np.uint8).copy()
        edge = self.mask & ~ndimage.binary_erosion(self.mask)
        overlay[edge] = (0, 200, 180)
        buffer = io.BytesIO()
        Image.fromarray(overlay).save(buffer, format="PNG", optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("ascii")


class Segmenter(Protocol):
    """The interface the feature stage and the API depend on.

    A protocol rather than a base class so a real YOLOv8 adapter and this
    placeholder are interchangeable, and so a test can substitute either.
    """

    def segment(
        self, image: np.ndarray, class_hint: ProduceClass | str | None = None
    ) -> SegmentationResult: ...


def _estimate_background(image: np.ndarray) -> np.ndarray:
    """Per-channel median of the one-pixel frame border.

    Right for a plain backdrop, wrong for a full-frame crate. With YOLOv8 this
    becomes irrelevant.
    """
    border = np.concatenate(
        [image[0, :, :], image[-1, :, :], image[:, 0, :], image[:, -1, :]], axis=0
    )
    return np.median(border, axis=0)


def _foreground_mask(image: np.ndarray) -> np.ndarray:
    """Largest well-separated region that differs from the border background."""
    background = _estimate_background(image)
    distance = np.linalg.norm(image - background, axis=2)
    mask = distance > FOREGROUND_THRESHOLD
    if not mask.any():
        raise ProduceNotFoundError(
            "no foreground: the produce is indistinguishable from the background"
        )

    # Open then keep the dominant blob, so speckle and a second small object do
    # not get measured as part of the fruit.
    structure = ndimage.generate_binary_structure(2, 2)
    opened = ndimage.binary_opening(mask, structure=structure, iterations=_MORPH_RADIUS)
    if not opened.any():
        opened = mask

    labels, count = ndimage.label(opened, structure=structure)
    if count == 0:
        raise ProduceNotFoundError("foreground vanished during cleanup")
    sizes = ndimage.sum_labels(
        np.ones_like(labels, dtype=np.float64), labels, index=range(1, count + 1)
    )
    largest = int(np.argmax(sizes)) + 1
    if float(sizes[largest - 1]) < 1.0:
        raise ProduceNotFoundError("foreground is a single pixel")

    return labels == largest


def guess_produce_class(image: np.ndarray, mask: np.ndarray) -> ProduceClass:
    """Predict a produce class from the foreground's CIELAB statistics.

    A colour heuristic, not a classifier. It reads the opponent axes rather than
    hue because hue is unstable for the low-chroma brown produce that has to be
    separated from red. ``unknown`` is returned rather than a wrong guess when
    the foreground is too dark to read, so the feature router can fall back.
    """
    pixels = image[mask]
    if pixels.size == 0:
        return ProduceClass.UNKNOWN

    lightness, a_axis, b_axis = _lab_stats(pixels)

    if lightness < 12.0:
        return ProduceClass.UNKNOWN
    if a_axis > 18.0:
        return ProduceClass.APPLE
    if b_axis > 24.0:
        return ProduceClass.BANANA
    if lightness < 52.0:
        return ProduceClass.KIWI
    return ProduceClass.CITRUS


def _lab_stats(pixels: np.ndarray) -> tuple[float, float, float]:
    """Mean L*, a* and b* of an ``(N, 3)`` array of sRGB values in 0..1."""
    linear = np.where(
        pixels <= 0.04045, pixels / 12.92, ((pixels + 0.055) / 1.055) ** 2.4
    )
    matrix = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = linear @ matrix.T
    scaled = xyz / np.array([0.95047, 1.00000, 1.08883])
    delta = 6.0 / 29.0
    f = np.where(scaled > delta**3, np.cbrt(scaled), scaled / (3 * delta**2) + 4.0 / 29.0)
    return (
        float((116.0 * f[:, 1] - 16.0).mean()),
        float((500.0 * (f[:, 0] - f[:, 1])).mean()),
        float((200.0 * (f[:, 1] - f[:, 2])).mean()),
    )


class ThresholdSegmenter:
    """Background-subtraction segmenter. See the module warning."""

    def segment(
        self, image: np.ndarray, class_hint: ProduceClass | str | None = None
    ) -> SegmentationResult:
        """Mask ``image`` and pick a class.

        Args:
            image: ``(H, W, 3)`` sRGB in 0..1.
            class_hint: A class the caller already knows. Wins over the guess,
                because the caller knows the produce and this heuristic does not.

        Returns:
            A :class:`SegmentationResult`.

        Raises:
            ProduceNotFoundError: When nothing clears the threshold.
        """
        mask = _foreground_mask(image)
        coverage = float(mask.mean())

        if class_hint:
            try:
                produce_class = ProduceClass(str(class_hint).strip().lower())
            except ValueError:
                produce_class = ProduceClass.UNKNOWN
        else:
            produce_class = guess_produce_class(image, mask)

        return SegmentationResult(
            mask=mask,
            produce_class=produce_class,
            family=family_for(produce_class),
            coverage=coverage,
        )


__all__ = [
    "FOREGROUND_THRESHOLD",
    "SegmentationResult",
    "Segmenter",
    "ThresholdSegmenter",
    "guess_produce_class",
]
