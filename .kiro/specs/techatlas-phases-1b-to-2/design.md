# Design — TechAtlas Phases 1B → 2

**Status:** Design proposal for review. No implementation is authorized by this document.
It realizes `requirements.md` under the reviewer decisions of 2026-10-29 (Option A
confirmed; master spec external; transparent source-backed popularity; provider-independent
grounded AI).

## 0. Design principles carried from the codebase

Every decision below is constrained by what already exists and must not break it:

- **One connected graph, served from validated JSON in memory**, behind the narrow
  `GraphService` (`backend/app/graph_service.py`). PostgreSQL is a *future option*, not a
  dependency. New state sits behind `GraphService` or an analogous narrow service; no graph
  database.
- **Source of truth is `data/seed/*.json`**, compiled by `scripts/build_dataset.py`,
  validated by `scripts/validate_dataset.py`, laid out by `scripts/generate_layout.py`. New
  data is additive.
- **`/api/v1` shapes stay backward compatible.** New fields are optional; new capabilities
  are new endpoints or new optional fields on existing responses. The frontend's
  `src/api/types.ts` mirrors the backend models; the two change together.
- **Never fabricate.** Missing summary, missing popularity, or an ungrounded recommendation
  is shown as *absent*, never invented (spec §7, §25).
- **`scripts/sizing.py` stays the single source of truth** for node radius, shared by the
  layout generator and the backend `_size()`.

## 1. System context after these phases

```
                         build time (offline, deterministic, CI)
  data/seed/*.json ──► build_dataset.py ──► data/graph.json ──► validate_dataset.py
        │                                         │
        │                                         ├─► generate_layout.py ─► data/layout.json
        │                                         │
        │                   (Phase 1D) popularity/ingest.py ─► data/popularity.json
        │                                         │
        └── wikipedia_title / wikidata_id ────────┘ (used at request time, Phase 1C)

                         request time (FastAPI, in-memory)
  GraphService ──┬── graph(), domains(), node_detail(), neighbors(), search()   [existing]
                 ├── popularity scores loaded from data/popularity.json         [Phase 1D]
                 │
  SummaryService ── Wikipedia summary fetch + server-side cache                 [Phase 1C]
  Recommender    ── graph-grounded stack recommendation, provider-independent    [Phase 2]
```

Frontend (React + Sigma.js) consumes `/api/v1` only; no browser-side physics; filtering and
summaries are UI layers over the same payloads.

---

## 2. Phase 1B — Dataset expansion + filtering

### 2.1 Architecture

No new service. Expansion is pure data growth; filtering is a frontend presentation layer
over the existing `/api/v1/graph` payload plus `/api/v1/domains`.

### 2.2 Data model

- **No schema change.** `data/schema/graph-schema.json` already supports everything the
  250+/150–170 expansion needs (`node_subtype`, `lifecycle_status`, `importance`, aliases,
  `wikipedia_title`, `wikidata_id`).
- Expansion is additive edits to `data/seed/{concepts,technologies,edges}.json` (and
  `domains.json` only if a genuinely new domain community is justified).
- `DATASET_VERSION` in `build_dataset.py` bumps (e.g. `0.1.0 → 0.2.0`) when the expanded set
  lands, so layout cross-version pinning and popularity keying stay correct.

### 2.3 Validator additions (gated counts)

Add an optional target-count check to `validate_dataset.py` so the 1B completion criterion
is machine-checked, without blocking intermediate commits:

- New flag `--require-targets` (CI for the 1B milestone uses it): errors unless
  `technologies ≥ 250` and `150 ≤ concepts ≤ 170`.
- Without the flag, behavior is unchanged (prints live counts; warnings allowed).

This keeps the "honest counts" principle: the number printed by the validator is the truth,
and the milestone gate is explicit rather than assumed.

### 2.4 API

No backend changes required for filtering — the whole-graph payload already carries
`node_type`, `node_subtype`, and `primary_domain` per node, which is sufficient to filter
client-side. (The full graph at ~450 nodes / ~1000+ edges is still a small payload.)

### 2.5 Frontend filtering

- New `FilterState` in `App.tsx`: `{ nodeTypes: Set<NodeType>, domains: Set<string>,
  subtypes?: Set<string> }`, all empty = "show everything".
- A new `FilterPanel` component (keyboard-accessible, consistent with existing a11y):
  toggles for node type and domain; the existing `DomainLegend` gains optional
  click-to-filter that writes the same `FilterState`.
- Filtering is applied in a pure selector `applyFilters(graph, filterState)` →
  `{ visibleNodeIds, visibleEdgeIds }`. `GraphCanvas` hides filtered nodes/edges via Sigma's
  reducers (`nodeReducer`/`edgeReducer` `hidden: true`) — **coordinates are never
  recomputed** (Req 1.7).
- Composition with **semantic zoom** (`src/graph/semanticZoom.ts`): the zoom-visibility
  function and the filter-visibility function are combined with logical AND in the reducer,
  so a node shows only if both allow it (Req 1.9).
- **Empty state** (Req 1.10): when `visibleNodeIds` is empty, `GraphCanvas` renders an
  overlay message instead of a blank canvas.

### 2.6 Testing (1B)

- Python: validator unit tests for `--require-targets` (pass/fail boundaries at 249/250 tech
  and 149/150/170/171 concepts); existing data-quality tests must stay green on the expanded
  set.
- Frontend (vitest): unit tests for `applyFilters` (type-only, domain-only, combined, clear,
  empty-result); a test that filtered-out nodes keep their `x/y` (no relayout); a test that
  filter ∧ semantic-zoom compose correctly.

---

## 3. Phase 1C — Wikipedia summaries + caching

### 3.1 Architecture

New `SummaryService` behind the same service pattern as `GraphService`. It is the only
component allowed to talk to Wikipedia, and it owns the cache. The request path serves from
cache; fetches happen lazily on first request (or via an optional offline warm step).

### 3.2 Resolution + source

- Resolve strictly by the curated `wikipedia_title` (never auto-derived from name; schema
  note + Req 2.3). `wikidata_id` is retained as a secondary/validation key.
- Source: Wikipedia REST summary endpoint
  `GET https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}` (returns extract +
  canonical URL + attribution). Language defaults to `en`.

### 3.3 Cache design

- **Two-tier, both behind `SummaryService`:**
  - In-process LRU (hot path, bounded size) for the running server.
  - Persistent on-disk JSON cache at `data/cache/wikipedia/{dataset_version}/{slug}.json`
    storing `{ title, extract, source_url, fetched_at, lang, license }`.
- **Keying/invalidation (Req 2.8):** cache is namespaced by `dataset_version`. A version
  bump starts a fresh namespace; old namespaces can be pruned. A soft TTL (e.g. 30 days)
  triggers background refresh but stale-while-revalidate keeps responses fast.
- The on-disk cache is gitignored (generated artifact), consistent with `data/graph.json`
  and `data/layout.json` being generated.

### 3.4 API

Backward-compatible; two options, we propose **(a)** as primary:

(a) **Extend node detail** — add optional `summary: NodeSummary | null` to `NodeDetail`:
```
NodeSummary { extract: str; source_url: str; lang: str; fetched_at: str; license: str }
```
Null when the node has no `wikipedia_title`, or when the fetch failed and no cache exists
(Req 2.2, 2.6). Because it is optional, existing clients are unaffected.

(b) **Dedicated endpoint** `GET /api/v1/nodes/{slug}/summary` → `NodeSummary` or `404/204`.
Useful if we want detail-panel load to not block on summary. We can ship (a) and add (b) if
latency warrants; both reuse the same `SummaryService`.

### 3.5 Failure handling (Req 2.6)

`SummaryService.get(slug)` never raises into the route: on timeout/HTTP error with no cached
entry it returns `None`; the detail panel renders all curated fields and the existing
outbound Wikipedia link. Timeout is short (e.g. 3s) so detail never hangs.

### 3.6 Attribution (Req 2.7)

The detail panel renders the extract with a visible "Summary from Wikipedia" label, a link
to `source_url`, and the stored license string (Wikipedia text is CC BY-SA). Content safety:
the extract is untrusted text — rendered as plain text, never as HTML, no script execution.

### 3.7 Testing (1C)

- Backend: `SummaryService` tests with a mocked HTTP client — cache hit/miss, on-disk
  persistence, version-namespaced invalidation, timeout → `None`, null `wikipedia_title` →
  no fetch. Route test asserting `NodeDetail.summary` is optional and absent cleanly.
- No live network in tests (httpx mock / respx-style), keeping CI hermetic.
- Frontend: detail panel renders summary when present, renders link-only fallback when
  absent; extract is escaped (a11y + XSS test).

---

## 4. Phase 1D — Popularity ingestion + scoring

### 4.1 Architecture (transparent, source-backed, offline)

Ingestion is an **offline build-time step** (`scripts/popularity/`), never in the request
path (Req 3.8). It writes a versioned artifact `data/popularity.json`; the backend loads it
read-only into `GraphService` and uses it as the sizing input.

```
scripts/popularity/
  ingest.py       orchestrates per-source fetchers, writes raw/popularity_raw.json
  sources/
    github.py     stars / recent commit activity per repo
    packages.py   download counts (npm / PyPI / crates, per ecosystem)
  score.py        normalize + blend -> data/popularity.json
```

### 4.2 Metrics (reviewer decision 3)

Suitable public metrics, each recorded with provenance:
- **GitHub activity** — stars and recent commit/release activity (REST/GraphQL). Mapped per
  technology via a new optional curated field `repo: "owner/name"`.
- **Package downloads** — ecosystem registry stats (npm downloads API, PyPI/pypistats,
  crates.io), mapped via optional curated field `package: { ecosystem, name }`.

Mapping fields are **additive, optional** schema additions (`repo`, `package`). A technology
with neither mapped simply has no popularity data → marked missing (Req 3.1).

### 4.3 Data model — `data/popularity.json`

```jsonc
{
  "dataset_version": "0.2.0",
  "generated_at": "2026-10-29T00:00:00Z",
  "methodology": "per-metric log1p then min-max to 0..1, weighted blend (see score.py)",
  "weights": { "github_stars": 0.4, "github_activity": 0.2, "downloads": 0.4 },
  "scores": {
    "technology:react": {
      "score": 0.97,
      "metrics": {
        "github_stars":   { "value": 231000, "source": "github", "retrieved_at": "...", "license": "GitHub ToS", "normalized": 1.0 },
        "downloads":      { "value": 25000000, "source": "npm",    "retrieved_at": "...", "license": "npm ToS",    "normalized": 0.95 }
      }
    }
    // technologies with no sourced metric are ABSENT from "scores" -> missing, not zero
  }
}
```

Every number is traceable to a source + timestamp + license + normalization (Req 3.1, 3.2).

### 4.4 Scoring methodology (Req 3.2, deterministic)

1. Per metric: `log1p(value)` to compress heavy tails, then min-max normalize to `0..1`
   across all technologies that have that metric.
2. Blend normalized metrics by documented weights → `score ∈ 0..1`.
3. Deterministic given the raw inputs; raw inputs are snapshotted so re-running `score.py`
   reproduces identical output in CI.

### 4.5 Sizing integration (Req 3.3–3.6)

- `scripts/sizing.py` remains the single source of truth. Add
  `node_radius(node, degree, max_tech_deg, popularity=None)`:
  - WHERE a technology has a popularity `score`: radius = `SIZE_TECH` band scaled by
    `sqrt(score)` (keeps bounded, hubs don't dwarf — Req 3.4).
  - WHERE no score: fall back to existing connectivity formula unchanged (Req 3.3).
- Both `generate_layout.py` and `GraphService._size()` pass the loaded popularity map in, so
  API-served size still matches what the layout packed against (Req 3.6).
- `GraphNode` gains optional fields: `size_basis: "popularity" | "connectivity"` and
  `popularity: float | null`. The detail panel states the basis plainly (Req 3.5).

### 4.6 History (Req 3.7)

Each ingestion run archives `data/popularity/history/{generated_at}.json`. Trend display is
a later concern; storing dated snapshots now requires no core-graph schema change.

### 4.7 Licensing / ToS (open item, flagged)

The *methodology* is fixed. Before enabling a source, design sign-off records that source's
license/ToS in a `data/popularity/SOURCES.md` (source, endpoint, license, rate limits,
key requirement). Needs reviewer acceptance of each source's terms.

### 4.8 Testing (1D)

- `score.py` unit tests: determinism (same input → same output), normalization boundaries,
  weight blending, and that a technology with no metric is absent (not zero).
- Source fetchers tested against recorded fixtures (no live network in CI).
- Sizing tests: popularity path vs connectivity fallback, bounds respected, `size_basis`
  correctly reported.

---

## 5. Phase 2 — Graph-grounded, provider-independent recommendations

### 5.1 Architecture

```
POST /api/v1/recommend  { description: str }
        │
        ▼
  Recommender
   ├─ 1. Candidate retrieval: map description → candidate technology nodes
   │      (keyword/alias match + domain/concept hints) using GraphService ONLY
   ├─ 2. LLM proposal (via provider-independent LLMClient): given candidates +
   │      their graph relationships, propose a coherent stack + rationale
   ├─ 3. Grounding filter: drop any proposed tech NOT in the graph (Req 4.1, 4.4)
   ├─ 4. Compatibility check: verify proposed pairs are connected by real edges
   │      (commonly_used_with / integrates_with / implements / used_for / ...),
   │      drop or flag unsupported pairs (Req 4.2)
   └─ 5. Assemble connected subgraph + per-node justification (real edges only)
```

Grounding and compatibility are enforced in **our code**, not trusted to the model
(Req 4.8). The model proposes; TechAtlas verifies against the graph.

### 5.2 Provider independence (reviewer decision 4)

```python
class LLMClient(Protocol):
    def complete(self, prompt: str, *, schema: dict) -> dict: ...
```
- Concrete adapters (OpenAI, Anthropic, local/Ollama) implement the same interface; selected
  by env/config. No vendor type leaks into `Recommender` or the API.
- A deterministic `NullLLMClient` (no external call) returns a graph-only heuristic stack —
  used in tests and as the offline fallback so CI never needs a provider.

### 5.3 API

```
POST /api/v1/recommend
req:  { "description": "realtime chat app with presence", "max_items": 8 }
resp: {
  "stack": [
    { "slug": "react", "name": "React", "role": "frontend",
      "why": "commonly_used_with Node.js; implements component-based UI",
      "evidence": [ { "with": "nodejs", "relationship_type": "commonly_used_with" } ] }
  ],
  "subgraph": { "node_ids": [...], "edge_ids": [...] },   // real graph edges only
  "ungrounded_dropped": ["somefakeframework"],            // transparency
  "provider": "null|openai|anthropic|...",
  "notes": "..."
}
```
- New endpoint; existing routes untouched (backward compatible).
- Every `why`/`evidence` references a **real edge** in the graph (Req 4.2, 4.3).
- `subgraph` reuses existing node/edge id space so the frontend can open any node in the
  existing detail panel / deep-link flow (Req 4.7).

### 5.4 Failure + grounding guarantees

- Provider error/unavailable → `503` with a clear message **or** `NullLLMClient` fallback
  (configurable); never a fabricated stack (Req 4.6).
- Any model-proposed technology absent from the graph is excluded and listed in
  `ungrounded_dropped` for transparency (Req 4.4).
- Prompt treats the user description as untrusted input; the system prompt forbids inventing
  technologies and the output is schema-validated and re-checked against the graph
  regardless of what the model returns.

### 5.5 Frontend

A new "Recommend a stack" panel: text input → calls `/recommend` → highlights the returned
subgraph on the existing canvas and lists justified nodes; clicking a node opens the
existing detail panel. No separate graph surface (Req 4.7).

### 5.6 Open item (flagged)

Budget/latency ceiling for the AI call is still needed from the reviewer; it drives model
choice, timeout, and whether results are cached per normalized description.

### 5.7 Testing (2)

- `Recommender` tested end-to-end with `NullLLMClient`: deterministic, fully offline.
- Grounding filter test: inject a proposal containing a non-existent tech → it is dropped
  and reported.
- Compatibility test: proposed pair with no connecting edge → flagged/dropped.
- Adapter tests use recorded fixtures; no live provider call in CI.

---

## 6. Cross-cutting concerns

### 6.1 Backward compatibility matrix

| Change | Type | Breaks existing clients? |
|--------|------|--------------------------|
| Expanded dataset (1B) | data only | No |
| `--require-targets` validator flag | tooling | No (opt-in) |
| Frontend filters (1B) | FE only | No |
| `NodeDetail.summary?` (1C) | optional field | No |
| `data/cache/wikipedia/**` | generated artifact (gitignored) | No |
| `repo` / `package` node fields (1D) | optional schema fields | No |
| `GraphNode.popularity?`, `size_basis?` (1D) | optional fields | No |
| `data/popularity.json` | generated artifact | No |
| `POST /api/v1/recommend` (2) | new endpoint | No |

### 6.2 Config (env, following existing `TECHATLAS_*` convention)

- `TECHATLAS_WIKIPEDIA_LANG` (default `en`), `TECHATLAS_SUMMARY_TTL_DAYS` (default 30).
- `TECHATLAS_LLM_PROVIDER` (`null`|`openai`|`anthropic`|...), provider key via that
  provider's own env var; `null` is the default so the app runs with no external AI.
- Popularity source keys (e.g. `GITHUB_TOKEN`) are build-time only, never needed at request
  time.

### 6.3 Dependencies (new, pinned; added only when its phase starts)

- 1C: `httpx` (already a dev dep; promote to runtime for `SummaryService`).
- 1D: `httpx` for fetchers (build-time).
- 2: provider SDK(s) behind the adapter, optional extras so the base install stays lean.

### 6.4 CI

The existing full-check pipeline (build → validate → backend ruff+pytest → frontend
typecheck+lint+test+build) is extended per phase: 1B adds `--require-targets` to the
milestone job; 1C/1D/2 add their hermetic (mocked/fixtures) tests. No live network in CI.

---

## 7. Rollout order

Strictly sequential, each independently shippable and reversible:

1. **1B — dataset + filtering.** Highest value, no new services, no external deps. Expand
   data to targets; ship client-side filters. Gate with `--require-targets`.
2. **1C — Wikipedia summaries + caching.** Adds `SummaryService` + optional `summary` field.
   Pure enrichment; degrades gracefully if disabled.
3. **1D — popularity.** Adds offline ingestion + `data/popularity.json` + sizing integration.
   Depends on 1B (needs the fuller node set + `repo`/`package` mappings) but not on 1C.
4. **2 — recommendations.** Adds `/recommend` + `Recommender` + provider-independent
   `LLMClient`. Benefits from 1B/1D richness; `NullLLMClient` lets it ship without a vendor.

---

## 8. Documentation to update alongside implementation (not now)

`docs/architecture.md` milestone map, `data/seed/README.md` counts, and
`docs/development-setup.md` (new make targets: `make popularity`, summary cache warm) — all
updated when each phase lands, keeping docs honest about what exists.

---

## 9. Open items — status

1. **[RESOLVED] Master specification document** (external, read-only) — stays external; used
   read-only to confirm section text when needed. Does not block any phase.
2. **[RESOLVED] Popularity source licensing acceptance** (1D) — approved to proceed; each
   source's ToS/license recorded in `data/popularity/SOURCES.md` before it is enabled.
3. **[OPEN — deferred to later] AI budget/latency ceiling** (Phase 2 only) — reviewer will
   decide later. Blocks Phase 2 start only; 1B/1C/1D proceed independently.
