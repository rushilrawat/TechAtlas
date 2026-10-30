# Development setup

TechAtlas is a monorepo with a Python (FastAPI) backend and a React/TypeScript/Vite
frontend. The curated dataset lives in `/data` and is compiled + validated by scripts.

## Prerequisites

- Python 3.11+
- Node.js 20+
- (optional) `uv` for faster Python envs

## 1. Build and validate the dataset

The API serves `data/graph.json`, and the frontend uses `data/layout.json`. Generate
both from the curated seed fragments:

```bash
python scripts/build_dataset.py      # compile data/seed/*.json -> data/graph.json
python scripts/validate_dataset.py   # enforce data-quality rules (exits 1 on error)
python scripts/generate_layout.py    # deterministic coordinates -> data/layout.json
```

`data/graph.json` and `data/layout.json` are generated artifacts. Re-run these three
scripts whenever you edit anything under `data/seed/`.

## 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest -q              # run tests
ruff check app tests   # lint
uvicorn app.main:app --reload --port 8000
```

API docs (OpenAPI) are then at http://localhost:8000/docs.

Config via environment variables:

- `TECHATLAS_CORS_ORIGINS` — comma-separated allowed origins (default: Vite dev server).

## 3. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api to :8000)
npm run typecheck
npm run lint
npm test
npm run build
```

Point the dev proxy at a non-default backend with `TECHATLAS_API=http://host:port npm run dev`.

## Full check (what CI runs)

```bash
python scripts/build_dataset.py && python scripts/validate_dataset.py && python scripts/generate_layout.py
(cd backend && ruff check app tests ../scripts && pytest -q)
(cd frontend && npm run typecheck && npm run lint && npm test && npm run build)
```
