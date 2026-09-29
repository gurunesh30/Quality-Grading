"""Wire types for the HTTP surface.

These mirror ``frontend/src/types/api.ts`` field for field. The client unwraps a
versioned envelope and then runs a runtime guard, so a renamed or dropped field
breaks the UI at runtime rather than at compile time. Two rules follow from that:

* Fields are **added, never renamed**. The frontend branch may lag a merge.
* Unknown extra fields are tolerated by the client, so additive diagnostics are
  free.

``SCHEMA_VERSION`` is the contract version, bumped on a breaking change. It is
independent of the model's own ``SCHEMA_VERSION`` in
:mod:`agrigrade.model.schema`: one versions the HTTP payload, the other versions
the feature vector the ensemble is positional over.
"""

from __future__ import annotations

from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from agrigrade.core.enums import ProduceClass, ProduceFamily, QualityGrade

#: Wire contract version. Mirrored by ``frontend/src/types/api.ts``.
SCHEMA_VERSION = "1.0"

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    """Versioned wrapper present on every response.

    The frontend rejects a payload without a ``data`` key, so this is not
    optional decoration: it is the first thing the runtime guard checks.
    """

    model_config = ConfigDict(populate_by_name=True)

    schema_version: str = SCHEMA_VERSION
    data: T


class HealthStatus(BaseModel):
    """Liveness plus which workstreams are importable in this process."""

    status: Annotated[str, Field(pattern="^(ok|degraded)$")]
    workstreams: dict[str, bool]
    #: ``synthetic_baseline`` when the loaded weights were fitted on generated
    #: data, so a client can warn instead of implying photographic training.
    provenance: str = "unknown"


class ClassCatalog(BaseModel):
    """Vocabulary mirrors, so the client need not hardcode the enums."""

    classes: list[ProduceClass]
    families: list[ProduceFamily]
    grades: list[QualityGrade]
    routing: dict[ProduceClass, ProduceFamily]


class FeatureSchemaEntry(BaseModel):
    """One column of the model's input vector."""

    name: str
    order: int
    unit: str | None = None
    description: str


class FeatureValue(BaseModel):
    """A measured feature plus the model's attribution for it.

    ``importance`` is the per-sample occlusion contribution from
    :mod:`agrigrade.model.xai`, normalised to 0..1 against the largest
    magnitude in this response so the client can scale bars without knowing the
    distribution.
    """

    name: str
    value: float
    unit: str | None = None
    importance: Annotated[float, Field(ge=0.0, le=1.0)]


class SegmentResult(BaseModel):
    """Foreground mask summary and the predicted class."""

    produce_class: ProduceClass
    family: ProduceFamily
    mask_coverage: Annotated[float, Field(ge=0.0, le=1.0)]
    overlay_png_base64: str | None = None


class TreeVote(BaseModel):
    """One tree's vote, so ensemble agreement is inspectable."""

    grade: QualityGrade
    probability: Annotated[float, Field(ge=0.0, le=1.0)]


class Attribution(BaseModel):
    """Local, additive-by-construction explanation of the winning grade.

    Contributions come from single-feature occlusion and are **not** additive
    across features; the ranking is the reliable output. The client is not
    required to render this, but shipping it makes a disagreement debuggable.
    """

    name: str
    label: str
    value: float
    baseline: float
    unit: str | None = None
    contribution: float
    direction: str


class GradeResult(BaseModel):
    """A complete grading decision, with the evidence behind it."""

    id: str
    produce_class: ProduceClass
    family: ProduceFamily
    grade: QualityGrade
    confidence: Annotated[float, Field(ge=0.0, le=100.0)]
    grade_distribution: dict[QualityGrade, Annotated[float, Field(ge=0.0, le=100.0)]]
    features: list[FeatureValue]
    scale_mm_per_pixel: float | None = None
    true_area_cm2: float | None = None
    tree_votes: list[TreeVote]
    captured_at: str

    # --- additive diagnostics, safe for older clients to ignore ---------
    is_confident: bool
    abstain_reason: str
    margin: Annotated[float, Field(ge=0.0, le=1.0)]
    entropy: Annotated[float, Field(ge=0.0, le=1.0)]
    explanation: list[Attribution] = Field(default_factory=list)
    model: ModelInfo | None = None


class ModelInfo(BaseModel):
    """Provenance of the ensemble that produced a decision."""

    schema_version: int
    n_estimators: int
    n_features: int
    checksum: str
    #: ``synthetic_baseline`` | ``captures`` | ``unknown``. A client can show a
    #: warning when the weights have never seen a photograph.
    provenance: str = "unknown"
    #: The training run's own note, verbatim.
    notes: str = ""


class ErrorBody(BaseModel):
    """Non-2xx payloads, so the client can surface a reason rather than a 500."""

    error: str
    detail: str


GradeResult.model_rebuild()
