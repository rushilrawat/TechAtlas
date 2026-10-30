# TechAtlas

An interactive technology knowledge graph. One continuously connected map of how the
software engineering world fits together — domains, concepts, and real technologies as
nodes, with meaningful typed relationships as edges.

This repository is the implementation of the TechAtlas master specification. It is being
built incrementally, milestone by milestone, per the spec's roadmap.

## Current status

**Phases 0–1D complete.** Built incrementally per the spec roadmap; Phase 2 (AI
recommendations) is the only remaining milestone.

**Live demo:** https://rushilrawat.github.io/TechAtlas/ — a fully static build (the API
responses are pre-rendered to JSON by `scripts/build_static_api.py` and fetched client-side;
Wikipedia summaries, which need the live backend, degrade to the outbound link).

What exists today:

- A canonical graph schema (nodes / edges / aliases) in `data/schema`.
- The **full curated dataset** (`data/seed`, version `0.2.0`): **251 technologies, 155
  concepts, 11 domains**, all hand-verified. The validator's `--require-targets` gate
  enforces the 250+ technology / 150–170 concept breadth targets in CI. Run
  `python scripts/validate_dataset.py` for the exact live counts.
- A dataset validation script (`scripts/validate_dataset.py`) enforcing the spec's data
  quality rules (canonical IDs, no broken edges, valid types, relationship endpoint rules).
- Deterministic, community-aware offline layout (`scripts/generate_layout.py`).
- A FastAPI backend (`backend/`) serving the graph, nodes, neighbors, and search.
- A React + TypeScript + Sigma.js interactive graph with type/domain **filtering** and
  semantic zoom (`frontend/`).
- **Wikipedia integration (Phase 1C):** server-side article summaries resolved by curated
  title, with a two-tier (in-process + on-disk, version-namespaced) cache and attribution.
- **Popularity / adoption data (Phase 1D):** an offline, source-attributed ingestion
  pipeline (`scripts/popularity/`) pulling GitHub stars/activity and npm/PyPI/crates
  download counts, with deterministic scoring. Technology bubbles are sized by sourced
  adoption where available and fall back to connectivity otherwise (`size_basis` says
  which). Live-derived artifacts are gitignored, so the committed layout stays reproducible.
- **Discovery-assist tool (`scripts/discover/`):** proposes genuinely new technologies from
  Wikidata for human review, plus a weekly GitHub Actions job that auto-ingests new entries
  with safe placement (real identity + a deterministic domain + the single
  `belongs_to_domain` edge) and opens a review PR. It never invents richer relationships.

What does **not** yet exist (and is not claimed to):

- Repo X-Ray / GitHub stack scanner (Phase 1.5) — specced in
  `.kiro/specs/techatlas-phase-1.5-repo-xray/`, not yet built.
- AI project-to-stack recommendations (Phase 2) — designed and specced, not yet built.

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
