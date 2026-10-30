# Tasks — TechAtlas Phases 1B → 2

Implementation plan derived from `requirements.md` and `design.md`. Executed in the approved
rollout order: **1B → 1C → 1D**, then **Phase 2 (gated)**.

## Conventions

- Each task is independently committable and leaves the full-check pipeline green
  (`build → validate → backend ruff+pytest → frontend typecheck+lint+test+build`).
- Every change is **additive and backward compatible** (Option A; optional fields / new
  endpoints only).
- `_Requirements:` tags reference the EARS IDs in `requirements.md`.
- `[ ]` = not started. Do not begin a task before its phase is unblocked (see Gating).

## Gating

- **1B, 1C, 1D — UNBLOCKED.** Approved 2026-10-29.
- **Phase 2 — BLOCKED.** Do not start Phase 2 tasks until the AI budget/latency ceiling is
  decided (requirements.md open item 3). Tasks are listed for planning only.

---

## Phase 1B — Dataset expansion + filtering

### 1. Add the milestone count gate to the validator
- [x] Add an opt-in `--require-targets` flag to `scripts/validate_dataset.py` that errors
      unless `technologies ≥ 250` and `150 ≤ concepts ≤ 170`; default behavior unchanged.
- [x] Unit-test the gate at boundaries (249/250 tech; 149/150/170/171 concepts).
- _Requirements: 1.1_

### 2. Expand the curated dataset to targets (additive, hand-verified)
- [x] Append technologies to `data/seed/technologies.json` until `≥ 250`, each with canonical
      ID, correct `node_type`/`node_subtype`, `primary_domain`, and correct
      `wikipedia_title`/`wikidata_id` where one exists.
- [x] Append concepts to `data/seed/concepts.json` to land in `150–170`.
- [x] Add typed edges in `data/seed/edges.json` connecting every new node (no orphans) using
      only taxonomy-valid relationship types.
- [x] Add `domains.json` entries ONLY if a genuinely new domain community is justified; if a
      new domain is added, update `DOMAIN_COLORS` in `graph_service.py` and the
      `test_domains_listed` expected count. *(No new domain added — stayed at 11, so no
      color/test change needed.)*
- [x] Bump `DATASET_VERSION` in `scripts/build_dataset.py` (`0.1.0 → 0.2.0`).
- _Requirements: 1.2, 1.3, 1.4_

### 3. Rebuild + validate + relayout the expanded dataset
- [x] Run build → validate (`--require-targets`) → layout; confirm zero errors and no
      overlapping bubbles (0 of 86,736 pairs); confirm determinism (fresh `generate()`
      runs produce identical coordinates).
- _Requirements: 1.4, 1.5_

### 4. Frontend: filter state + pure selector
- [x] Add `FilterState { nodeTypes, domains, subtypes? }` and a pure
      `applyFilters(graph, filterState) -> { visibleNodeIds, visibleEdgeIds }` in
      `frontend/src/graph/filters.ts`.
- [x] Vitest: type-only, domain-only, subtype, combined, clear-all, and empty-result cases;
      assert filtered nodes retain `x/y` (no relayout).
- _Requirements: 1.6, 1.7, 1.8_

### 5. Frontend: FilterPanel + GraphCanvas integration
- [x] Add keyboard-accessible `FilterPanel` (node-type + domain toggles, native checkboxes
      + Clear button); wire `FilterState` into `App.tsx` via `useMemo(applyFilters)`.
- [x] Apply visibility via Sigma `nodeReducer`/`edgeReducer` (`hidden`), combined with
      semantic-zoom visibility via logical AND; never recompute coordinates.
- [~] Make `DomainLegend` optionally click-to-filter. *(Deferred by design: the legend's
      documented role is a keyboard jump-list / navigation affordance (architecture.md a11y
      §14.2). Overloading click to also filter would conflict with navigation; the
      dedicated FilterPanel covers domain filtering cleanly, so the legend keeps its
      single, predictable role.)*
- [x] Render an explicit empty-state overlay when `visibleNodeIds` is empty.
- [x] Vitest: filter ∧ semantic-zoom compose (logical AND); empty-result path covered.
- _Requirements: 1.6, 1.7, 1.9, 1.10_

### 6. 1B wrap-up
- [x] Update `data/seed/README.md` counts and `docs/architecture.md` milestone map (1B done).
- [x] Add `--require-targets` to the 1B CI milestone job.
- _Requirements: 1.1_

---

## Phase 1C — Wikipedia summaries + caching

### 7. SummaryService with two-tier cache
- [x] Add `backend/app/summary_service.py`: in-process LRU + on-disk cache at
      `data/cache/wikipedia/<dataset_version>/<slug>.json`
      (`{title, extract, source_url, fetched_at, lang, license}`).
- [x] Resolve strictly by curated `wikipedia_title` (never derive from name); `None` when
      title is null or fetch fails with no cache; short timeout (~3s).
- [x] Version-namespaced keying so a dataset bump invalidates cleanly; soft TTL refresh
      with stale-while-error fallback.
- [x] Gitignore `data/cache/`.
- _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

### 8. Wire summary into the API (backward compatible)
- [x] Add optional `summary: NodeSummary | null` to `NodeDetail` (`models.py`) populated via
      `SummaryService` in the node route; mirror the type in `frontend/src/api/types.ts`.
- [x] Backend tests with a mocked HTTP client: cache hit/miss, on-disk persistence,
      version invalidation, timeout→None, null-title→no-fetch, stale refetch,
      stale-while-error. Autouse conftest stub keeps the whole suite offline; a route test
      asserts the field is optional and absent cleanly. No live network in CI.
- _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.8_

### 9. Frontend: summary section in detail panel
- [x] Render extract as **plain text** (React escapes it; no HTML) with "Summary from
      Wikipedia" label, link to `source_url`, and license string; fall back to existing
      outbound link when absent.
- [x] Vitest (testing-library): present vs absent, extract is escaped (XSS/injection test).
- _Requirements: 2.1, 2.2, 2.6, 2.7_

### 10. 1C wrap-up
- [x] Promote `httpx` to a runtime dependency (pinned `>=0.27`) in `backend/pyproject.toml`.
- [x] Add `TECHATLAS_WIKIPEDIA_LANG`, `TECHATLAS_SUMMARY_TTL_DAYS` to
      `docs/development-setup.md`; update `docs/architecture.md` (1C done).
- _Requirements: 2.5_

---

## Phase 1D — Popularity ingestion + scoring

### 11. Optional source-mapping fields on nodes
- [x] Add optional `repo: "owner/name"` and `package: { ecosystem, name }` to the node schema
      (`data/schema/graph-schema.json`) — additive, nullable, with validation patterns.
- [x] Populate mappings for 146 technologies (`scripts/expand/popularity_mappings.py`);
      unmapped technologies have neither (→ missing popularity, never zero).
- _Requirements: 3.1_

### 12. Offline ingestion pipeline
- [x] Add `scripts/popularity/{ingest.py, sources/github.py, sources/packages.py, sources/common.py}`
      writing `data/popularity/raw/popularity_raw.json`; record per metric: value, source,
      retrieved_at, license. Fetchers are offline-safe (errors → missing, never raise).
- [x] Record each enabled source's license/ToS in `data/popularity/SOURCES.md` BEFORE
      enabling it (reviewer-approved precondition; GitHub, npm, PyPI, crates).
- [x] Fetchers tested against recorded fixtures (injected fake client); no live network in CI.
- _Requirements: 3.1, 3.8_

### 13. Deterministic scoring
- [x] Add `scripts/popularity/score.py`: `log1p` → per-metric min-max → weighted blend with
      renormalization → `data/popularity.json` (keyed to dataset version; per-metric inputs
      + provenance retained; unmapped/metric-less techs absent).
- [x] Archive dated snapshots under `data/popularity/history/<generated_at>.json`.
- [x] Unit tests: determinism, normalization boundaries, blend/renormalization,
      missing→absent (not zero), full provenance retained, version keying.
- _Requirements: 3.1, 3.2, 3.7_

### 14. Sizing integration (single source of truth preserved)
- [x] Extend `scripts/sizing.py` `node_radius(..., popularity=None)`: popularity path =
      `SIZE_TECH` scaled by `sqrt(score)` (clamped 0..1); no-score path = existing
      connectivity formula. Added shared `load_popularity()` loader.
- [x] Load `data/popularity.json` in both `generate_layout.py` and `GraphService` so API
      size matches the layout packing; verified 0 overlaps with popularity sizing.
- [x] Unit tests: popularity vs connectivity path, bounds, clamping, domain/concept ignore,
      mixed dataset, loader (missing file + parse).
- _Requirements: 3.3, 3.4, 3.6_

### 15. Expose popularity + basis in API/UI
- [x] Add optional `popularity: float | null` and `size_basis: "popularity"|"connectivity"`
      to `GraphNode` and `NodeDetail` (mirrored in `types.ts`); detail panel states the
      basis plainly (adoption score when sourced, else connectivity note).
- [x] Tests assert correct basis reporting (connectivity fallback by default; flips to
      popularity when a score is present); UI never implies invented adoption.
- _Requirements: 3.3, 3.5, 3.6_

### 16. 1D wrap-up
- [x] Add a `make popularity` target + docs (`development-setup.md` optional-sizing
      section); update `docs/architecture.md` (1D done, sizing-honesty rewritten). Gitignore
      the live-derived artifacts so the committed layout stays reproducible.
- _Requirements: 3.8_

---

## Phase 2 — Graph-grounded recommendations  **(BLOCKED — do not start)**

> Blocked on the AI budget/latency ceiling (requirements.md open item 3). Listed for
> planning; no work until unblocked.

### 17. Provider-independent LLM client
- [ ] Define `LLMClient` protocol + a deterministic `NullLLMClient` (graph-only heuristic,
      no external call) for tests and offline fallback. No vendor type leaks upward.
- _Requirements: 4.6, 4.8_

### 18. Recommender (grounding + compatibility in our code)
- [ ] Candidate retrieval from the graph via `GraphService`; model proposal; grounding filter
      (drop non-graph techs); compatibility check against real edges; assemble connected
      subgraph + per-node justification referencing real edges.
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_

### 19. `POST /api/v1/recommend` endpoint
- [ ] Request `{description, max_items}`; response `{stack, subgraph, ungrounded_dropped,
      provider, notes}`; treat description as untrusted; schema-validate + re-check model
      output against the graph; 503 or NullLLMClient fallback on provider error.
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

### 20. Frontend RecommendPanel
- [ ] Input → `/recommend` → highlight returned subgraph on existing canvas; clicking a node
      opens the existing detail panel / deep-link flow. No separate graph surface.
- _Requirements: 4.3, 4.7_

### 21. Phase 2 tests + wrap-up
- [ ] End-to-end with `NullLLMClient` (deterministic, offline); grounding-drop test;
      compatibility-drop test; adapter tests on fixtures (no live provider in CI).
- [ ] Update `docs/architecture.md` (Phase 2) and config docs
      (`TECHATLAS_LLM_PROVIDER`, provider keys, any budget/latency setting).
- _Requirements: 4.4, 4.6, 4.8_

---

## Done-definition per phase

- **1B done:** validator reports ≥250 tech / 150–170 concepts with `--require-targets`
  green; filters work and compose with semantic zoom; full-check pipeline green.
- **1C done:** curated-title summaries served from cache with graceful fallback and
  attribution; optional field; pipeline green with no live network in CI.
- **1D done:** `data/popularity.json` with full provenance; sizing uses popularity with
  connectivity fallback; basis surfaced in UI; pipeline green.
- **Phase 2 done (when unblocked):** grounded recommendations with explanations +
  compatibility checks; no fabricated tech/relationships; provider-independent; pipeline
  green offline via `NullLLMClient`.
