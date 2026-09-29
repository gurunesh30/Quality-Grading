"""agrigrade.segmentation — foreground masks and predicted produce classes.

Currently a background-subtraction stand-in; see
:mod:`agrigrade.segmentation.placeholder` for what it does and does not do. The
YOLOv8 adapter this directory is reserved for lands behind the same
:class:`Segmenter` protocol.
"""

from agrigrade.segmentation.placeholder import (
    SegmentationResult,
    Segmenter,
    ThresholdSegmenter,
    guess_produce_class,
)

__all__ = [
    "SegmentationResult",
    "Segmenter",
    "ThresholdSegmenter",
    "guess_produce_class",
]
