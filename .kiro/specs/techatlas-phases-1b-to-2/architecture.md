# Architecture — TechAtlas Phases 1B → 2 (Option A)

**Status:** Proposal for review. Complements the repo-level `docs/architecture.md` (which
records what exists today). This document records the *target* architecture for Phases 1B–2
and will be folded into `docs/architecture.md` as each phase lands. No code is authorized
by this document.

## 1. Guiding constraint: Option A (confirmed)

TechAtlas remains **one connected graph served from validated JSON in memory**, behind the
narrow `GraphService` boundary (`backend/app/graph_service.py`). This is the reviewer-
confirmed Option A.

- PostgreSQL is a **future option, not a current dependency**. Nothing in these phases may
  assume a database. The `GraphService` boundary stays narrow precisely so a SQL-backed
  implementation could replace it later without touching routes or the frontend.
- All new server-side state (summary cache, popularity scores, recommendation inputs) sits
  behind `GraphService` or an analogous narrow service and is loaded from generated,
  version-keyed JSON artifacts — the same operational model as `data/graph.json` and
  `data/layout.json` today.

## 2. Layered view

```
┌──────────────────────────────────────────────────────────────────────┐
│ Frontend (React + TS + Sigma.js)                                       │
│  App ─ GraphCanvas ─ NodeDetailsPanel ─ SearchCommand ─ DomainLegend   │
│  + FilterPanel (1B)   + summary section (1C)   + RecommendPanel (2)    │
│  consumes /api/v1 only; no browser physics; semantic zoom preserved    │
└───────────────┬────────────────────────────────────────────────────────┘
                │ HTTP  /api/v1 (versioned, backward compatible)
┌───────────────▼────────────────────────────────────────────────────────┐
│ Backend (FastAPI, in-memory)                                            │
│  routes (main.py)                                                       │
│   ├─ GraphService      graph/domains/node/neighbors/search  [existing]  │
│   │     + popularity map loaded from data/popularity.json   [1D]        │
│   ├─ SummaryService    Wikipedia fetch + 2-tier cache        [1C]       │
│   └─ Recommender       graph-grounded stack + LLMClient      [2]        │
└───────────────┬────────────────────────────────────────────────────────┘
                │ reads (startup / lazy), never a graph DB
┌───────────────▼────────────────────────────────────────────────────────┐
│ Data + build pipeline (offline, deterministic, CI-reproducible)         │
│  data/seed/*.json ─build─► graph.json ─validate─► ─layout─► layout.json  │
│  scripts/popularity/* ─► data/popularity.json  [1D]                      │
│  data/cache/wikipedia/<version>/*.json (generated, gitignored) [1C]      │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Component responsibilities (new/changed)

| Component | Phase | Responsibility | Boundary rule |
|-----------|-------|----------------|---------------|
| `FilterPanel` + `applyFilters` | 1B | Presentation-only filtering over the existing graph payload; composes with semantic zoom; never recomputes coordinates | Frontend only; no API change |
| `validate_dataset.py --require-targets` | 1B | Machine-check the 250+/150–170 milestone gate | Opt-in; default behavior unchanged |
| `SummaryService` | 1C | Only component that calls Wikipedia; owns in-process LRU + on-disk version-keyed cache; returns `None` on failure/absent title | Behind service boundary; no graph DB |
| popularity map in `GraphService` | 1D | Read-only sizing input loaded from `data/popularity.json` | No request-time fetches |
| `scripts/popularity/*` | 1D | Offline ingest + deterministic normalize/blend; records source+timestamp+license+method | Build-time only |
| `Recommender` + `LLMClient` | 2 | Candidate retrieval from graph, model proposal, grounding + compatibility enforced in our code, connected-subgraph output | Provider-independent; grounding never trusted to the model |

## 4. Data artifacts and keys

- `data/graph.json` — compiled dataset, `version` bumps on expansion.
- `data/layout.json` — deterministic coordinates, keyed to dataset version.
- `data/popularity.json` — per-technology scores + per-metric provenance, keyed to dataset
  version; missing technologies simply absent (never zero-filled).
- `data/cache/wikipedia/<dataset_version>/<slug>.json` — generated, gitignored; namespaced by
  version for clean invalidation.
- `data/popularity/history/<timestamp>.json` — dated snapshots for future trends.

Everything is version-keyed so a dataset bump keeps layout, popularity, and caches coherent.

## 5. Request-path vs build-path (hard rule)

- **Build/offline (may call the network, runs in CI with fixtures):** dataset build,
  validation, layout, popularity ingestion, optional summary cache warming.
- **Request path (no third-party network except the bounded, cached Wikipedia summary
  fetch):** graph queries, node detail (+ cached summary), recommendations (LLM call is the
  one intentional outbound request, provider-independent, with a `null` fallback).

This keeps the API fast and CI hermetic, and it is why popularity ingestion is strictly
offline (Req 3.8).

## 6. Security / integrity posture

- External text (Wikipedia extracts, LLM output, user descriptions) is **untrusted**:
  rendered as plain text, schema-validated, and — for recommendations — re-checked against
  the real graph regardless of what the model returns.
- No fabricated data ever reaches the UI: absence is shown as absence (spec §7, §25).
- API stays backward compatible: additive optional fields and new endpoints only.

## 7. Evolution hook (future, not now)

Because every new capability reads from a narrow service and version-keyed artifacts, the
eventual PostgreSQL migration replaces `GraphService`'s internals (and the popularity/summary
loaders) without changing `/api/v1` or the frontend. This document does not authorize that
migration; it only ensures these phases do not foreclose it.
