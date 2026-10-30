# TechAtlas architecture

This document records the architectural decisions for the current implementation and
how they map to the master specification. It is updated as the project evolves.

## Guiding principle

One global, connected knowledge graph (spec §21). Domains, concepts, and technologies
are all nodes; relationships are typed, directed-or-symmetric edges. Everything else —
visualization, search, detail panels, future popularity and recommendations — is a layer
over that single graph.

## Data layer (the foundation)

- **Source of truth:** hand-curated JSON fragments in `data/seed/`
  (`domains.json`, `concepts.json`, `technologies.json`, `edges.json`).
- **Compiled artifact:** `scripts/build_dataset.py` concatenates fragments into
  `data/graph.json` (`{ version, nodes, edges }`), conforming to
  `data/schema/graph-schema.json`.
- **Validation:** `scripts/validate_dataset.py` enforces the spec §16 rules — unique
  canonical IDs, no broken edges, no duplicate edges (symmetric types deduped by
  unordered pair), endpoint-type rules per `docs/relationship-taxonomy.md`, and flags
  inferred (`is_curated: false`) edges so they are never silently trusted. It runs in CI.
- **Layout:** `scripts/generate_layout.py` produces a **deterministic**,
  community-aware force-directed layout (`data/layout.json`) offline, keyed to the
  dataset version (spec §5.2). The browser never runs a full simulation.

### Why JSON now, PostgreSQL later

The spec (§8.5, §8.7) says PostgreSQL is sufficient and a graph DB is unnecessary for
several hundred nodes, and warns against premature infrastructure. For Phase 0 we go one
step simpler: serve the validated JSON from memory. The `GraphService` boundary
(`backend/app/graph_service.py`) is deliberately narrow so a SQLAlchemy/PostgreSQL
implementation can replace it behind the same API without touching routes or frontend.

## Backend (FastAPI)

- `app/graph_service.py` — loads dataset + layout once, builds adjacency and search
  indexes, computes render colors and (type-specific, bounded) sizes.
- `app/models.py` — Pydantic models. Two shapes on purpose (spec §10): a **lightweight**
  whole-graph payload and a **rich** on-demand node detail.
- `app/main.py` — versioned REST routes under `/api/v1`, CORS, OpenAPI.

### Sizing honesty (spec §5.3, §7)

No popularity data exists yet, and the spec forbids inventing it. Technology node size is
a bounded `sqrt(normalized degree)` placeholder, and the detail panel states plainly that
sizing reflects connectivity, not adoption. Domains and concepts use separate editorial
scales. When real popularity ingestion lands, only the sizing input changes.

## Frontend (React + TypeScript + Vite)

- **Rendering:** Sigma.js (WebGL) over a Graphology graph (spec §8.2). The Sigma instance
  is owned imperatively in `GraphCanvas` and driven by props, so interactions don't
  recreate the renderer (spec §15).
- **Layout:** precomputed coordinates from the API; no browser-side physics.
- **Components** (spec §11): `GraphCanvas`, `SearchCommand`, `NodeDetailsPanel`,
  `DomainLegend`, composed by `App`. Rendering, data fetching, and relationship phrasing
  are kept in separate modules.
- **Accessibility** (spec §14.2): keyboard-driven search (`/` to focus, arrows + Enter),
  the domain legend doubles as a jump list, node type is shown as text (not color alone),
  and camera animation respects `prefers-reduced-motion`.
- **Deep links** (spec §5.9): `/technology/<slug>`, `/concept/<slug>`, `/domain/<slug>`
  focus and open the matching node on load; selection updates the URL.

## What is intentionally NOT built yet

Per spec §19 roadmap and §25, these are later phases and are not faked:

- Full 250+/150-170 dataset (current seed is a verified subset; counts printed by the
  validator are the truth).
- Live popularity ingestion and historical trends (Phase 1D).
- Wikipedia summary fetching/caching (Phase 1C) — the UI links out to Wikipedia using the
  curated article title, but does not yet fetch/display summaries server-side.
- AI project-to-stack recommendations (Phase 2).

## Milestone map

| Phase | Status | What it delivers |
|-------|--------|------------------|
| 0  — Data foundation        | **done (seed subset)** | schema, validated seed, layout, graph API |
| 1A — Interactive prototype  | **done** | Sigma graph, hover/select, detail panel, search |
| 1B — Complete ecosystem     | next | expand to 250+ tech / 150-170 concepts, filters, semantic zoom |
| 1C — Encyclopedia + polish  | later | server-side Wikipedia summaries + caching, UI polish |
| 1D — Popularity             | later | sourced adoption metrics, size by metric, history |
| 2  — Recommendations        | future | project description → graph-backed stack |
