# Requirements — TechAtlas Phases 1B → 2

## Status of this document

This is a **requirements draft for review**. No implementation is authorized by this
document. It covers the four capabilities agreed for the next milestones, mapped onto the
phase roadmap already recorded in `docs/architecture.md`:

| Capability in this spec                                   | Documented phase |
|-----------------------------------------------------------|------------------|
| Dataset expansion to 250+ tech / 150–170 concepts + filtering | Phase 1B      |
| Wikipedia summaries and caching                           | Phase 1C         |
| Technology popularity ingestion and scoring               | Phase 1D         |
| AI graph-backed technology stack recommendations          | Phase 2          |

## Context this spec is grounded in (verified, not invented)

These facts come from the repository as it exists today and constrain every requirement
below:

- **One global connected graph** (architecture.md "Guiding principle", spec §21). Domains,
  concepts, and technologies are all nodes; relationships are typed edges. Every feature
  here is a layer over that single graph.
- **Source of truth is hand-curated JSON** in `data/seed/*.json`, compiled by
  `scripts/build_dataset.py` into `data/graph.json`, validated by
  `scripts/validate_dataset.py`, laid out deterministically by
  `scripts/generate_layout.py`.
- **Current dataset counts** (from the validator at the time of writing): 11 domains,
  44 concepts, 61 technologies, 251 edges, version `0.1.0`. The current `data/seed` is an
  honest *verified subset*, not the full universe (`data/seed/README.md`).
- **Schema already provisions** `wikipedia_title`, `wikidata_id`, `lifecycle_status`,
  `aliases`, and a separate editorial `importance` field (`data/schema/graph-schema.json`).
  Node sizing is three separate bounded scales in `scripts/sizing.py`; technology size is
  currently a connectivity placeholder, explicitly **not** adoption (architecture.md
  "Sizing honesty", spec §5.3, §7).
- **API** is versioned under `/api/v1` with a lightweight whole-graph payload and a rich
  on-demand node detail (`backend/app/main.py`, `backend/app/models.py`, spec §10).
- **The agreed "Option A" architecture** (recorded decision carried over from the prior
  planning session): keep serving the validated JSON graph from memory now, behind the
  narrow `GraphService` boundary (`backend/app/graph_service.py`), so a future
  PostgreSQL/SQLAlchemy implementation can replace it without changing routes or the
  frontend (architecture.md "Why JSON now, PostgreSQL later", spec §8.5, §8.7). All new
  server-side state introduced by these phases (caches, scores, recommendations) must sit
  behind that same boundary and must not require a graph database.

## Reviewer decisions (resolved 2026-10-29)

The reviewer has made the following binding decisions. They supersede the earlier open
questions and constrain the design:

1. **Master specification stays external.** It is NOT added to the repo and SHALL NOT be
   fabricated or reconstructed. Section citations in this document remain as pointers into
   that external document. The exact original artifact still needed from the reviewer is
   listed under "Still needed from the reviewer" below.
2. **Option A is confirmed.** Continue with the in-memory JSON graph served through the
   `GraphService` abstraction. Backward compatibility SHALL be preserved. PostgreSQL is a
   *future option, not a current dependency*; no requirement here may assume it.
3. **Popularity scoring is a transparent, source-backed pipeline.** It SHALL use suitable
   public metrics (e.g. GitHub activity and package-download statistics), and SHALL record
   per metric: source, retrieval timestamp, licensing, and the normalization methodology.
   Popularity numbers SHALL NEVER be invented; missing data SHALL be clearly marked as
   missing.
4. **Phase 2 recommendations use a provider-independent AI architecture.** Recommendations
   SHALL be grounded in the actual technology graph, SHALL require explanations and
   compatibility checks, and SHALL NEVER fabricate technologies or relationships. No single
   AI vendor may be hard-wired into the contract.

### Reviewer sign-off on open items (2026-10-29)

- **[RESOLVED] Master specification document** — the master spec stays an external,
  read-only source of truth. It is NOT added to the repo and SHALL NOT be fabricated.
  Section citations remain stable pointers into that external document. This does not block
  any phase.
- **[RESOLVED] Popularity sources + licensing acceptance** — approved to proceed with the
  transparent source-backed methodology (decision 3). The concrete source list and each
  source's license/ToS acceptance SHALL be recorded in `data/popularity/SOURCES.md` during
  Phase 1D design/implementation before that source is enabled.
- **[OPEN — deferred] Budget/latency ceiling for the Phase 2 AI call** — the reviewer will
  decide later. This affects **Phase 2 only** (model selection, timeout, result caching) and
  does NOT block Phases 1B, 1C, or 1D. Phase 2 implementation SHALL NOT begin until this is
  resolved.

---

## Requirement 1 — Dataset expansion to 250+ technologies and 150–170 concepts, with filtering (Phase 1B)

**User story:** As a learner exploring the technology landscape, I want the map to cover the
full breadth of the ecosystem (250+ technologies, 150–170 concepts) and let me filter what
I see, so that the graph is comprehensive without becoming unreadable.

### Acceptance criteria (EARS)

1.1. WHEN `scripts/validate_dataset.py` is run against the expanded dataset, THEN the system
SHALL report at least 250 technology nodes and between 150 and 170 concept nodes inclusive.

1.2. WHERE a node is added during expansion, the system SHALL require it to be hand-verified
with a correct canonical ID, correct `node_type`/`node_subtype`, a `primary_domain`
referencing an existing domain, and a correct Wikipedia/Wikidata identity where one exists
(per `data/seed/README.md` expansion rules).

1.3. WHILE the dataset grows, the system SHALL NOT change the graph schema
(`data/schema/graph-schema.json`) or the public API shapes; expansion SHALL be additive to
`data/seed/*.json` only.

1.4. WHEN the expanded dataset is validated, THEN all existing data-quality rules SHALL
still pass with zero errors: unique canonical IDs, no broken edges, no duplicate edges
(symmetric types deduped by unordered pair), endpoint-type rules per
`docs/relationship-taxonomy.md`, and `is_curated: false` edges flagged in the report.

1.5. WHEN the expanded dataset is laid out by `scripts/generate_layout.py`, THEN the layout
SHALL remain deterministic for a given dataset version and SHALL guarantee no two node
bubbles overlap (edge-to-edge gap ≥ the configured margin).

1.6. WHEN a user applies a filter in the frontend, THEN the system SHALL allow filtering the
visible graph by at least node type (domain / concept / technology) and by domain, and SHALL
update the visible nodes and edges accordingly.

1.7. WHILE one or more filters are active, the system SHALL keep the graph connected in
presentation by hiding filtered-out nodes and their incident edges without recomputing node
coordinates (coordinates remain the precomputed layout values).

1.8. WHEN all filters are cleared, THEN the system SHALL restore the full set of visible
nodes and edges.

1.9. WHERE semantic zoom is active, the system SHALL continue to show only domains and large
hubs at universe zoom and reveal detail nodes at detail zoom (spec §5.5), and filtering
SHALL compose with semantic zoom rather than override it.

1.10. IF a filter selection would result in zero visible nodes, THEN the system SHALL present
an explicit empty state rather than a blank canvas.

---

## Requirement 2 — Wikipedia summaries and caching (Phase 1C)

**User story:** As a user inspecting a node, I want to read a short encyclopedic summary of
the entity inside the detail panel, so that I can understand it without leaving the app.

### Acceptance criteria (EARS)

2.1. WHEN a user opens the detail panel for a node that has a non-null `wikipedia_title`,
THEN the system SHALL display a short Wikipedia-sourced summary for that node.

2.2. WHERE a node has a null `wikipedia_title`, the system SHALL NOT fetch or display a
summary and SHALL render the detail panel without a summary section (no fabricated content,
spec §25).

2.3. WHEN a summary is requested for a node, THEN the system SHALL resolve it using the
exact curated `wikipedia_title` (and/or `wikidata_id`) and SHALL NOT auto-derive the article
title from the node name (`data/schema/graph-schema.json` note on `wikipedia_title`).

2.4. WHEN a summary has been fetched once, THEN the system SHALL cache it server-side so that
subsequent requests for the same node do not re-fetch from Wikipedia within the cache
validity window.

2.5. WHILE serving a cached summary, the system SHALL serve it through the `GraphService`
boundary (Option A) without introducing a graph database and without changing the existing
`/api/v1` route shapes beyond adding summary data to the node-detail response or a dedicated
summary endpoint.

2.6. IF a Wikipedia fetch fails or times out, THEN the system SHALL degrade gracefully: the
detail panel SHALL still render all curated fields and SHALL fall back to the existing
outbound Wikipedia link, without surfacing a hard error to the user.

2.7. WHEN a summary is displayed, THEN the system SHALL attribute it to Wikipedia and link to
the source article, consistent with Wikipedia's attribution expectations.

2.8. WHERE the dataset version changes, the system SHALL key or invalidate cached summaries
so that stale summaries are not served for re-identified nodes.

---

## Requirement 3 — Technology popularity ingestion and scoring (Phase 1D)

**User story:** As a user comparing technologies, I want node size and detail to reflect real
adoption rather than mere connectivity, so that the map communicates which technologies are
actually widely used.

### Acceptance criteria (EARS)

3.1. WHEN popularity data is ingested, THEN the system SHALL record, per technology and per
metric, the source identifier, the retrieval timestamp, the source licensing, and the
normalization method applied, and SHALL mark technologies for which no sourced data exists
as having no popularity score (rather than a zero or invented one, spec §7, §25).

> **Reviewer decision (resolved):** the pipeline uses suitable public metrics such as
> GitHub activity and package-download statistics. The exact source list and acceptance of
> each source's licensing/ToS is confirmed in design §Phase 1D; the *methodology* (record
> source + timestamp + licensing + normalization, never invent, mark missing) is fixed.

3.2. WHEN a popularity score is computed, THEN the system SHALL derive it deterministically
from the ingested source data using a documented normalization method (e.g. per-metric
min-max or log scaling then a weighted blend), SHALL store the per-metric inputs alongside
the blended score, and SHALL key the result to the dataset version.

3.3. WHERE a technology has a sourced popularity score, the system SHALL size that
technology node by the popularity score instead of the connectivity placeholder; WHERE a
technology has no score, the system SHALL fall back to the existing connectivity-based
bounded size.

3.4. WHILE sizing by popularity, the system SHALL keep the three separate bounded size scales
(domain / concept / technology) and the `sqrt`-style bounding from `scripts/sizing.py` so
that hubs do not dwarf the rest of the map (spec §5.3).

3.5. WHEN a technology node's detail is shown, THEN the system SHALL state plainly whether
its size reflects sourced adoption or connectivity, so the UI never implies invented data
(architecture.md "Sizing honesty").

3.6. WHEN sizing input changes from connectivity to popularity, THEN `scripts/sizing.py`
SHALL remain the single source of truth shared by the layout generator and the backend, so
API-served sizes continue to match what the layout packed against.

3.7. WHERE historical popularity is ingested, the system SHALL store it in a form that
allows later trend display without requiring a schema change to the core graph.

3.8. WHEN ingestion runs, THEN it SHALL be an offline/build-time step that produces a
versioned artifact consumed by the backend, consistent with the Option A JSON-served-from-
memory architecture (no live third-party calls in the request path).

---

## Requirement 4 — AI graph-backed technology stack recommendations (Phase 2)

**User story:** As a developer describing a project, I want the system to recommend a
coherent technology stack grounded in the knowledge graph, so that I get suggestions that
are connected and justified rather than hallucinated.

### Acceptance criteria (EARS)

4.1. WHEN a user submits a free-text project description, THEN the system SHALL return a
recommended set of technologies drawn from nodes that exist in the curated graph.

4.2. WHERE a recommended technology is returned, the system SHALL justify it using real
graph relationships (e.g. `commonly_used_with`, `implements`, `used_for`,
`part_of_ecosystem`) between the recommended nodes, and SHALL NOT recommend technologies
absent from the graph.

4.3. WHEN a recommendation set is produced, THEN the system SHALL present the recommended
nodes as a connected subgraph (the relationships that justify the stack), consistent with
the "one connected graph" principle (spec §21).

4.4. IF the AI model proposes a technology not present in the graph, THEN the system SHALL
exclude it from the returned stack (grounding constraint) rather than surface an ungrounded
suggestion.

4.5. WHILE generating a recommendation, the system SHALL route graph access through the
existing `GraphService` boundary (Option A) and SHALL NOT require a graph database.

4.6. IF the AI provider is unavailable or returns an error, THEN the system SHALL fail
gracefully with a clear message and SHALL NOT fabricate a stack.

4.8. WHERE recommendations are generated, the system SHALL use a provider-independent
abstraction (a narrow `Recommender`/LLM-client interface) so that no single AI vendor is
hard-wired; the graph-grounding and compatibility-check logic SHALL live in TechAtlas code,
not in the model, so it holds regardless of provider.

> **Reviewer decision (resolved):** Phase 2 uses a provider-independent AI architecture.
> Grounding, explanation, and compatibility checks are mandatory and enforced in our code.
> A specific provider/model is selected in design §Phase 2; any budget/latency ceiling is
> still needed from the reviewer and is flagged there.

4.7. WHEN a recommendation is returned, THEN the system SHALL allow the user to open any
recommended node in the existing detail panel / deep-link flow (spec §5.9), reusing the
current graph UI rather than a separate surface.

---

## Non-functional constraints carried across all four requirements

- NFR-1. The graph schema and `/api/v1` response shapes SHALL remain backward compatible;
  new data SHALL be additive (new optional fields or new endpoints), per the Option A
  boundary.
- NFR-2. All server-side state added by these phases (summary cache, popularity scores,
  recommendation inputs) SHALL sit behind `GraphService` and SHALL NOT introduce a graph
  database (spec §8.5, §8.7).
- NFR-3. The dataset build → validate → layout pipeline SHALL remain deterministic and
  CI-reproducible as the dataset grows.
- NFR-4. The system SHALL never present invented popularity, summaries, or recommendations;
  absence of data SHALL be shown as absence, not fabricated (spec §7, §25).
- NFR-5. Accessibility behaviors already in place (keyboard search, type-as-text, reduced
  motion, deep links; spec §14.2, §5.9) SHALL continue to hold for all new UI.
