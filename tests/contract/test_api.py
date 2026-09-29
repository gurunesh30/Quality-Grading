"""Wire-contract tests for the orchestration layer.

These assert the promises the React client relies on, so they are written against
the client's own types rather than against whatever the server happens to return:
envelope shape, enum values, the multipart field names, and the guarantee that a
missing workstream is a 501 rather than a crash at boot.

They do not need OpenCV. The feature stage is injected, which is exactly the
seam the orchestrator was built with, so the suite runs on a machine that has
only the API's own dependencies installed.
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from agrigrade.api import GradingOrchestrator, create_app
from agrigrade.api.adapter import (
    CALIBRATED_CONFIDENCE,
    UNCALIBRATED_CONFIDENCE,
    adapt_features,
    reconcile_feature_schemas,
)
from agrigrade.api.schemas import SCHEMA_VERSION
from agrigrade.core.enums import GRADE_ORDER
from agrigrade.core.errors import SchemaMismatchError

pytestmark = pytest.mark.api

#: The feature-extraction contract, pinned literally rather than imported.
#:
#: ``agrigrade.features`` pulls in OpenCV, and importing it here would make this
#: suite depend on an optional extra. Writing the names out also does something
#: more useful: if the extractor changes its schema, this module fails and names
#: the difference, instead of the test passing against a new shape it silently
#: agrees with.
EXTRACTED_FEATURES: dict[str, float] = {
    "true_area_cm2": 12.4,
    "equivalent_diameter_mm": 62.1,
    "estimated_volume_cm3": 11.2,
    "spectral_primary": 0.62,
    "spectral_secondary": 0.28,
    "defect_index": 0.11,
    "color_r_mean": 151.0,
    "color_g_mean": 42.0,
    "color_b_mean": 36.0,
    "color_l_mean": 45.2,
    "color_a_mean": 31.4,
    "color_b_lab_mean": 24.8,
    "color_l_std": 8.3,
    "color_a_std": 5.1,
    "glcm_homogeneity": 0.71,
    "glcm_contrast": 12.4,
    "glcm_energy": 0.52,
    "glcm_correlation": 0.61,
    "lbp_uniformity": 0.66,
}

#: What the client's ``isQualityGrade`` accepts.
CLIENT_GRADES = ("Grade A", "Grade B", "Grade C", "Reject")


def _stub_extractor(
    image: np.ndarray, mask: np.ndarray, crop_type: str, ratio: float
) -> dict[str, float]:
    """Stand in for ``extract_produce_features`` with plausible measurements."""
    return dict(EXTRACTED_FEATURES)


@pytest.fixture
def client() -> TestClient:
    """A client whose only injected seam is the feature stage."""
    return TestClient(
        create_app(GradingOrchestrator(extractor=_stub_extractor)),
        raise_server_exceptions=False,
    )


@pytest.fixture
def frame() -> bytes:
    """An in-memory JPEG: a red disc on a pale background."""
    canvas = np.full((240, 320, 3), 0.93)
    rows, cols = np.mgrid[0:240, 0:320]
    canvas[((rows - 120) ** 2 + (cols - 160) ** 2) < 70**2] = (0.72, 0.13, 0.11)
    buffer = io.BytesIO()
    Image.fromarray((canvas * 255).astype("uint8")).save(buffer, "JPEG", quality=92)
    return buffer.getvalue()


# --------------------------------------------------------------------------
# Envelope and metadata routes
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/api/v1/health", "/api/v1/classes", "/api/v1/schema"])
def test_routes_are_versioned_envelopes(client: TestClient, path: str) -> None:
    """Every response is wrapped, so the client can gate on the version."""
    response = client.get(path)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"schema_version", "data"}
    assert body["schema_version"] == SCHEMA_VERSION


def test_health_reports_each_workstream(client: TestClient) -> None:
    """Health names the workstreams, so a client can say which stage is missing."""
    data = client.get("/api/v1/health").json()["data"]
    assert set(data["workstreams"]) >= {"features", "model"}
    assert all(isinstance(v, bool) for v in data["workstreams"].values())
    assert data["status"] in ("ok", "degraded")


def test_classes_mirrors_the_core_vocabularies(client: TestClient) -> None:
    """The client mirrors these instead of hardcoding them, so they must agree."""
    data = client.get("/api/v1/classes").json()["data"]
    assert tuple(data["grades"]) == CLIENT_GRADES
    assert set(data["routing"]) == set(data["classes"])
    for produce_class, family in data["routing"].items():
        assert family in data["families"], f"{produce_class} routes to an unlisted family"


def test_schema_is_ordered_and_matches_the_model(client: TestClient) -> None:
    """``order`` is authoritative; the client renders features in that order."""
    data = client.get("/api/v1/schema").json()["data"]
    assert [entry["order"] for entry in data] == list(range(len(data)))
    names = [entry["name"] for entry in data]
    assert "true_area_cm2" in names


# --------------------------------------------------------------------------
# Grade
# --------------------------------------------------------------------------


def test_grade_returns_every_field_the_client_renders(client: TestClient, frame: bytes) -> None:
    """A payload the client's ``isGrade`` guard and ``GradeResult`` both accept."""
    response = client.post(
        "/api/v1/grade",
        files={"image": ("frame.jpg", frame, "image/jpeg")},
        data={
            "produce_class_hint": "apple",
            "reference_diameter_mm": "70",
            "reference_diameter_px": "140",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    for field in (
        "id",
        "produce_class",
        "family",
        "grade",
        "confidence",
        "grade_distribution",
        "features",
        "scale_mm_per_pixel",
        "true_area_cm2",
        "tree_votes",
        "captured_at",
    ):
        assert field in data, f"client reads {field!r} and the server omits it"

    assert data["grade"] in CLIENT_GRADES
    assert 0 <= data["confidence"] <= 100
    assert set(data["grade_distribution"]) == set(CLIENT_GRADES)
    assert abs(sum(data["grade_distribution"].values()) - 100) < 1.0
    assert data["features"], "the evidence panel needs at least one feature"
    for feature in data["features"]:
        assert set(feature) >= {"name", "value", "unit", "importance"}


def test_grade_honours_the_reference_marker(client: TestClient, frame: bytes) -> None:
    """A measured marker sets the scale; the client shows it as calibration."""
    response = client.post(
        "/api/v1/grade",
        files={"image": ("frame.jpg", frame, "image/jpeg")},
        data={"reference_diameter_mm": "70", "reference_diameter_px": "140"},
    )
    data = response.json()["data"]
    assert data["scale_mm_per_pixel"] == pytest.approx(0.5, rel=1e-6)


def test_grade_uses_the_field_name_the_client_sends(client: TestClient, frame: bytes) -> None:
    """``FormData.append("image", ...)`` is the contract; ``file`` would 422."""
    assert client.post(
        "/api/v1/grade", files={"file": ("frame.jpg", frame, "image/jpeg")}
    ).status_code == 422


def test_grade_rejects_an_undecodable_upload(client: TestClient) -> None:
    """Bad bytes are the caller's problem, so 400 rather than 500."""
    response = client.post(
        "/api/v1/grade", files={"image": ("frame.jpg", b"not an image", "image/jpeg")}
    )
    assert response.status_code == 400
    assert response.json()["error"] == "undecodable_image"


def test_grade_rejects_an_empty_upload(client: TestClient) -> None:
    """A zero-byte body is refused before any decode is attempted."""
    response = client.post(
        "/api/v1/grade", files={"image": ("frame.jpg", b"", "image/jpeg")}
    )
    assert response.status_code == 400


def test_calibration_needs_both_halves(client: TestClient, frame: bytes) -> None:
    """mm alone cannot yield a scale, and the client is told so explicitly."""
    response = client.post(
        "/api/v1/grade",
        files={"image": ("frame.jpg", frame, "image/jpeg")},
        data={"reference_diameter_mm": "70"},
    )
    assert response.status_code == 422
    assert response.json()["error"] == "calibration_error"


# --------------------------------------------------------------------------
# Segment
# --------------------------------------------------------------------------


def test_segment_takes_a_raw_body(client: TestClient, frame: bytes) -> None:
    """The client posts the Blob itself, not multipart form data."""
    response = client.post(
        "/api/v1/segment", content=frame, headers={"content-type": "image/jpeg"}
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert 0.0 <= data["mask_coverage"] <= 1.0
    assert data["produce_class"] in client.get("/api/v1/classes").json()["data"]["classes"]


def test_segment_overlay_is_opt_in(client: TestClient, frame: bytes) -> None:
    """The overlay is a base64 PNG, and only when asked for, to keep payloads small."""
    plain = client.post("/api/v1/segment", content=frame).json()["data"]
    assert plain["overlay_png_base64"] is None

    with_overlay = client.post(
        "/api/v1/segment", content=frame, params={"overlay": "true"}
    ).json()["data"]
    assert with_overlay["overlay_png_base64"]


# --------------------------------------------------------------------------
# Adapter
# --------------------------------------------------------------------------


@pytest.fixture
def model_schema(client: TestClient) -> tuple[str, ...]:
    """The loaded model's declared feature order."""
    return tuple(entry["name"] for entry in client.get("/api/v1/schema").json()["data"])


def test_adapter_projects_onto_the_model_schema(
    client: TestClient, model_schema: tuple[str, ...]
) -> None:
    """The RF is positional, so the vector must be exactly the model schema."""
    adapted = adapt_features(
        EXTRACTED_FEATURES,
        model_schema,
        crop_type="apple",
        mm_per_pixel=0.5,
        calibrated=True,
        spot_ratio=0.04,
    )
    assert tuple(adapted) == model_schema
    assert adapted["volume_cm3"] == EXTRACTED_FEATURES["estimated_volume_cm3"]
    assert adapted["mean_l"] == EXTRACTED_FEATURES["color_l_mean"]
    assert adapted["family_red_smooth"] == 1.0
    assert adapted["family_yellow_green"] == 0.0
    assert adapted["calibration_confidence"] == CALIBRATED_CONFIDENCE


def test_adapter_flags_an_uncalibrated_capture(model_schema: tuple[str, ...]) -> None:
    """A guess at the scale is reported as a guess, not as a measurement."""
    adapted = adapt_features(
        EXTRACTED_FEATURES,
        model_schema,
        crop_type="apple",
        mm_per_pixel=0.5,
        calibrated=False,
        spot_ratio=0.0,
    )
    assert adapted["calibration_confidence"] == UNCALIBRATED_CONFIDENCE


def test_adapter_refuses_to_guess_a_missing_slot(model_schema: tuple[str, ...]) -> None:
    """A dropped feature is a contract change for a human, not a default value."""
    incomplete = dict(EXTRACTED_FEATURES)
    del incomplete["defect_index"]
    with pytest.raises(SchemaMismatchError, match="defect_index"):
        adapt_features(
            incomplete,
            model_schema,
            crop_type="apple",
            mm_per_pixel=0.5,
            calibrated=True,
            spot_ratio=0.0,
        )


def test_adapter_rejects_a_schema_it_cannot_fill(model_schema: tuple[str, ...]) -> None:
    """An unknown slot is refused rather than dropped, which would shift the vector."""
    drifted = (*model_schema, "some_new_slot")
    with pytest.raises(SchemaMismatchError, match="some_new_slot"):
        adapt_features(
            EXTRACTED_FEATURES,
            drifted,
            crop_type="apple",
            mm_per_pixel=0.5,
            calibrated=True,
            spot_ratio=0.0,
        )


def test_reconciliation_reports_the_drift() -> None:
    """The delta is published, because the real fix belongs in ``core/``."""
    report = reconcile_feature_schemas(
        tuple(EXTRACTED_FEATURES), ("volume_cm3", "spot_ratio", "defect_index")
    )
    assert report["identical"] is False
    assert report["model_count"] == 3
    assert "estimated_volume_cm3" in report["feature_only"]
    assert "volume_cm3" in report["model_only"]


# --------------------------------------------------------------------------
# Boundary rules
# --------------------------------------------------------------------------


def test_app_boots_without_the_optional_workstreams() -> None:
    """Importing and constructing the app must not need OpenCV or scikit-learn.

    This is the property that lets ``main`` ship an API before the feature stage
    has landed, and it is easy to lose by adding a module-level import.
    """
    from agrigrade.api import features_extractor, model_reporting

    with pytest.raises(Exception) as missing_features:
        features_extractor()
    assert "workstream" in str(missing_features.value).lower()

    assert callable(model_reporting()[0])


def test_missing_feature_stage_surfaces_as_501(frame: bytes) -> None:
    """Without an injected extractor and without OpenCV, the route 501s."""
    bare = TestClient(create_app(), raise_server_exceptions=False)
    response = bare.post(
        "/api/v1/grade",
        files={"image": ("frame.jpg", frame, "image/jpeg")},
        data={"produce_class_hint": "apple"},
    )
    assert response.status_code == 501
    assert response.json()["error"] == "workstream_not_implemented"


def test_grade_ladder_order_is_the_canonical_one() -> None:
    """Positions in ``GRADE_ORDER`` are part of the contract, not an implementation detail."""
    assert tuple(GRADE_ORDER) == CLIENT_GRADES
