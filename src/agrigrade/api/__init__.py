"""agrigrade.api — the FastAPI orchestration layer.

Kept thin by design: it validates input, delegates to the workstreams and
serialises the result. All grading logic lives in ``features`` and ``model``,
and the schema reconciliation between them lives in :mod:`agrigrade.api.adapter`.

    from agrigrade.api import create_app
    app = create_app()

The workstream imports are lazy, so this package imports without the ``features``
or ``model`` extras installed. A route whose workstream is missing answers 501
rather than crashing the process at startup.
"""

from agrigrade.api.app import MAX_UPLOAD_BYTES, create_app
from agrigrade.api.orchestrator import (
    Calibration,
    GradingOrchestrator,
    ImageDecodeError,
    decode_image,
    features_extractor,
    model_reporting,
)
from agrigrade.api.schemas import SCHEMA_VERSION

__all__ = [
    "MAX_UPLOAD_BYTES",
    "SCHEMA_VERSION",
    "Calibration",
    "GradingOrchestrator",
    "ImageDecodeError",
    "create_app",
    "decode_image",
    "features_extractor",
    "model_reporting",
]
