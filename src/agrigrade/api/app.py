"""FastAPI application factory.

Wires the routes, the versioned envelope and the exception mapping. The boundary
rules from ``src/agrigrade/api/README.md`` are implemented here:

* Workstream symbols are imported lazily inside the handlers, so this module
  imports with neither the ``features`` nor the ``model`` extra installed. A
  missing workstream answers **501** via
  :class:`~agrigrade.core.errors.WorkstreamNotImplementedError`, never a 500 and
  never a startup crash.
* Every response is a versioned envelope. Fields are added, never renamed.
* No handler logs image bytes or reference measurements.
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from agrigrade.api import model_runtime
from agrigrade.api.orchestrator import (
    GradingOrchestrator,
    ImageDecodeError,
    decode_image,
)
from agrigrade.api.schemas import (
    SCHEMA_VERSION,
    ClassCatalog,
    Envelope,
    ErrorBody,
    FeatureSchemaEntry,
    GradeResult,
    HealthStatus,
    SegmentResult,
)
from agrigrade.core.enums import CLASS_TO_FAMILY, GRADE_ORDER
from agrigrade.core.errors import (
    AgriGradeError,
    CalibrationError,
    ContractError,
    ModelNotLoadedError,
    ProduceNotFoundError,
    SchemaMismatchError,
    WorkstreamNotImplementedError,
)
from agrigrade.segmentation import ThresholdSegmenter

#: Reject anything larger before decoding. A phone frame is a few megapixels.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

#: Upper bound for the number of trees echoed in a response.
TREE_VOTE_SAMPLE = 12

#: Origins allowed to call the API from a browser.
#:
#: The Vite dev server runs on a different port from the API, so without this the
#: browser blocks the response. The list is overridable via ``AGRIGRADE_CORS_ORIGINS``
#: (comma separated) for a deployment that serves the built app from elsewhere.
#: Binding to localhost only means this does not expose the API on the network.
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)

#: The upload parameter. Hoisted to module scope because FastAPI needs the
#: ``File()`` marker object itself in the default, not the result of a call
#: evaluated per request.
IMAGE_UPLOAD = File(..., description="Captured frame")

DESCRIPTION = """
The orchestration layer for AgriGrade AI.

`POST /api/v1/grade` runs a captured frame through segmentation, the
class-conditioned feature pipeline and the Random Forest, and returns the grade
with the confidence, the full grade distribution, the features that drove it and
the model's per-sample attributions.

The ensemble is fitted on synthetic data until real captures are available, so a
grade from this server is a real decision on real measurements against weights
that have never seen a photograph. `GET /api/v1/health` says so explicitly.
"""


def _error(status: int, code: str, detail: str) -> JSONResponse:
    """A non-2xx body the client can read a reason out of."""
    return JSONResponse(
        status_code=status,
        content=ErrorBody(error=code, detail=detail).model_dump(),
    )


def _install_error_handlers(app: FastAPI) -> None:
    """Map the domain's exceptions onto HTTP codes.

    A grading failure has a reason, and a client that is told "Grade B" with no
    supporting evidence is exactly the problem this project exists to fix. So
    every expected failure carries a message rather than a bare status code.
    """

    @app.exception_handler(WorkstreamNotImplementedError)
    async def _workstream(_request: Request, exc: WorkstreamNotImplementedError) -> JSONResponse:
        return _error(501, "workstream_not_implemented", str(exc))

    @app.exception_handler(ModelNotLoadedError)
    async def _model_missing(_request: Request, exc: ModelNotLoadedError) -> JSONResponse:
        return _error(503, "model_not_loaded", str(exc))

    @app.exception_handler(SchemaMismatchError)
    async def _schema(_request: Request, exc: SchemaMismatchError) -> JSONResponse:
        return _error(422, "schema_mismatch", str(exc))

    @app.exception_handler(ProduceNotFoundError)
    async def _not_found(_request: Request, exc: ProduceNotFoundError) -> JSONResponse:
        return _error(422, "produce_not_found", str(exc))

    @app.exception_handler(CalibrationError)
    async def _calibration(_request: Request, exc: CalibrationError) -> JSONResponse:
        return _error(422, "calibration_error", str(exc))

    @app.exception_handler(ContractError)
    async def _contract(_request: Request, exc: ContractError) -> JSONResponse:
        return _error(422, "contract_violation", str(exc))

    @app.exception_handler(ImageDecodeError)
    async def _decode(_request: Request, exc: ImageDecodeError) -> JSONResponse:
        return _error(400, "undecodable_image", str(exc))

    @app.exception_handler(_EmptyUploadError)
    async def _empty(_request: Request, exc: _EmptyUploadError) -> JSONResponse:
        return _error(400, "invalid_upload", str(exc))

    @app.exception_handler(_UploadTooLargeError)
    async def _large(_request: Request, exc: _UploadTooLargeError) -> JSONResponse:
        return _error(413, "payload_too_large", str(exc))

    @app.exception_handler(AgriGradeError)
    async def _domain(_request: Request, exc: AgriGradeError) -> JSONResponse:
        return _error(500, "internal_error", str(exc))


async def _read_upload(file: UploadFile) -> bytes:
    """Read an upload, refusing anything oversized.

    The size is checked while streaming rather than after buffering, so a large
    body is dropped instead of being held in memory first.
    """
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(65536):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise ValueError(f"image exceeds the {MAX_UPLOAD_BYTES} byte limit")
        chunks.append(chunk)
    if total == 0:
        raise ValueError("image is empty")
    return b"".join(chunks)


async def _read_body(request: Request) -> bytes:
    """Read a raw request body, refusing empty and oversized payloads."""
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise _UploadTooLargeError(
                f"image exceeds the {MAX_UPLOAD_BYTES} byte limit"
            )
        chunks.append(chunk)
    if total == 0:
        raise _EmptyUploadError("image is empty")
    return b"".join(chunks)


class _EmptyUploadError(ValueError):
    """The request carried no bytes."""


class _UploadTooLargeError(ValueError):
    """The request body exceeded the configured limit."""


def create_app(
    orchestrator: GradingOrchestrator | None = None,
    *,
    cors_origins: Sequence[str] | None = None,
) -> FastAPI:
    """Build the application.

    Args:
        orchestrator: Injected in tests. Production resolves the model lazily
            from the artifact directory on the first grading request.
        cors_origins: Browser origins to allow. Defaults to
            ``AGRIGRADE_CORS_ORIGINS`` if set, else :data:`DEFAULT_CORS_ORIGINS`.

    Returns:
        A configured :class:`~fastapi.FastAPI`.
    """
    if cors_origins is None:
        configured = os.environ.get("AGRIGRADE_CORS_ORIGINS", "").strip()
        cors_origins = (
            [origin.strip() for origin in configured.split(",") if origin.strip()]
            if configured
            else DEFAULT_CORS_ORIGINS
        )

    app = FastAPI(
        title="AgriGrade AI",
        version=SCHEMA_VERSION,
        description=DESCRIPTION,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    runner = orchestrator or GradingOrchestrator()
    _install_error_handlers(app)

    @app.get("/api/v1/health", response_model=Envelope[HealthStatus])
    def health() -> Envelope[HealthStatus]:
        """Liveness, plus which workstreams are importable right now."""
        workstreams = model_runtime.workstream_status()
        model_ready = False
        try:
            _ = runner.model
            model_ready = True
        except AgriGradeError:
            pass
        status = "ok" if all(workstreams.values()) and model_ready else "degraded"
        return Envelope[HealthStatus](
            data=HealthStatus(
                status=status,
                workstreams={**workstreams, "model_artifact": model_ready},
            )
        )

    @app.get("/api/v1/classes", response_model=Envelope[ClassCatalog])
    def classes() -> Envelope[ClassCatalog]:
        """The vocabularies, so the client mirrors the enums instead of hardcoding them."""
        return Envelope[ClassCatalog](
            data=ClassCatalog(
                classes=list(CLASS_TO_FAMILY),
                families=list(dict.fromkeys(CLASS_TO_FAMILY.values())),
                grades=list(GRADE_ORDER),
                routing={cls: fam for cls, fam in CLASS_TO_FAMILY.items()},
            )
        )

    @app.get("/api/v1/schema", response_model=Envelope[list[FeatureSchemaEntry]])
    def feature_schema() -> Envelope[list[FeatureSchemaEntry]]:
        """Model input slots in order, read from the loaded artifact.

        Raises:
            WorkstreamNotImplementedError: 501 when the model workstream is absent.
            ModelNotLoadedError: 503 when no artifact has been trained yet.
        """
        from agrigrade.model.schema import load_schema  # local: model is optional

        schema = load_schema()
        return Envelope[list[FeatureSchemaEntry]](
            data=[
                FeatureSchemaEntry(
                    name=spec.name,
                    order=order,
                    unit=spec.unit or None,
                    description=spec.description,
                )
                for order, spec in enumerate(schema)
            ]
        )

    @app.post("/api/v1/segment", response_model=Envelope[SegmentResult])
    async def segment(
        request: Request,
        overlay: bool = False,
        produce_class_hint: str | None = None,
    ) -> Envelope[SegmentResult] | JSONResponse:
        """Mask a frame and predict its produce class.

        The frame is posted as the **raw request body**, not as multipart form
        data. That is the shape the client already uses, and it keeps a single
        content type on a route that otherwise does nothing multipart.

        Raises:
            ValueError: 400, the body is empty or too large.
            ImageDecodeError: 400, the bytes are not a decodable image.
        """
        data = await _read_body(request)
        image = decode_image(data)
        result = ThresholdSegmenter().segment(image, produce_class_hint)
        return Envelope[SegmentResult](
            data=SegmentResult(
                produce_class=result.produce_class,
                family=result.family,
                mask_coverage=round(result.coverage, 6),
                overlay_png_base64=(
                    result.overlay_png_base64(image) if overlay else None
                ),
            )
        )

    @app.post("/api/v1/grade", response_model=Envelope[GradeResult])
    async def grade(
        image: UploadFile = IMAGE_UPLOAD,
        produce_class_hint: str | None = Form(None),
        reference_diameter_mm: float | None = Form(None),
        reference_diameter_px: float | None = Form(None),
    ) -> Envelope[GradeResult] | JSONResponse:
        """Grade one frame end to end.

        Raises:
            WorkstreamNotImplementedError: 501, a workstream is not importable.
            ModelNotLoadedError: 503, no trained artifact.
            ProduceNotFoundError: 422, no foreground in the frame.
        """
        try:
            data = await _read_upload(image)
        except ValueError as exc:
            return _error(400, "invalid_upload", str(exc))

        result, _segmentation = runner.grade(
            data,
            class_hint=produce_class_hint,
            reference_diameter_mm=reference_diameter_mm,
            reference_diameter_px=reference_diameter_px,
        )
        return Envelope[GradeResult](data=result)

    return app


__all__ = ["MAX_UPLOAD_BYTES", "TREE_VOTE_SAMPLE", "create_app"]
