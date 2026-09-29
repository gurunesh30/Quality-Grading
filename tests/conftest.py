"""Shared fixtures and workstream gating.

A stage of the pipeline lives on its own branch and pulls in its own heavy
dependencies: ``features`` needs OpenCV and scikit-image, ``model`` needs
scikit-learn. A checkout that has merged one branch but not another should still
have a green suite, with the missing stage reported as skipped rather than
collection error.

So workstream-dependent test *files* are excluded at collection time, before
pytest tries to import them, because the import itself is what fails.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from collections.abc import Iterator

#: Test files that cannot even be imported without a workstream, mapped to the
#: module whose importability gates them.
GATED_MODULES: dict[str, str] = {
    "test_features.py": "agrigrade.features",
    "test_model.py": "agrigrade.model.rf",
    "test_grade_pipeline.py": "agrigrade.features",
}


def _importable(module: str) -> bool:
    """Whether ``module`` and its transitive imports succeed.

    ``find_spec`` only checks the first import, so the real import is attempted.
    """
    try:
        importlib.import_module(module)
    except Exception:
        return False
    return True


def pytest_ignore_collect(collection_path: Path) -> bool:
    """Skip a test file whose workstream is not installed.

    Args:
        collection_path: The file pytest is about to collect.

    Returns:
        True to skip it.
    """
    required = GATED_MODULES.get(collection_path.name)
    return required is not None and not _importable(required)


def pytest_report_header(config: pytest.Config) -> str:
    """Say which workstreams are present, so a skip is never a mystery."""
    del config
    present = [
        name
        for name in ("agrigrade.features", "agrigrade.model.rf")
        if _importable(name)
    ]
    absent = sorted({"agrigrade.features", "agrigrade.model.rf"} - set(present))
    lines = ["agrigrade workstreams:"]
    lines += [f"  {name}: present" for name in present]
    lines += [f"  {name}: ABSENT (its tests will skip)" for name in absent]
    return "\n".join(lines)


@pytest.fixture(scope="session")
def app_module() -> ModuleType:
    """The API package, for tests that need the app factory itself."""
    return importlib.import_module("agrigrade.api")


@pytest.fixture
def rgb_frame() -> Iterator[object]:
    """A synthetic in-memory frame: a red disc on a pale background.

    Generated rather than committed, per ``tests/README.md``: raw captures are
    git-ignored and CI must not depend on a local dataset.
    """
    numpy = pytest.importorskip("numpy")
    pil_image = pytest.importorskip("PIL.Image")

    canvas = numpy.full((240, 320, 3), 0.93)
    rows, cols = numpy.mgrid[0:240, 0:320]
    canvas[((rows - 120) ** 2 + (cols - 160) ** 2) < 70**2] = (0.72, 0.13, 0.11)
    image = pil_image.fromarray((canvas * 255).astype("uint8"))

    import io

    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=92)
    yield buffer.getvalue()
