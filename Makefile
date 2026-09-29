# AgriGrade AI — backend
#
# One command starts everything:
#
#     make serve
#
# That resolves the interpreter, makes sure a trained model artifact exists, and
# runs the FastAPI surface with the feature pipeline and the Random Forest wired
# in. It is also the default target, so a bare `make` does the same thing.
#
# The repository keeps its virtualenv in `env/` (see .gitignore), so `make serve`
# works on a fresh clone with no install step as long as `env/` is populated. Use
# `make install` to build or refresh it.

# --- interpreter ------------------------------------------------------------

# Prefer the repo's own venv, whichever conventional name it uses. Falling back to
# python3 keeps the Makefile usable before `make install` has ever run.
VENV := $(firstword $(wildcard env .venv venv))
PY   := $(if $(VENV),$(VENV)/bin/python,python3)

# mypy parses stubs with the target version. Pinning it to the interpreter that is
# actually running the suite keeps it honest: CI is 3.11, a local venv may be 3.12,
# and numpy's stubs use 3.12 syntax that a 3.11 parse rejects outright.
PYVER := $(shell $(PY) -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

# The src/ layout means the package is not importable until it is installed or
# PYTHONPATH is set. Setting it here keeps every target working without an
# editable install.
export PYTHONPATH := src

# --- server -----------------------------------------------------------------

HOST   ?= 127.0.0.1
PORT   ?= 8000
# make dev — the same thing with autoreload
RELOAD ?= 0
ifeq ($(RELOAD),1)
RELOAD_FLAG := --reload
else
RELOAD_FLAG :=
endif

# --- model ------------------------------------------------------------------

ARTIFACT_NAME ?= grader
ARTIFACT      := src/agrigrade/model/artifacts/$(ARTIFACT_NAME).agrigrade.joblib

.DEFAULT_GOAL := serve
.PHONY: serve dev install venv retrain train test lint format typecheck check \
        health clean distclean help

## serve: start the API with the feature pipeline and the model loaded (default)
serve: $(ARTIFACT)
	@echo ""
	@echo "  AgriGrade AI"
	@echo "  ------------"
	@echo "  interpreter : $(PY)"
	@echo "  artifact    : $(ARTIFACT)"
	@echo "  listening   : http://$(HOST):$(PORT)"
	@echo "  health      : http://$(HOST):$(PORT)/api/v1/health"
	@echo ""
	$(PY) -m uvicorn --factory agrigrade.api:create_app --host $(HOST) --port $(PORT) $(RELOAD_FLAG)

## dev: serve with autoreload
dev:
	@$(MAKE) --no-print-directory serve RELOAD=1

## install: build the venv if absent, then install every backend dependency
venv:
	@test -d $(VENV) || python3 -m venv $(VENV)

install: venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	@echo "installed. Next: make serve"

## train: fit and save the Random Forest artifact
train:
	$(PY) -m agrigrade.model.train --save --name $(ARTIFACT_NAME)

## retrain: refit even if an artifact is already present
retrain:
	@rm -f $(ARTIFACT)
	@$(MAKE) --no-print-directory train

# Trains only when the artifact is absent, so `make serve` is idempotent.
$(ARTIFACT):
	@echo "no artifact at $(ARTIFACT); training one first"
	@$(MAKE) --no-print-directory train

## test: run the Python suite
test:
	$(PY) -m pytest

## lint: ruff over the source and tests
lint:
	$(PY) -m ruff check src tests

## format: apply ruff's safe fixes
format:
	$(PY) -m ruff check --fix src tests

## typecheck: mypy over the package, at the running interpreter's version
typecheck:
	$(PY) -m mypy --python-version $(PYVER)

## check: lint + typecheck + tests, the same gate CI runs
check: lint typecheck test

## health: query a running server
health:
	@curl -fsS http://$(HOST):$(PORT)/api/v1/health && echo ""

## clean: drop caches, keeping the trained artifact
clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

## distclean: clean, and also drop the model artifact
distclean: clean
	@rm -f src/agrigrade/model/artifacts/*.agrigrade.joblib
	@rm -f src/agrigrade/model/artifacts/*.manifest.json

## help: list the targets
help:
	@echo "AgriGrade AI backend"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /'
	@echo ""
	@echo "  Override with e.g. PORT=9000 make serve, or `make retrain` to force a refit."
