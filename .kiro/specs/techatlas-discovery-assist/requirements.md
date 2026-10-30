# Requirements — TechAtlas Discovery-Assist Tool

## Status

Requirements draft for review. This is a **new, separately-scoped spec** sitting beside
`techatlas-phases-1b-to-2`. No implementation is authorized by this document.

## Problem & intent

Manually researching every new technology (name, classification, official URL, Wikipedia /
Wikidata identity) is the slow part of growing the graph. This tool **automates the
research, not the judgment**: it scans authoritative structured sources to *propose*
candidate technologies for a human to review, enrich, and approve — then those approved
candidates flow through the **existing** curated commit path (`scripts/expand/_apply.py` +
`scripts/validate_dataset.py`).

## Non-negotiable principle this spec must uphold

The project forbids a "larger but unreliable" dataset and requires every node to be
hand-verified (`data/seed/README.md`, spec §4, §25). Therefore:

- The tool SHALL NOT write directly into `data/seed/*.json`.
- The tool SHALL NOT invent classifications it cannot source (domain assignment, typed
  edges), leaving those for human decision.
- A human SHALL remain the gate between discovery and the dataset.

## Context this spec is grounded in (verified)

- Nodes live in `data/seed/{domains,concepts,technologies}.json`; a technology node needs
  `id` (`technology:<slug>`), `slug`, `name`, `node_type`, `node_subtype`, `primary_domain`,
  `short_description`, and optional `official_url` / `documentation_url` /
  `wikipedia_title` / `wikidata_id` / `aliases` / `lifecycle_status`
  (`data/schema/graph-schema.json`).
- `scripts/expand/_apply.py` already refuses duplicate ids/(type,slug) and pre-checks edge
  endpoint rules before writing — the approved commit path.
- Phase 1D added `scripts/popularity/` with GitHub/npm/PyPI/crates fetchers and a
  source-attributed, offline, fixture-tested pattern this tool will reuse.
- The 11 existing domains and their ids are fixed in `data/seed/domains.json`.

---

## Requirement 1 — Candidate discovery from authoritative structured sources

**User story:** As a curator, I want the tool to pull candidate technologies from
structured, authoritative sources, so that proposals come with real identities rather than
scraped guesses.

### Acceptance criteria (EARS)

1.1. WHEN discovery runs, THEN the system SHALL query authoritative **structured** sources
(Wikidata as the primary source; optionally GitHub/package registries) and SHALL NOT scrape
arbitrary freeform web pages.

1.2. WHERE a candidate comes from Wikidata, the system SHALL capture its real `wikidata_id`,
canonical label, and — when present on the entity — official website and English Wikipedia
title, as structured fields (never guessed from the name).

1.3. WHEN a Wikidata query is issued, THEN the system SHALL target specific entity classes
(e.g. programming language, software framework, library, database, etc.) that map to the
project's `node_subtype` enum, so candidates arrive pre-classified by source where possible.

1.4. IF a source is unavailable or returns an error, THEN the system SHALL degrade
gracefully (emit the candidates it could gather, report the failure) and SHALL NOT fabricate
candidates.

1.5. WHERE the optional registry pass is enabled, the system SHALL surface high-popularity
GitHub repos / packages that are not yet in the graph, reusing the Phase 1D fetch pattern.

---

## Requirement 2 — Deduplication against the existing graph

**User story:** As a curator, I don't want to re-review technologies already in the graph.

### Acceptance criteria (EARS)

2.1. WHEN a candidate is produced, THEN the system SHALL exclude it if its proposed `id`,
`(node_type, slug)`, `wikidata_id`, or any normalized alias already exists in the current
dataset.

2.2. WHEN comparing names/aliases for dedup, THEN the system SHALL use the same
normalization rule the validator uses (lowercase, keep `+`/`#`) so matches are consistent.

2.3. WHERE two discovered candidates collide with each other, the system SHALL keep one and
record the collision rather than emitting duplicates.

---

## Requirement 3 — Enrichment limited to verifiable facts

**User story:** As a curator, I want each proposal pre-filled with the facts that can be
verified, and left blank where they can't, so I know exactly what still needs human input.

### Acceptance criteria (EARS)

3.1. WHEN building a proposal, THEN the system SHALL auto-fill only source-backed fields:
`name`, `wikidata_id`, `wikipedia_title`, `official_url`, and a proposed `slug`/`id` derived
from the name.

3.2. WHERE the source provides an entity class that maps cleanly to a `node_subtype`, the
system SHALL set `node_subtype`; otherwise it SHALL leave it null and flag it for review.

3.3. The system SHALL NOT auto-assign `primary_domain` or any typed edges; these SHALL be
left empty with an explicit "NEEDS REVIEW" marker (requirement: judgment stays human).

3.4. WHERE a short description is taken from a source (e.g. Wikidata description / Wikipedia
extract), the system SHALL record the source and SHALL mark it as unverified draft text, not
final copy.

3.5. WHEN a proposed `slug`/`id` is generated, THEN it SHALL conform to the schema pattern
(`^[a-z0-9][a-z0-9-]*$`) and the `technology:` id prefix.

---

## Requirement 4 — Human-review staging output (never direct writes)

**User story:** As a curator, I want proposals written to a staging file I can review and
edit, never injected straight into the dataset.

### Acceptance criteria (EARS)

4.1. WHEN discovery completes, THEN the system SHALL write proposals to a staging artifact
(e.g. `data/discovery/candidates.json`), and SHALL NOT modify any `data/seed/*.json` file.

4.2. WHERE a proposal is incomplete (missing domain, subtype, or edges), the system SHALL
mark it with an explicit review status so no unreviewed node can be mistaken for ready.

4.3. WHEN the staging artifact is written, THEN each candidate SHALL carry its provenance
(source, source id/URL, retrieval timestamp) for auditability.

4.4. The staging artifact SHALL be a generated artifact (gitignored), consistent with how
`data/popularity.json` and caches are treated.

---

## Requirement 5 — Promotion through the existing curated commit path

**User story:** As a curator, after I review and complete a candidate, I want to promote it
using the same validated path the manual batches use.

### Acceptance criteria (EARS)

5.1. WHEN a curator marks a candidate approved and complete (domain + at least one typed
edge supplied), THEN a promotion step SHALL hand it to `scripts/expand/_apply.py` so the
existing dedup + edge endpoint pre-check apply before anything is written.

5.2. IF an approved candidate is still missing a `primary_domain` or has zero edges, THEN
the promotion step SHALL refuse it with a clear message (no orphan/half-formed nodes).

5.3. WHEN promotion writes to `data/seed/*.json`, THEN the normal
`build_dataset → validate_dataset (--require-targets in CI) → generate_layout` pipeline
SHALL still pass with zero errors.

5.4. The promotion step SHALL be idempotent: re-running with an already-promoted candidate
adds nothing.

---

## Requirement 6 — Offline-testable, CI-safe, attributed

**User story:** As a maintainer, I want this tool to be testable without live network and to
never weaken the project's honesty guarantees.

### Acceptance criteria (EARS)

6.1. WHEN the tool's fetchers are tested, THEN they SHALL run against recorded fixtures with
an injected client, performing no live network calls in CI (matching the Phase 1C/1D
pattern).

6.2. The discovery tool SHALL be offline/build-time only and SHALL NOT be importable by or
reachable from the API request path.

6.3. The tool SHALL never relax the validator or the `_apply.py` guardrails; it only feeds
them.

6.4. Every proposed field that originates from a source SHALL retain attribution so a
reviewer can trace it.

---

## Out of scope

- Fully automated insertion of nodes or edges into the dataset.
- Auto-generating typed relationships (`implements`, `alternative_to`, etc.).
- Auto-assigning domains.
- Adding new domains (the 11 domains are a deliberate editorial structure).
- Freeform web scraping / HTML parsing of arbitrary sites.

## Open questions

1. **Source scope:** Wikidata-only (highest reliability) vs. Wikidata + a GitHub/registry
   "trending but missing" pass. Design proposes Wikidata-first with the registry pass as an
   optional flag — confirm.
2. **Review UX:** is a JSON staging file + manual edit sufficient for now, or is a small
   CLI review loop (approve/skip/edit) wanted? Design proposes JSON-first.
