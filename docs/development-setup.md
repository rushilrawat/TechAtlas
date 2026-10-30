# Development setup

TechAtlas is a monorepo with a Python (FastAPI) backend and a React/TypeScript/Vite
frontend. The curated dataset lives in `/data` and is compiled + validated by scripts.

## Prerequisites

- Python 3.11+
- Node.js 20+
- GNU Make (preinstalled on macOS/Linux) — optional but convenient
- (optional) `uv` for faster Python envs

## Quick start (recommended)

One-time install, then run everything with a single command:

```bash
make setup      # create backend venv + install, and npm install the frontend
make dev        # build data if missing, then run backend (:8000) + frontend (:5173)
```

Open http://localhost:5173. Press Ctrl-C to stop both servers.

Other useful targets (`make help` lists them all):

```bash
make dev-rebuild   # like `make dev` but always rebuilds the dataset first
make data          # compile + validate + lay out the dataset
make test          # backend (pytest) + frontend (vitest)
make lint          # ruff + tsc + eslint
make build         # production frontend build
make backend       # run only the API
make frontend      # run only the frontend
make clean         # remove generated data + dist
```

Ports are overridable: `make dev BACKEND_PORT=9000 FRONTEND_PORT=3000`.

You can also run the launcher directly without Make: `./dev.sh` (or `./dev.sh
--rebuild-data`). It waits for the backend `/health` endpoint before starting the
frontend and tears down what it started on exit. It is port-aware:

- If a healthy TechAtlas backend is already running on the backend port, it is
  reused instead of starting a duplicate (and left running when you Ctrl-C).
- If a port is occupied by something else, the script stops with a clear message
  instead of silently picking another port. Override with
  `TECHATLAS_BACKEND_PORT` / `TECHATLAS_FRONTEND_PORT`.

---

The sections below document the manual steps that the Make targets wrap, in case you
want to run pieces individually.

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
