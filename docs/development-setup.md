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
make data          # compile + validate (+1B targets) + lay out the dataset
make popularity    # (Phase 1D) fetch public metrics + score -> data/popularity.json
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

### Optional: popularity sizing (Phase 1D)

By default technologies are sized by graph connectivity. To size by **sourced adoption**
instead, run the offline popularity pipeline, then re-lay-out:

```bash
cd scripts/popularity && python ingest.py && python score.py   # -> data/popularity.json
python scripts/generate_layout.py                              # re-lay-out, sized by score
```

`make popularity` wraps the first step. The pipeline fetches public metrics (GitHub
stars/activity, npm/PyPI/crates downloads) for technologies that carry a `repo`/`package`
mapping, recording each metric's source, timestamp, license, and normalization in
`data/popularity.json`. Technologies with no mapped source have **no score** and fall back
to connectivity sizing — nothing is invented. `data/popularity.json` and the `raw/` and
`history/` snapshots are generated artifacts (gitignored) and derived from live third-party
data, so they are not committed and the committed `layout.json` stays connectivity-based
and CI-reproducible. See `data/popularity/SOURCES.md` for the source list and licensing.

### Optional: discovery-assist (proposing new technologies)

Growing the graph is still a human-curated process, but the discovery-assist tool automates
the *research*. It scans authoritative structured sources (Wikidata; optionally popular
GitHub/package entries) and proposes candidate technologies for review — it never writes
`data/seed/*` directly and never invents domains or relationships.

```bash
make discover                       # -> data/discovery/candidates.json (NEEDS_REVIEW)
# review the file: set primary_domain, add typed edges, flip status to "APPROVED"
make promote                        # approved+complete candidates -> the curated commit path
make data                           # rebuild + validate + lay out
```

Under the hood `make discover` runs `python -m discover.discover` (from `scripts/`) and
`make promote` runs `python -m discover.promote`, which hands approved candidates to
`scripts/expand/_apply.py` — the same dedup + edge-endpoint pre-check every manual batch
uses. A candidate is only promotable once a human has given it a `primary_domain` and at
least one typed edge; incomplete ones are refused. `data/discovery/` is gitignored
(source-derived proposals, not committed).

### Hands-off: the weekly discovery PR

If you'd rather not touch it at all, a scheduled GitHub Actions workflow
(`.github/workflows/discovery.yml`, every Monday) runs **auto-ingest** and opens a pull
request with any genuinely new technologies. Auto-ingest (`make discover-auto` locally)
adds each new node with **safe placement only**:

- real identity from Wikidata (name, `wikidata_id`, `wikipedia_title`, `official_url`,
  `node_subtype`),
- a **deterministic** `primary_domain` from the Wikidata entity class (an auditable rule in
  `scripts/discover/auto_ingest.py`, not a guess),
- exactly one auto-created edge per node: `belongs_to_domain` (the one relationship that is
  definitionally true, so the node is never an orphan).

Every auto-added node is marked `auto_added: true`. Richer typed edges (`implements`,
`alternative_to`, `written_in`, `commonly_used_with`, …) are **never** auto-generated —
that stays editorial judgment. So the day-to-day is: the bot opens a PR, CI validates it,
you glance and merge (optionally adding a few hand-curated edges first). The graph only ever
gains real, source-backed data; it never gains invented relationships.

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
- `TECHATLAS_WIKIPEDIA_LANG` — Wikipedia language edition for summaries (default: `en`).
- `TECHATLAS_SUMMARY_TTL_DAYS` — days a cached summary stays fresh before refetch
  (default: `30`). Summaries are cached on disk under `data/cache/wikipedia/<version>/`
  (gitignored, namespaced by dataset version) and in an in-process LRU.

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

### Repo X-Ray scanner (Phase 1.5A, backend)

The backend can scan a public GitHub repository and return evidence-backed technology
detections mapped onto the existing graph. It is **deterministic static analysis** — it
never executes repository code or installs dependencies.

```bash
# requires the backend running (uvicorn app.main:app) — NOT available on the static
# GitHub Pages build, which has no backend.
curl -s -X POST localhost:8000/api/v1/repository-scans \
  -H 'content-type: application/json' \
  -d '{"repository_url":"https://github.com/owner/repo"}' | jq
# then: GET /api/v1/repository-scans/{scan_id}
```

GitHub API access:

- **`GITHUB_TOKEN`** (server-side env) is optional for local tinkering but effectively
  **required for real use**: unauthenticated GitHub allows only ~60 requests/hour/IP, and
  a single scan uses ~10–30. With a token the limit is 5000/hour. The token is read only
  by the backend (`scanner/github_client.py`) and never reaches the frontend.
- Results are cached on disk by `repository + commit SHA + scanner version + mapping
  version` under `data/cache/scans/` (gitignored, atomic writes). Re-scanning the same
  commit is a cache hit.
- Budgets: ≤300 files inspected, ≤120 source files, ≤256 KB/file, bounded GitHub requests;
  a truncated tree or exhausted budget yields a scan explicitly labeled `partial`.

Supported detection (1.5A): JavaScript/TypeScript (`package.json`, lockfiles,
`tsconfig`/`vite`/`next`/`angular` config, source imports), Python
(`pyproject.toml`/`requirements*.txt`/`poetry.lock`/`uv.lock`, source imports), Docker
(`Dockerfile`/compose), and GitHub Actions (`.github/workflows/*`). More ecosystems plug
in as new modules under `backend/app/scanner/manifest_parsers/`.


### Repo X-Ray UI (Phase 1.5B, frontend)

The scanner is surfaced in the UI as a **Repo X-Ray** entry point that highlights a
repository's detected technologies across the existing graph (Universe Highlight View).

- The entry point is **gated on `VITE_SCANNER_API`**: unset means the button is hidden and
  the app behaves exactly as before (this is the public GitHub Pages deploy); set means it
  points at a reachable scanner backend base URL (e.g. `/api/v1` behind the dev proxy, or a
  hosted backend's `https://host/api/v1`).
- Local dev with the backend running: start the FastAPI backend (`make backend`, set
  `GITHUB_TOKEN` for real use), then start the frontend dev server with
  `VITE_SCANNER_API=/api/v1` so the proxy forwards `/api` to the backend.
- The overlay is a temporary render-state layer: detected nodes keep their domain color and
  size and gain a status-colored ring (green=confirmed, blue=declared, amber=inferred,
  neutral=related); unrelated nodes/edges dim; only **existing** graph edges between two
  detected nodes are highlighted (co-occurrence never invents edges). Exiting restores the
  normal graph; the canonical node/edge data is never mutated.

Frontend tests: unit (`scanOverlay`, `scanner` client, `RepoXrayPanel`) plus two Playwright
suites. The default scanner-DISABLED smoke build verifies the entry is hidden and the static
site is intact; a scanner-ENABLED build drives the full scan/highlight/evidence/exit flow
against mocked responses (`e2e` and `e2e:xray` npm scripts).
