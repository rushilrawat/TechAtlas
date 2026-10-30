# TechAtlas

An interactive technology knowledge graph. One continuously connected map of how the
software engineering world fits together — domains, concepts, and real technologies as
nodes, with meaningful typed relationships as edges.

This repository is the implementation of the TechAtlas master specification. It is being
built incrementally, milestone by milestone, per the spec's roadmap.

## Current status

**Phase 0 — Data foundation (in progress).**

What exists today:

- A canonical graph schema (nodes / edges / aliases) defined in `data/schema`.
- A **verified representative seed subset** of the technology universe in `data/seed` —
  a real connected slice spanning every major domain. This is deliberately smaller than
  the eventual 250+ technology / 150+ concept target so that every node and edge can be
  hand-verified. See `data/seed/README.md` for the honest count.
- A dataset validation script (`scripts/validate_dataset.py`) that enforces the data
  quality rules from the spec (canonical IDs, no broken edges, valid types, etc.).
- A FastAPI backend (`backend/`) that serves the graph, nodes, neighbors, and search.
- A React + TypeScript + Sigma.js interactive graph prototype (`frontend/`).

What does **not** yet exist (and is not claimed to):

- The full 250+ technology dataset.
- Live popularity / adoption data (no ingestion of third-party sources yet).
- Wikipedia integration.
- AI project-to-stack recommendations (Phase 2).

## Repository layout

```
/data        Canonical schema + curated seed dataset (source of truth, JSON)
/scripts     Data validation, layout generation, future ingestion
/backend     FastAPI service that serves the graph API
/frontend    React + TypeScript + Sigma.js interactive graph
/docs        Architecture, schema, and methodology documentation
```

## Quick start

See `docs/development-setup.md`.
