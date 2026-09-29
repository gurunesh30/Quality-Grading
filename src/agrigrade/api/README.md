# `agrigrade.api` — shared, owned by `main`

FastAPI surface consumed by the `frontend` branch. Kept thin on purpose: it
validates input, delegates to the workstreams, and serialises the result. All
grading logic lives in `features` and `model`.

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Liveness plus which workstreams are available. |
| `GET` | `/api/v1/classes` | `ProduceClass` / `ProduceFamily` / grade vocabularies, so the client mirrors the enum rather than hardcoding it. |
| `POST` | `/api/v1/segment` | **Raw request body**, not multipart. Image → mask + predicted class. |
| `POST` | `/api/v1/grade` | Multipart `image` + optional `reference_diameter_mm` / `reference_diameter_px` / `produce_class_hint` → `GradeResult`. |
| `GET` | `/api/v1/schema` | Feature names, order and units, for client-side display. |

## Boundary rules

- Import workstream symbols lazily inside the handler. `main` must import and
  boot before `feature-extraction` and `model` have merged, and a missing
  workstream returns 501 via `WorkstreamNotImplementedError` — never a 500 and
  never a startup crash.
- Serialise with a versioned envelope. Fields are added, never renamed; the
  frontend branch may lag behind a merge.
- Never log image bytes or reference measurements that could identify a farm's
  throughput.

## Running it

```bash
pip install -r requirements.txt
python -m agrigrade.model.train --save --name grader   # writes a versioned artifact
PYTHONPATH=src uvicorn --factory agrigrade.api:create_app --port 8000
```

Then point the client at it:

```bash
cd frontend && npm install
echo 'VITE_API_BASE_URL=http://localhost:8000' > .env.local
npm run dev
```

`GET /api/v1/health` reports `degraded` until every workstream imports and an
artifact exists, and names the one that is missing.

## Where the work lives

| File | Role |
| --- | --- |
| `app.py` | Application factory, routes, exception → HTTP mapping, CORS. |
| `orchestrator.py` | Decode → segment → measure → adapt → score → serialise. |
| `adapter.py` | Reconciles the two feature schemas. See the caveat below. |
| `model_runtime.py` | Lazy, cached artifact loading. |
| `schemas.py` | Pydantic models for the versioned envelope. |

## The two schemas do not agree

`features` and `model` each declare 19 slots and only seven names match, with
positions 3–13 disjoint. The Random Forest is **positional**, so a vector in the
wrong order does not raise — it scores, and the grade is wrong.

`adapter.py` is an explicit, total mapping that raises `SchemaMismatchError` if
either side moves further than the table in its docstring describes. That is an
interim measure. The durable fix is a schema reconciliation PR to `core/`.

`spot_ratio` is the one value that is derived rather than renamed: it comes from
the mask's lightness distribution, since the extractor never emits it. The
adapter flags it as such.
