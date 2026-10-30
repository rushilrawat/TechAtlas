# Tasks — TechAtlas Discovery-Assist Tool

Implementation plan derived from `requirements.md` and `design.md`. **No task is started
until the reviewer approves this spec** (it is new scope beyond `techatlas-phases-1b-to-2`).

## Conventions

- Offline/build-time only; never importable from `backend/app`.
- No live network in CI — fetchers tested against recorded fixtures with injected clients.
- The tool only *proposes*; the dataset changes exclusively via `promote.py` →
  `scripts/expand/_apply.py` → validator.
- `[ ]` = not started. `_Requirements:` tags reference `requirements.md`.

## Gating

- **APPROVED** (reviewer, this session). Resolved open questions: (1) Wikidata-first with
  the registry pass as an optional `--registries` flag; (2) JSON-staging review.

---

### 1. Wikidata source
- [x] `scripts/discover/sources/wikidata.py`: SPARQL query per target entity class →
      `RawCandidate` (wikidata_id, label, description, official website, enwiki title).
- [x] Class→subtype map for cleanly-mapping classes only; injected client; error → `[]`;
      unmapped classes skipped (no query issued).
- [x] Tested against a recorded SPARQL JSON fixture; no live network.
- _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1_

### 2. Dedup against the graph
- [x] `scripts/discover/dedup.py`: exclude candidates colliding on id / (type,slug) /
      wikidata_id / normalized alias; collapse candidate-vs-candidate collisions; drop
      unsluggable names.
- [x] Shares the validator's `_normalize` rule (lowercase, keep `+`/`#`).
- [x] Tests for each collision key + self-collision + unsluggable.
- _Requirements: 2.1, 2.2, 2.3_

### 3. Enrich (verifiable facts only)
- [x] `scripts/discover/enrich.py`: schema-valid slug/id derivation; fill name /
      wikidata_id / wikipedia_title / official_url; subtype only when class-confident;
      draft description (≤280, flagged for verification); `primary_domain` + `edges` left
      blank and flagged in `review.needs`.
- [x] Tests incl. tricky names (C++, C#, Node.js) and the never-invent-domain/edges rule.
- _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.4_

### 4. Orchestrator + staging output
- [x] `scripts/discover/discover.py`: fetch → dedup → enrich → write
      `data/discovery/candidates.json` with provenance, status=NEEDS_REVIEW, review flags,
      and a summary. Never writes `data/seed/`. Runs as `python -m discover.discover`.
- [x] Gitignore `data/discovery/`.
- [x] Verified end-to-end: offline run degrades gracefully (0 candidates, valid file).
- _Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 6.2_

### 5. Promotion through the existing commit path
- [x] `scripts/discover/promote.py`: select APPROVED candidates; refuse incomplete
      (missing domain or zero edges); hand complete ones to `scripts/expand/_apply.py`;
      idempotent; `--dry-run` and `--slug` flags.
- [x] Tests: approved+complete promotes (stubbed `_apply.py`), incomplete refused,
      selection logic.
- [x] Verified a simulated promotion: added 1 tech + 3 edges via `_apply.py`, validated
      clean at 252 tech, idempotent re-run, then reverted (committed dataset unchanged).
- _Requirements: 5.1, 5.2, 5.3, 5.4, 6.3_

### 6. Optional registry pass (flag-gated)
- [x] `scripts/discover/sources/registries.py`: reuses the Phase 1D github/packages
      fetchers (imported as the `popularity.sources` package to avoid name clashes) to
      surface popular-but-missing watchlist entries as low-confidence candidates; off by
      default (`--registries`).
- [x] Fixture-based tests (reachable → proposed; unreachable/error → none; never raises).
- _Requirements: 1.5, 6.1_

### 7. Wrap-up
- [x] `make discover` / `make promote` targets + `docs/development-setup.md` section.
- [x] Note in `data/seed/README.md` that discovery only *proposes*; humans still curate.
- _Requirements: 6.2, 6.3_

### 8. Hands-off weekly auto-ingest (reviewer-requested, auto-PR)
- [x] `scripts/discover/auto_ingest.py`: discover → dedup → **safe auto-placement**
      (real identity + deterministic `primary_domain` from the Wikidata class via
      `CLASS_TO_DOMAIN` + the single `belongs_to_domain` edge) → `_apply.py`. Nodes marked
      `auto_added: true`. Never auto-generates richer typed edges.
- [x] `auto_added` added to the node schema (`data/schema/graph-schema.json`).
- [x] Carry the exact Wikidata class QID on each candidate so domain mapping is
      unambiguous (two classes can share a subtype).
- [x] `.github/workflows/discovery.yml`: weekly cron → auto-ingest → rebuild + validate
      (`--require-targets`) + layout → open a review PR (peter-evans/create-pull-request);
      never pushes to main directly. `make discover-auto` for local runs.
- [x] Tests: deterministic placement + single belongs_to_domain edge, never-invent-rich-
      edges, dedup against the existing graph.
- _Requirements: 1.1–1.4, 2.1, 6.3 (automation layered on the same curated gate)_

---

## Done-definition

- `make discover` (or the script) writes a reviewable `candidates.json` of real,
  deduped, source-attributed proposals — and touches no `data/seed/` file.
- A reviewed+completed candidate promotes via `_apply.py` and passes the full
  build→validate→layout pipeline.
- Entire tool is offline/fixture-tested; no live network in CI; guardrails never relaxed.
