# TechAtlas

An interactive technology knowledge graph. One continuously connected map of how the
software engineering world fits together — domains, concepts, and real technologies as
nodes, with meaningful typed relationships as edges.

This repository is the implementation of the TechAtlas master specification. It is being
built incrementally, milestone by milestone, per the spec's roadmap.

## Current status

**Live demo:** https://rushilrawat.github.io/TechAtlas/ — a fully static build (the API
responses are pre-rendered to JSON by `scripts/build_static_api.py` and fetched client-side;
Wikipedia summaries are fetched in the browser from the Wikipedia REST API).

What exists today:

- **Curated dataset** (`data/seed`, version `0.4.0`): **20 domains, 290 technologies, 352
  concepts and 1,272 typed relationships**, hand-verified. Run
  `python scripts/validate_dataset.py` for the exact live counts; `--require-targets`
  enforces the breadth targets in CI.
- **Radial Explore atlas** (React + TypeScript + Sigma.js): domain sectors, semantic zoom,
  a connections panel, arrow-key exploration, fullscreen, light/dark themes, filters,
  Compare mode and guided learning paths.
- **Search** with typo tolerance ("kubernets"), multi-word and description matching, and
  recent/suggested starting points.
- **Shareable pages**: every domain, technology and concept has a crawlable page with an
  Open Graph card, JSON-LD and a plain-HTML fallback, plus `sitemap.xml` and `robots.txt`.
- **FastAPI backend** (`backend/`) serving the graph, nodes, neighbors, search and
  Wikipedia summaries (two-tier, version-namespaced cache).
- **Popularity / adoption data:** an offline, source-attributed ingestion pipeline
  (`scripts/popularity/`) pulling GitHub and npm/PyPI/crates signals.
- **Discovery-assist** (`scripts/discover/`): a weekly job proposes new technologies from
  Wikidata and opens a review PR. It never invents richer relationships.
- **Repo X-Ray**: paste a public GitHub repo URL to highlight its detected stack. Needs the
  live backend, so it is gated behind `VITE_SCANNER_API`.

What does **not** yet exist (and is not claimed to):

- AI project-to-stack recommendations (Phase 2) — designed and specced, not yet built.

Production deployment (Render Free) is prepared (`render.yaml`, `backend/Dockerfile`, and
production safeguards: per-IP rate limiting, a concurrency gate, a scan deadline, a bounded
result store, strict CORS). The public GitHub Pages site keeps Repo X-Ray hidden until the
backend URL is configured (`SCANNER_API_URL` repo variable). Exact setup +
verification steps: `docs/deployment-scanner.md`. Backend runtime dependencies are pinned
in `backend/requirements.lock` (regenerate with the command at its top after editing
`requirements.txt`), and CI builds the Docker image and checks `/health` on every PR.

See `docs/known-issues.md` for tracked low-severity issues.

## Repository layout

```
/data        Canonical schema + curated dataset (source of truth, JSON)
/scripts     Validation, layout, popularity ingestion, discovery-assist
/backend     FastAPI service that serves the graph API (+ Wikipedia summaries)
/frontend    React + TypeScript + Sigma.js interactive graph
/docs        Architecture, schema, and methodology documentation
/.kiro/specs Requirements / design / tasks for each milestone
```

The GitHub Pages deploy runs a Playwright browser smoke test on the built site (graph
renders, nodes select, detail panel opens) as a gate before publishing — an HTTP 200 is
not treated as deployment success.

## Quick start

See `docs/development-setup.md`.
