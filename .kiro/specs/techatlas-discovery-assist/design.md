# Design — TechAtlas Discovery-Assist Tool

**Status:** Design proposal for review. Realizes `requirements.md` under the architecture in
`architecture.md`. No implementation is authorized yet.

## 0. Principles

- Automate research, not judgment. Output is *proposals*, never dataset writes.
- Reuse the existing curated commit path and guardrails (`_apply.py`, validator).
- Offline, build-time, fixture-testable; never reachable from the API.
- Wikidata-first (structured, high-reliability); registry pass optional.

## 1. Module layout

```
scripts/discover/
  __init__.py
  discover.py              # orchestrator: fetch -> dedup -> enrich -> write staging
  promote.py               # APPROVED+complete candidates -> scripts/expand/_apply.py
  dedup.py                 # exclude already-present / self-colliding candidates
  enrich.py                # verifiable-fact enrichment + schema-valid slug/id + review flags
  sources/
    __init__.py
    wikidata.py            # SPARQL query per entity class -> RawCandidate[]
    registries.py          # optional: popular-but-missing via Phase 1D fetchers
data/discovery/            # generated, gitignored
  candidates.json
```

## 2. Source layer

### 2.1 Wikidata (`sources/wikidata.py`)

- Query the public SPARQL endpoint (`https://query.wikidata.org/sparql`,
  `format=json`, descriptive `User-Agent`) for entities that are `wdt:P31/wdt:P279*` of a
  target class, pulling label, description, official website (P856), and the English
  Wikipedia sitelink.
- **Class → node_subtype map** (only cleanly-mapping classes are queried):

  | Wikidata class | node_subtype |
  |----------------|--------------|
  | programming language (Q9143) | programming_language |
  | software framework (Q271680) | framework |
  | software library (Q188860) | library |
  | database management system (Q176165) | database |
  | web framework (Q1330354) | framework |
  | version control system (Q55680343) | developer_tool |
  | operating system (Q9135) | operating_system |
  | game engine (Q193424) | engine |

- Returns `RawCandidate` dataclasses; any HTTP/parse error → `[]` (requirement 1.4).
- Injected client for tests; no live network in CI.

### 2.2 Registries (`sources/registries.py`, optional, flag-gated)

- Reuses `scripts/popularity/sources/{github,packages}.py`. Given a curated watchlist of
  popular repos/packages, emit those **not already** in the graph as low-confidence
  candidates (subtype/domain/edges all left for review). Off by default.

## 3. Dedup (`dedup.py`)

- Load current `data/graph.json`. Build exclusion sets: node ids, `(node_type, slug)`,
  `wikidata_id`s, and normalized name+aliases.
- `_normalize` is copied/shared with the validator's rule (lowercase; keep `+` and `#`).
- Drop any raw candidate colliding on any key; collapse candidate-vs-candidate collisions,
  keeping the first and recording the drop.

## 4. Enrich (`enrich.py`)

- Derive `slug` from the name: lowercase, spaces/dots → `-`, strip disallowed chars, collapse
  repeats, validate against `^[a-z0-9][a-z0-9-]*$`; `id = f"technology:{slug}"`. If a valid
  slug can't be formed, drop with a reason.
- Fill `name`, `wikidata_id`, `wikipedia_title`, `official_url` from the source.
- `node_subtype`: set from the class map when confident; else null + add to `review.needs`.
- `short_description`: draft from Wikidata description (trimmed to schema's 280 max), marked
  `description_source`; always `review.needs` includes it as "verify".
- `primary_domain` = null and `edges` = [] always (requirement 3.3) → `review.needs`.
- `status = "NEEDS_REVIEW"`.

## 5. Orchestrator (`discover.py`)

```
python scripts/discover/discover.py [--registries] [--limit N] [--class SUBTYPE ...]
```
1. Gather raw candidates from enabled sources.
2. Dedup against the graph + each other.
3. Enrich survivors.
4. Write `data/discovery/candidates.json` (provenance + status + review flags).
5. Print a summary: discovered / deduped-out / staged, and how many need which fields.

Never writes `data/seed/`.

## 6. Promotion (`promote.py`)

```
python scripts/discover/promote.py            # promote all APPROVED+complete
python scripts/discover/promote.py --slug bun # promote one
```
- Read `candidates.json`; select `status == "APPROVED"`.
- Refuse (clear message, skip) any approved candidate missing `primary_domain` or with zero
  `edges` (requirement 5.2) — no half-formed nodes.
- Hand the node + edges to `scripts/expand/_apply.py::apply_batch(...)`, which applies the
  **same** dedup + edge endpoint pre-check used by every manual batch, then writes
  `data/seed/*.json`.
- Idempotent: `_apply.py` already skips existing ids/edges, so re-runs add nothing.
- After promotion, the curator runs the normal
  `build_dataset → validate_dataset → generate_layout` (or `make data`).

## 7. API & dataset impact

- **None at runtime.** No new API, no schema change (candidates use existing node fields).
- Dataset only changes via `promote.py` → `_apply.py` → validator, exactly like a manual
  batch. The committed `layout.json` stays reproducible.

## 8. Testing strategy (CI-safe, offline)

- `wikidata.py`: parse a recorded SPARQL JSON fixture into `RawCandidate`s; error → `[]`.
- `dedup.py`: candidate colliding on id / slug / wikidata_id / normalized alias is dropped;
  self-collision collapses to one.
- `enrich.py`: slug derivation + regex validity (incl. tricky names like "C++", "Node.js");
  subtype set only when class maps; domain + edges always blank + flagged.
- `promote.py`: APPROVED+complete promotes via a stubbed `_apply.py`; incomplete refused;
  idempotent re-run adds nothing.
- Registry pass: fixture-based, reusing Phase 1D fakes.
- No test performs live network I/O.

## 9. Dependencies

- `httpx` (already a runtime dep since Phase 1C) for SPARQL/registry fetches — build-time use
  here. No new third-party dependency anticipated.
- `scripts/discover/` excluded from ruff only if it mirrors the `scripts/expand/` precedent;
  otherwise kept lint-clean (preferred for shipped tooling).

## 10. Rollout

1. Wikidata source + dedup + enrich + staging output (core value; fully offline-testable).
2. `promote.py` wiring to `_apply.py`.
3. Optional registry pass behind `--registries`.
4. Docs: `development-setup.md` (new `make discover` / `make promote` optional targets) and
   a note in `data/seed/README.md` that discovery only *proposes*.

## 11. Open items (from requirements)

1. Wikidata-only vs. + registry pass — design defaults to Wikidata-first, registry optional.
2. JSON-staging review vs. interactive CLI loop — design defaults to JSON-first; a small
   `review.py` approve/skip/edit loop can be added later without changing the contract.
