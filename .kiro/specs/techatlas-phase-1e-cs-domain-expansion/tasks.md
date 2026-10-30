# Implementation Plan: Phase 1E — Computer Science Domain Expansion

## Overview

Phase 1E is a **data and tooling expansion, not a new application.** The plan converts the
approved design into incremental, code-level steps that flow through the pipeline that already
exists:

```
scripts/expand/*.py (data-only batches) → _apply.py (dedup + endpoint pre-check)
  → data/seed/*.json → build_dataset.py → validate_dataset.py[--require-targets]
  → generate_layout.py → backend/frontend/dataset/e2e tests → deploy gate
```

Work is executed in the **strict priority order** fixed by the design (Requirement 3.7): a
cross-cutting **Audit + Taxonomy** step first, then four sequential batches
**Systems → Theory → Interdisciplinary → AI**. No node or edge for a lower-priority batch is
authored until every higher-priority batch is committed and validated. Each batch is a
self-contained module calling `apply_batch()` and ends on a green `validate_dataset.py` run.

The **required path** delivers: the audit, the recorded taxonomy decisions, at least one node
per sub-area for all 15 fields, every named cross-domain edge, deterministic layout with
unchanged-node stability, the full `--require-targets` gate, and all preservation/independence
tests. Tasks marked `*` are optional and **deepen curation** (more concepts/technologies per
field) or add supplementary tests — they are not required for the milestone.

### Hard constraints (apply to every authoring task)

- **No fabrication (NFR-2, Req 7.5):** never invent a node, edge, popularity figure, or
  percentage. Absence of data is encoded as absence (no fabricated/default popularity —
  Req 8.8).
- **Provenance (Req 5.3/5.4, 7.6):** every significant / cross-domain edge carries a non-empty
  `source_reference`; `is_curated=true` only when hand-verified against that source (Req 5.6).
- **Canonical identity / no duplication (NFR-1, Req 6):** audit first; reuse existing
  Canonical_IDs; never duplicate or reassign an id. `_apply.py` + validator are the backstop.
- **Closed enums authoritative (NFR-3, Req 10):** only enum values from
  `data/schema/graph-schema.json`; any new value is a deliberate schema change (schema +
  validator updated together, before use).
- **Preservation (NFR-6, Req 8):** Phase 1D popularity sizing, search, exact `wikipedia_title`
  resolution, and the Repo X-Ray scanner's `package`/`repo`/`aliases` matching keep working.
- **Determinism (NFR-5, Req 9):** layout stays byte-identical on re-run; unchanged nodes keep
  their exact coordinates via cross-version pinning; no-overlap margin from `scripts/sizing.py`.
- **Acceptance gate (NFR-4, Req 11.1):** `scripts/validate_dataset.py --require-targets` exit 0
  is the sole acceptance signal; `DATASET_VERSION` bumped per semver (Req 11.2).
- **Independence (Req 12):** Phase 1E must build, validate, and deploy with no Repo X-Ray
  scanner code/config present; no Phase 2 AI functionality (Req 12.3).

## Tasks

- [ ] 1. Cross-cutting audit and taxonomy decisions (gates all authoring)
  - [ ] 1.1 Author the Node_Audit equivalence check and produce the reuse-vs-new decision list
    - Write a script/notebook under `scripts/expand/` (e.g. `_audit_1e.py`) that loads all
      existing nodes from `data/seed/{domains,concepts,technologies}.json` and compares every
      planned Phase 1E entity against all 417 nodes
    - Implement the equivalence predicate exactly per design: match on **normalized name**
      (lowercase, whitespace/punctuation-trimmed, preserving `+` and `#` — mirror the
      validator's `_normalize`) **or** a shared `(node_type, slug)` pair
    - Emit a decision list marking each planned entity as **reuse `<existing id>`** or
      **new `<minted id>`**; confirm likely reuse candidates (Python, CUDA, TCP/IP, OpenCV,
      Vulkan) against the seed before authoring
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
    - _Validates design Property 4 (equivalence correctness), Property 3 (no-duplication)_
    - Note: `_apply.py` dedup + validator duplicate checks are the enforcement backstop; the
      audit is the first line.

  - [ ] 1.2 Record the per-field taxonomy decisions and resolve the open questions
    - Produce a committed decision record (in design.md's decision table / a batch-level
      docstring) classifying each of the 15 fields as exactly one of
      {new top-level Domain, Subdomain, Concept_Hub}, naming the parent/host Domain id (for
      Subdomain/Concept_Hub) and a non-empty rationale sentence per field
    - Resolve the open questions to concrete values before authoring: Computer Networks
      (recommended `domain:networks` top-level), CS Theory host (`domain:theory` top-level),
      Robotics (recommended `domain:robotics` top-level), HCI (Concept_Hub under
      `domain:frontend`), Computer Graphics (Subdomain of `domain:gamedev`); any flipped to a
      fallback becomes a Subdomain of `domain:systems` with no other change
    - Record the ISA decision explicitly: map every ISA (RISC-V, ARM, x86, MIPS) to the
      existing `architecture` subtype (recommended default, no schema change), applied
      identically to every ISA node
    - _Requirements: 1.7, 4.1, 4.2, 4.3, 4.4, 3.7_
    - _Validates design Property 10 (exactly-one-category), Property 11 (decision-record
      completeness), Property 13 (ISA single subtype)_
    - Gate: no batch authoring begins until 1.1 and 1.2 are complete.

- [ ]* 1.3 Guarded ISA / schema-change task (ONLY if 1.2 chooses to add a subtype)
  - Taken **only** if the taxonomy decision selects option (a) (add
    `instruction_set_architecture` to `node_subtype`) instead of the recommended
    `architecture` mapping
  - In a single change set, edit `data/schema/graph-schema.json`
    (`definitions.node.properties.node_subtype.enum`) **and** `scripts/validate_dataset.py`
    (and `scripts/expand/_apply.py` `ENDPOINT_RULES` if the value participates in an endpoint
    rule) **before** any node references the new value
    - _Requirements: 1.8, 10.2, 10.3_
    - _Validates design Property 1 (closed-enum invariant)_
    - Default path skips this task entirely (recommended ISA → `architecture`).

- [ ] 2. Priority 1 — Systems batch (authored first)
  - [ ] 2.1 Author `scripts/expand/systems_cs.py` batch module (data-only, calls `apply_batch`)
    - Add at least one node for each of the five Systems sub-areas: Computer Architecture
      (Subdomain of `domain:systems`), Computer Networks (top-level `domain:networks` or
      fallback Subdomain), Embedded & Real-Time Systems (Subdomain), High-Performance Computing
      (Subdomain), Measurement & Performance Analysis (`concept:performance-analysis` hub)
    - Realize Subdomains as `domain` nodes with a single
      `domain:<parent> -has_subdomain-> domain:<child>` edge (both endpoints `domain`); realize
      the Concept_Hub as exactly one `concept` node with children attached via closed-enum
      relationships; set each new node's `primary_domain` to an existing domain id
    - On every new Technology node (e.g. RISC-V, ARM) set a closed-enum `node_subtype`
      (ISAs → `architecture`), and populate `package`/`repo`/`aliases` for scanner resolution
      and exact `wikipedia_title`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 3.7, 4.5, 4.6, 7.1, 7.2, 7.7, 8.4, 8.5, 12.2_
    - _Validates design Properties 2, 7, 9, 12, 13, 15, 17_

  - [ ] 2.2 Author the Systems cross-domain edges
    - Create the named Computer Networks edges: to `domain:backend`, to `domain:security`, and
      to networking concepts (TCP/IP, DNS, routing); create the HPC edges: to computer
      architecture, to CUDA, to distributed computing, to machine learning
    - Each edge: exactly one closed-enum `relationship_type` (prefer typed relationships over
      `related_to` where directed meaning is accurate), a non-empty `source_reference`, and
      `is_curated=true` only when hand-verified against that source
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 7.6_
    - _Validates design Property 7 (endpoint rules), Property 8 (provenance on significant
      edges)_

  - [ ] 2.3 Build and validate the Systems batch
    - Run `scripts/build_dataset.py`, then `scripts/validate_dataset.py` (without
      `--require-targets` during iteration); fix every reported duplicate, endpoint, enum,
      `primary_domain`, or provenance issue until exit 0
    - _Requirements: 6.7, 6.8, 10.4, 11.1_
    - _Validates design Property 1, Property 3, Property 9_

  - [ ]* 2.4 Deepen Systems curation
    - Add further concepts/technologies per Systems sub-area (caches, MPI, OpenMP, RTOS, ESP32,
      benchmarking/profiling/latency/throughput) with provenance and scanner fields; re-run
      build + validate
    - _Requirements: 2.1, 7.1, 7.6, 8.5_

- [ ] 3. Checkpoint — Systems batch validated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Priority 2 — Theory batch (authored only after Systems is committed and validated)
  - [ ] 4.1 Author `scripts/expand/theory.py` batch module
    - Add the new `domain:theory` host (if chosen) and at least one node for each sub-area:
      Algorithms & Complexity (Subdomain of `domain:theory`), Logic & Verification (Subdomain),
      Cryptography (`concept:cryptography` hub under `domain:theory`); skip any element the
      audit marked as an existing equivalent
    - Apply the same realization rules (has_subdomain edges between domains; one concept node
      per hub; `primary_domain` → existing domain), scanner fields, and exact `wikipedia_title`
    - _Requirements: 3.1, 3.4, 3.5, 3.7, 3.8, 4.5, 4.6, 7.1, 7.7, 8.5, 12.2_
    - _Validates design Properties 3, 7, 9, 12, 15, 17_

  - [ ] 4.2 Author the Theory cross-domain edges
    - Create the named Cryptography edges: to `domain:theory`, to `domain:security`, to an
      authentication concept, and to a distributed systems concept; closed-enum type +
      non-empty `source_reference` + honest `is_curated`
    - _Requirements: 3.6, 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 7.6_
    - _Validates design Property 7, Property 8_

  - [ ] 4.3 Build and validate the Theory batch
    - Run build + `validate_dataset.py` (no `--require-targets`); resolve all errors until
      exit 0
    - _Requirements: 6.7, 6.8, 10.4, 11.1_
    - _Validates design Property 1, Property 3_

  - [ ]* 4.4 Deepen Theory curation
    - Add further concepts/techs (Big-O, graph algorithms, P vs NP, dynamic programming; AES,
      RSA, hashing, digital signatures, zero-knowledge proofs; formal methods, model checking,
      SAT/SMT, theorem proving) with provenance; re-run build + validate
    - _Requirements: 3.1, 7.1, 7.6_

- [ ] 5. Priority 3 — Interdisciplinary batch (authored only after Theory is committed)
  - [ ] 5.1 Author `scripts/expand/interdisc.py` batch module
    - Add at least one node for each sub-area: Human-Computer Interaction
      (`concept:human-computer-interaction` hub under `domain:frontend`), Robotics (top-level
      `domain:robotics` or fallback Subdomain), Computer Graphics (Subdomain of
      `domain:gamedev`), Visualization (`concept:data-visualization` hub under
      `domain:frontend`); skip audited existing equivalents
    - Same realization rules + scanner fields (ROS 2, D3.js, Vulkan) + exact `wikipedia_title`
    - _Requirements: 3.2, 3.4, 3.5, 3.7, 3.8, 4.5, 4.6, 7.1, 7.7, 8.5, 12.2_
    - _Validates design Properties 3, 7, 9, 12, 15, 17_

  - [ ] 5.2 Author the Interdisciplinary cross-domain edges
    - Create the named Computer Graphics → `domain:gamedev` edge and the HCI edges: to
      `domain:frontend`, to an accessibility concept, to a design concept, and to the
      Visualization hub; closed-enum type + provenance + honest `is_curated`
    - _Requirements: 3.6, 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 7.6_
    - _Validates design Property 7, Property 8_

  - [ ] 5.3 Build and validate the Interdisciplinary batch
    - Run build + `validate_dataset.py` (no `--require-targets`); resolve all errors until
      exit 0
    - _Requirements: 6.7, 6.8, 10.4, 11.1_
    - _Validates design Property 1, Property 3_

  - [ ]* 5.4 Deepen Interdisciplinary curation
    - Add further concepts/techs (UX/usability/interaction design; SLAM, motion planning,
      perception; rendering/shaders/ray tracing; scientific visualization) with provenance;
      re-run build + validate
    - _Requirements: 3.2, 7.1, 7.6_

- [ ] 6. Checkpoint — Theory and Interdisciplinary batches validated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Priority 4 — AI batch (authored last, reusing existing `domain:ai-ml`)
  - [ ] 7.1 Author `scripts/expand/ai_expansion.py` batch module
    - Broaden existing `domain:ai-ml` (reuse the domain — do NOT create a duplicate): add at
      least one node for Computer Vision (Subdomain of `domain:ai-ml`), Natural Language
      Processing (Subdomain), and Web & Information Retrieval
      (`concept:information-retrieval` hub under `domain:ai-ml`); skip audited existing
      equivalents (e.g. reuse OpenCV/Python if present)
    - Same realization rules + scanner fields (YOLO, NLTK, spaCy) + exact `wikipedia_title`
    - _Requirements: 3.3, 3.4, 3.5, 3.7, 3.8, 4.6, 4.8, 7.1, 7.7, 8.5, 12.2_
    - _Validates design Properties 3, 7, 9, 12, 15, 17_

  - [ ] 7.2 Author the AI cross-domain edges
    - Create the named Computer Vision edges: to `domain:ai-ml`, to Robotics, to Graphics, to
      Python (`written_in` only where the target is a `programming_language`, else `used_for`),
      and to GPU computing (CUDA); closed-enum type + provenance + honest `is_curated`
    - _Requirements: 3.6, 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 7.6_
    - _Validates design Property 7, Property 8_

  - [ ] 7.3 Build and validate the AI batch
    - Run build + `validate_dataset.py` (no `--require-targets`); resolve all errors until
      exit 0
    - _Requirements: 6.7, 6.8, 10.4, 11.1_
    - _Validates design Property 1, Property 3_

  - [ ]* 7.4 Deepen AI curation
    - Add further concepts/techs (image classification/object detection/segmentation;
      tokenization/transformers/embeddings; search engines/indexing/ranking/vector search/RAG)
      with provenance; re-run build + validate
    - _Requirements: 3.3, 7.1, 7.6_

- [ ] 8. Dataset-validation and correctness property tests
  - [ ]* 8.1 Property test — closed-enum invariant and all-offenders-in-one-run
    - **Property 1: Closed-enum invariant**
    - **Validates: Requirements 1.2, 1.8, 2.5, 4.7, 5.1, 5.2, 7.2, 7.3, 7.4, 10.1, 10.2, 10.4**
    - Hypothesis over random node/edge sets; assert `validate` reports every offending
      node/edge and exits non-zero; min 100 iterations

  - [ ]* 8.2 Property test — node_subtype only on technologies
    - **Property 2: node_subtype permitted only on technologies**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 8.3 Property test — no-duplication / idempotent merge
    - **Property 3: No-duplication / idempotent merge**
    - **Validates: Requirements 3.8, 4.8, 6.3, 6.4, 6.7, 6.8**
    - Re-running a batch adds zero nodes; injected duplicates make the validator report every
      conflicting id and `(node_type, slug)` pair

  - [ ]* 8.4 Property test — node-equivalence function correctness
    - **Property 4: Node-equivalence function correctness**
    - **Validates: Requirements 6.2**
    - Assert equivalence iff normalized names equal (preserving `+`/`#`) or shared
      `(node_type, slug)`

  - [ ]* 8.5 Property test — Canonical-ID pattern, global uniqueness, and preservation
    - **Property 5: Canonical-ID pattern and global uniqueness**
    - **Property 6: Canonical-ID preservation**
    - **Validates: Requirements 6.5, 6.6**
    - Assert new ids match `^(domain|concept|technology):[a-z0-9-]+$`, are globally unique, and
      the 417 pre-existing ids are preserved exactly

  - [ ]* 8.6 Property test — relationship endpoint rules
    - **Property 7: Relationship endpoint rules**
    - **Validates: Requirements 2.2, 3.4, 4.5, 5.8**
    - Exercise `_apply.py` `_precheck` / `validate` for `has_subdomain`, `belongs_to_domain`,
      `written_in`, `implements`, `used_for`, `supports`, `enables`

  - [ ]* 8.7 Property test — provenance on significant edges
    - **Property 8: Provenance on significant edges**
    - **Validates: Requirements 5.3, 5.4, 7.6**

  - [ ]* 8.8 Property test — primary_domain references an existing domain
    - **Property 9: primary_domain references an existing domain**
    - **Validates: Requirements 2.6, 2.7**

  - [ ]* 8.9 Property test — ISA nodes share one chosen subtype
    - **Property 13: ISA nodes share one chosen subtype**
    - **Validates: Requirements 1.7**

  - [ ]* 8.10 Property test — require-targets gate correctness
    - **Property 22: Require-targets gate correctness**
    - **Validates: Requirements 11.1**
    - Assert `--require-targets` exits 0 iff all checks pass and counts meet
      `>= 250` techs / `150..170` concepts

- [ ] 9. Preservation tests (popularity, search, Wikipedia, scanner, backward-compat)
  - [ ]* 9.1 Property test — sizing regression and popularity fallback
    - **Property 14: Sizing regression and popularity fallback**
    - **Validates: Requirements 8.1, 8.8**
    - Assert `scripts/sizing.py` reproduces the Phase 1D radius for identical inputs and uses
      the connectivity fallback (no fabricated size) when popularity is absent

  - [ ]* 9.2 Property test — scanner-required field presence on new tech
    - **Property 15: Scanner-required field presence**
    - **Validates: Requirements 8.5, 12.2**
    - Assert a real-package/repo technology is rejected (with the missing field named) iff it
      lacks `package`/`repo`/`aliases`

  - [ ]* 9.3 Property test — search by name or alias
    - **Property 16: Search by name or alias**
    - **Validates: Requirements 8.2**

  - [ ]* 9.4 Property test — exact wikipedia_title resolution
    - **Property 17: Exact wikipedia_title resolution**
    - **Validates: Requirements 8.3**
    - Resolver uses the exact `wikipedia_title` verbatim (fetch mocked), never name-derived

  - [ ]* 9.5 Property test — backward-compatible shape superset
    - **Property 18: Backward-compatible shape superset**
    - **Validates: Requirements 8.6, 8.7**
    - Snapshot the pre-expansion `/api/v1` response + schema field set; assert the
      post-expansion set is a superset (no field removed/renamed)

- [ ] 10. Detail_Panel locking test (no new UI code)
  - [ ] 10.1 Add a frontend test asserting node_type/node_subtype rendering
    - Using the existing `NodeDetailsPanel.test.tsx` harness: render a `technology` node and
      assert the type line shows `Technology · <subtype>`; render a `domain`/`concept` node and
      assert it shows just `Domain`/`Concept` with no subtype; add a case with a **new**
      subtype string to confirm it renders through the generic underscore-to-space path without
      code change
    - _Requirements: 1.4, 1.5_

- [ ] 11. Layout regeneration and determinism after the version bump
  - [ ] 11.1 Regenerate layout and verify stability + determinism
    - After the `DATASET_VERSION` bump, run `scripts/generate_layout.py`; confirm new domains
      are placed through the deterministic pipeline honoring the no-overlap constraint, and
      that `prev_version != version` triggers cross-version pinning for unchanged nodes
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [ ]* 11.2 Property tests — layout determinism, pinning, and no-overlap margin
    - **Property 19: Layout determinism** (byte-identical coordinates on re-run)
    - **Property 20: Cross-version coordinate stability** (zero positional delta for unchanged
      nodes)
    - **Property 21: No-overlap margin** (edge-to-edge gap >= margin from `scripts/sizing.py`)
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ]* 11.3 Unit test — single sizing source
    - Assert no sizing/margin constants are defined outside `scripts/sizing.py` (except
      `OVERLAP_MARGIN` in the layout generator) and that both the layout generator and the
      backend import from `scripts/sizing.py`
    - _Requirements: 9.6_

- [ ] 12. Final verification, versioning, and pre-deploy gate
  - [ ] 12.1 Bump the Dataset_Version (semver)
    - Increment `DATASET_VERSION` in `scripts/build_dataset.py` per semver: additive data →
      MINOR; backward-incompatible schema/data → MAJOR; structure-preserving correction → PATCH
      (Phase 1E is additive → MINOR). New version must be valid semver and strictly greater
    - _Requirements: 11.2_

  - [ ]* 12.2 Unit test — semver sanity
    - Assert the new `DATASET_VERSION` is valid semver and strictly greater than the previous
    - _Requirements: 11.2_

  - [ ] 12.3 Run the full Build_Pipeline with the acceptance gate
    - Run `build_dataset.py` → `validate_dataset.py --require-targets` (must exit 0) →
      `generate_layout.py`, in that order, against the real dataset; fix any failure before
      proceeding
    - _Requirements: 11.1, 11.3, 11.4_
    - _Validates design Property 22_

  - [ ] 12.4 Run backend, frontend, and dataset test suites
    - Execute the project's backend, frontend, and dataset test suites (single-run mode, not
      watch); all must pass
    - _Requirements: 11.4_

  - [ ]* 12.5 Browser / e2e render test
    - Playwright suite renders the expanded graph; snapshot/visual regression confirms
      pre-existing nodes and edges render with the same visual representation and layout as
      before, and new domains render
    - _Requirements: 11.5_

  - [ ]* 12.6 Pipeline-independence test (Repo X-Ray absent)
    - Assert the Build_Pipeline, validation, and deploy complete with no Repo X-Ray scanner
      code/config present, and that no Phase 2 AI functionality is included
    - _Requirements: 12.1, 12.3_

  - [ ] 12.7 Deploy gate
    - Gate deploy on all of 12.3, 12.4 (and, when run, 12.5) passing; if any Build_Pipeline
      stage exits non-zero or any e2e test fails, abort deploy and leave the live dataset
      unchanged, reporting the failing stage/test
    - _Requirements: 11.3, 11.4_

- [ ] 13. Final checkpoint — all gates green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional: they deepen per-field curation (more concepts/techs
  beyond the required one-node-per-sub-area) or add supplementary property/e2e tests. The
  required path delivers the audit + taxonomy, at least one node per sub-area for all 15
  fields, every named cross-domain edge, the version bump + layout, and the `--require-targets`
  gate with backend/frontend/dataset tests.
- Each task references the specific requirements it satisfies and, where relevant, the design
  correctness property it validates.
- The four batches are strictly ordered (Systems → Theory → Interdisciplinary → AI); no
  lower-priority node/edge is authored before all higher-priority batches are committed and
  validated (Req 3.7).
- Property-based tests use Python **Hypothesis** (dataset/validator/sizing/layout) /
  TypeScript **fast-check** (search/shape), min 100 iterations, each tagged
  `Feature: techatlas-phase-1e-cs-domain-expansion, Property {n}: {property text}`.
- Task 1.3 is a guarded optional path taken only if the taxonomy decision adds a
  `node_subtype`; the default maps ISAs to the existing `architecture` subtype (no schema
  change).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["2.4", "4.1"] },
    { "id": 6, "tasks": ["4.2"] },
    { "id": 7, "tasks": ["4.3"] },
    { "id": 8, "tasks": ["4.4", "5.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["5.3"] },
    { "id": 11, "tasks": ["5.4", "7.1"] },
    { "id": 12, "tasks": ["7.2"] },
    { "id": 13, "tasks": ["7.3"] },
    { "id": 14, "tasks": ["7.4", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "9.1", "9.2", "9.3", "9.4", "9.5", "10.1"] },
    { "id": 15, "tasks": ["12.1"] },
    { "id": 16, "tasks": ["11.1", "12.2"] },
    { "id": 17, "tasks": ["11.2", "11.3", "12.3"] },
    { "id": 18, "tasks": ["12.4", "12.5", "12.6"] },
    { "id": 19, "tasks": ["12.7"] }
  ]
}
```
