# Implementation Plan: TechAtlas Phase 1.5C — Scanner Expansion

## Overview

This plan realizes the approved `design.md` against the audited scanner in
`backend/app/scanner/`. It is strictly additive and incremental: every step builds on the
previous one and ends wired into the existing pipeline, with no orphaned code. The sequence
protects Phase 0–1.5B/1.5D behavior — additive model fields first, then selection globs, then
one ecosystem parser at a time (Rust → Java/Kotlin → Go), then `build_scan` classification +
dedupe + concept tightening, then dataset/alias expansion with a `mapping_version` bump, then
monorepo workspace handling, then the offline evaluation harness + corpus, and finally a
full-suite + ruff verification gate.

Implementation language: **Python** (matching the existing codebase), with
**`hypothesis`** for property-based tests. All tests are offline against mocked/fixtured
GitHub responses — no live network (NFR-9).

### Standing constraints (apply to EVERY task — acceptance notes)

- **No fabrication** of nodes, edges, versions, confidence or progress percentages (NFR-1).
- **Read-only overlay** — never mutate/rebuild/reposition the canonical graph (NFR-2).
- **Reuse the one canonical catalog** and its `package`/`repo`/`aliases` data (NFR-3).
- **Static analysis only** — no code execution, no dependency install, no network resolution (NFR-4).
- **Bounded work** within existing `Scan_Deadline`/`Scan_Budgets`, concurrency gate, rate limiter (NFR-6).
- **`GITHUB_TOKEN` server-side only** (NFR-7).
- **Evidence required** — no zero-evidence detections (NFR-8).
- **Offline tests** — mocked/fixtured GitHub everywhere, including the harness (NFR-9).
- **Additive / backward compatible** — one optional model field; prior behavior unchanged (NFR-10).

## Tasks

- [ ] 1. Additive data-model changes (foundation, backward compatible)
  - [ ] 1.1 Add optional `dependency_classification` to `Detection` and the closed literal
    - In `backend/app/scanner/models.py`, add `DependencyClassification = Literal["direct", "transitive", "undetermined"]`
    - Add `dependency_classification: DependencyClassification | None = None` to `Detection` (optional, default `None`) so pre-1.5C cached scans still deserialize
    - Bump `SCANNER_VERSION` to a 1.5C code value (e.g. `"1.5c.1"`); leave `DetectionStatus`/`EvidenceType` closed sets unchanged
    - _Acceptance notes: additive/backward compatible (NFR-10); `Detection_Status` set unchanged_
    - _Requirements: 5.6, 4.6, NFR-10_

  - [ ] 1.2 Add optional `section`/`scope` metadata to `RawDetection`
    - In `backend/app/scanner/manifest_parsers/common.py`, add `section: str | None = None` and `scope: str | None = None` to the frozen `RawDetection` dataclass (both optional, defaulted)
    - Keep all existing fields and defaults intact so current parsers compile unchanged
    - _Acceptance notes: additive only; no behavior change for existing parsers (NFR-10)_
    - _Requirements: 1.4, 2.6, NFR-10_

  - [ ]* 1.3 Write unit tests for the additive model changes
    - Assert a `Detection` round-trips with and without `dependency_classification`
    - Assert a legacy JSON scan (no `dependency_classification` key) still deserializes
    - Assert `RawDetection(section=..., scope=...)` constructs and defaults to `None`
    - _Requirements: 5.6, NFR-10_

- [ ] 2. Extend file selection globs within existing budgets
  - [ ] 2.1 Add Rust/Java/Go manifest + source globs to `tree_inspector`
    - In `backend/app/scanner/tree_inspector.py`, extend `MANIFEST_BASENAMES` with `Cargo.toml`, `Cargo.lock`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `libs.versions.toml`, `go.mod`, `go.sum`
    - Extend `SOURCE_EXT` with `.rs`, `.go`
    - Select `libs.versions.toml` only under a `gradle/` path; keep `target/`/`vendor/` exclusions (already present)
    - Preserve `max_files` / `max_source_files` / `max_bytes` caps and existing shallow-path source ordering so `.rs`/`.go` share (never grow) the source budget; keep `skipped_limit` + partial labeling
    - _Acceptance notes: bounded work, each file once; source budget shared not grown (NFR-6)_
    - _Requirements: 9.3, 9.5, NFR-6_

  - [ ]* 2.2 Write unit tests for selection
    - New manifests/sources are selected; `target/`/`vendor/`/`node_modules/` paths excluded
    - `libs.versions.toml` selected only under `gradle/`
    - Oversized / over-cap trees set `skipped_limit` and remain bounded
    - _Requirements: 9.3, 9.5, NFR-6_

  - [ ]* 2.3 Write property test for bounded work and each-file-once
    - **Property 17: Bounded work and each-file-once**
    - **Validates: Requirements 9.3, 9.5, NFR-6**

- [ ] 3. Rust ecosystem parser (`cargo`)
  - [ ] 3.1 Implement `rust.py` manifest + lockfile parsing
    - Create `backend/app/scanner/manifest_parsers/rust.py`
    - `parse_cargo_toml`: `tomllib`-parse `[dependencies]`/`[dev-dependencies]`/`[build-dependencies]` → `RawDetection(ecosystem="cargo", detection_status="declared", direct=True, section=...)` with `rule="rust.cargo_toml"`
    - `parse_cargo_lock`: `[[package]]` tables → `RawDetection(ecosystem="cargo", detection_status="declared", direct=False, rule="rust.cargo_lock")`
    - On unparseable input return `[]`; emit only crate names that appear literally in the file
    - _Acceptance notes: static-only; no fabrication; graceful absence (NFR-1, NFR-4, NFR-5)_
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_

  - [ ] 3.2 Implement `rust.py` source-import parsing
    - `parse_source_imports`: regex `use`/`extern crate`; first path segment, excluding `crate`/`self`/`super`/`std`/`core`/`alloc` → `RawDetection(ecosystem="cargo", evidence_type="source_import", detection_status="confirmed", line=<Locator>)`
    - _Acceptance notes: evidence-required with Locator line; internal roots excluded (NFR-8)_
    - _Requirements: 1.3, 1.7_

  - [ ] 3.3 Dispatch Rust files in `_parse_file`
    - In `scan_orchestrator.py` `_parse_file`, route `Cargo.toml`/`Cargo.lock` and `.rs` to the new `rust` module so parsing reaches the pipeline
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 3.4 Write unit tests for the Rust parser
    - Representative `Cargo.toml`/`Cargo.lock`/`.rs` → expected detections; dev/build sections recorded; malformed input → `[]`; absent manifest → no contribution
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 3.5 Write property tests for the Rust parser
    - **Property 2: Parser literal-token invariant** — **Validates: Requirements 1.7, 2.8, 3.6**
    - **Property 3: Graceful absence and unparseable input** — **Validates: Requirements 1.5, 1.6, 2.7, 3.6, NFR-5**
    - **Property 4: Dependency flag reflects the source marker** (Cargo subset) — **Validates: Requirements 1.1, 1.2, 3.1, 3.3**
    - **Property 5: Confirmed source imports exclude internal/stdlib roots and carry a Locator** (`.rs` subset) — **Validates: Requirements 1.3, 3.2, 3.4, 3.5**

- [ ] 4. Checkpoint — Rust path integrated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Java / Kotlin ecosystem parser (`maven`)
  - [ ] 5.1 Implement `java.py` Maven `pom.xml` parsing
    - Create `backend/app/scanner/manifest_parsers/java.py`
    - `parse_pom_xml`: parse `<dependency>` → coordinate `groupId:artifactId`, `ecosystem="maven"`, `detection_status="declared"`; `<scope>test</scope>` → `scope="test"`
    - Unresolved `${property}` → emit the literal unresolved coordinate text, never a fabricated version/node
    - Unparseable XML → `[]`
    - _Acceptance notes: static-only; no fabrication on unresolved properties (NFR-1, NFR-4)_
    - _Requirements: 2.1, 2.6, 2.7, 2.8_

  - [ ] 5.2 Implement `java.py` Gradle DSL + version-catalog parsing
    - `parse_gradle`: static DSL scan of `build.gradle`/`build.gradle.kts` dependency lines → coordinate `group:name`, `ecosystem="maven"`, `declared`; configuration name → scope (`testImplementation` → `scope="test"`)
    - `resolve_version_catalog`: parse `gradle/libs.versions.toml` `[libraries]` → `{alias: "group:name"}`; resolve `libs.x.y` catalog refs before emitting
    - No Groovy/Kotlin execution; unresolved variable → literal text; unparseable → `[]`
    - _Acceptance notes: static DSL scan only, no script execution (NFR-4); no fabrication (NFR-1)_
    - _Requirements: 2.2, 2.3, 2.6, 2.7, 2.8_

  - [ ] 5.3 Dispatch Java/Gradle files in `_parse_file`
    - Route `pom.xml`, `build.gradle`, `build.gradle.kts` (and feed `gradle/libs.versions.toml` into Gradle resolution) to the `java` module
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 5.4 Write unit tests for the Java parser
    - `pom.xml`/`build.gradle`/`.kts` fixtures → expected coordinates; test scope recorded; catalog alias resolved; unresolved property emits literal text (R2.8); malformed input → `[]`
    - Spring Boot coordinate maps to node when it exists; otherwise recorded unmapped
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 5.5 Write property tests for the Java parser
    - **Property 2: Parser literal-token invariant** (Maven/Gradle coordinates incl. unresolved `${...}`) — **Validates: Requirements 1.7, 2.8, 3.6**
    - **Property 3: Graceful absence and unparseable input** (pom/gradle) — **Validates: Requirements 1.5, 1.6, 2.7, 3.6, NFR-5**

- [ ] 6. Go ecosystem parser (`go`)
  - [ ] 6.1 Implement `go.py` `go.mod` / `go.sum` parsing
    - Create `backend/app/scanner/manifest_parsers/go.py`
    - `parse_go_mod`: capture `module` directive as own-module; `require` (block + single-line) → `ecosystem="go"`, `declared`; `direct=False` iff `// indirect` else `True`; skip own-module prefix and stdlib paths (first segment has no dot)
    - `parse_go_sum`: each module line → `declared`, `direct=False` always
    - Unparseable → `[]`
    - _Acceptance notes: literal-only, no fabrication; `go.sum` alone never implies direct (NFR-1)_
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [ ] 6.2 Implement `go.py` source-import parsing
    - `parse_source_imports`: quoted import paths (incl. `import (...)` block); external module path → `evidence_type="source_import"`, `detection_status="confirmed"`, `line=<Locator>`; exclude own-module and stdlib (no-dot first segment)
    - _Acceptance notes: evidence-required with Locator; internal/stdlib excluded (NFR-8)_
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ] 6.3 Dispatch Go files in `_parse_file`
    - Route `go.mod`/`go.sum` and `.go` to the `go` module
    - _Requirements: 3.1, 3.3, 3.4_

  - [ ]* 6.4 Write unit tests for the Go parser
    - `go.mod` direct vs `// indirect`; own-module/stdlib skipped; `go.sum` all `direct=False`; `.go` imports confirmed with line; malformed input → `[]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 6.5 Write property tests for the Go parser
    - **Property 2: Parser literal-token invariant** (Go) — **Validates: Requirements 1.7, 2.8, 3.6**
    - **Property 3: Graceful absence and unparseable input** (Go) — **Validates: Requirements 1.5, 1.6, 2.7, 3.6, NFR-5**
    - **Property 4: Dependency flag reflects the source marker** (Go `require`/`// indirect`/`go.sum`) — **Validates: Requirements 1.1, 1.2, 3.1, 3.3**
    - **Property 5: Confirmed source imports exclude internal/stdlib roots and carry a Locator** (`.go`) — **Validates: Requirements 1.3, 3.2, 3.4, 3.5**

- [ ] 7. Checkpoint — all three new parsers integrated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. `build_scan` classification, dedupe, and concept tightening
  - [ ] 8.1 Compute `Dependency_Classification` per node in `build_scan`
    - In `scan_orchestrator.py`, derive each `Detection.dependency_classification` from contributing `RawDetection`s: any manifest `direct=True` → `direct` (wins even if also in a lockfile); lockfile/indirect-only → `transitive`; no parseable manifest decl and no parseable lockfile linkage → `undetermined` (never `direct`)
    - Keep `detection_status` driven solely by `_STATUS_RANK`, independent of classification
    - _Acceptance notes: classification is a separate attribute; `Detection_Status` set unchanged_
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [ ] 8.2 Record unparseable-lockfile classification + coverage note
    - When a supported-ecosystem lockfile is present but unparseable, mark affected nodes `undetermined` and append a coverage note naming the unparseable lockfile; scan still completes
    - _Requirements: 5.5_

  - [ ] 8.3 Harden consolidation dedupe and zero-evidence invariant
    - Add a de-dupe guard dropping a repeated `(node_id, rule, file_path, line)` observation so an evidence id is counted once; keep one `Detection` per node id with unioned evidence and max-rank status
    - Assert every emitted `Detection` has ≥1 evidence id
    - _Acceptance notes: evidence-required (NFR-8)_
    - _Requirements: 7.1, 7.2, 7.3, NFR-8_

  - [ ] 8.4 Enforce loose-substring / confirmed-status guard
    - Ensure `confirmed` status is only assigned from `source_import`/`source_usage` evidence resolved via an exact matcher path, so a name merely containing a known term cannot be `confirmed`
    - _Requirements: 7.4, 4.2_

  - [ ] 8.5 Tighten concept inference gates
    - Require every inferred `concept:` detection to carry ≥1 artifact-backed evidence item; discard concepts whose id is absent from the matcher; never infer from capability-only, config-presence-only, README/substring, or technology co-occurrence
    - _Acceptance notes: existing-node-only, artifact-backed; no fabricated concepts/edges (NFR-1, NFR-2)_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 8.6 Tighten unmapped recording with ecosystem fallback
    - Keep every `(ecosystem, package)` with no node as an `UnmappedPackage` (name, ecosystem, status, ≥1 evidence id), never dropped/fabricated; record `ecosystem="unknown"` when none resolves; keep `summary.unmapped_package_count` equal to the recorded count
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 8.7 Write unit tests for classification and false-positive rules
    - Direct-wins-over-lockfile; lockfile-only → transitive; neither → undetermined; unparseable lockfile → undetermined + note (R5.5); substring decoy never confirmed; unmapped with `ecosystem="unknown"`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.4, 8.5_

  - [ ]* 8.8 Write property tests for consolidation, classification, and concepts
    - **Property 9: Dependency_Classification determinism and precedence** — **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**
    - **Property 10: Detection status stays in the closed set and is independent of classification** — **Validates: Requirements 5.6**
    - **Property 11: Concept inference is artifact-backed and existing-node-only** — **Validates: Requirements 6.1, 6.4**
    - **Property 12: Consolidation — one Detection per node, unioned unique evidence, max-rank status** — **Validates: Requirements 7.1, 7.2**
    - **Property 13: No zero-evidence detections** — **Validates: Requirements 7.3, NFR-8**
    - **Property 15: Unmapped completeness and retention** — **Validates: Requirements 8.1, 8.2, 8.5**
    - **Property 16: Unmapped summary count invariant** — **Validates: Requirements 8.4**
    - **Property 18: Consolidation idempotence** — **Validates: Requirements 7.1, 7.2, 7.5**

- [ ] 9. Checkpoint — classification and consolidation integrated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Dataset / import-alias expansion and `mapping_version` bump
  - [ ] 10.1 Register new ecosystem labels and bump `mapping_version`
    - Ensure dataset `package.ecosystem` keys and `import_aliases.json` use exactly `cargo`, `maven`, `go`; bump the dataset `mapping_version` so scans cached under the prior `(SCANNER_VERSION, mapping_version)` key are not served as current
    - _Acceptance notes: reuse one catalog read-only; cache-key invalidation (NFR-2, NFR-3)_
    - _Requirements: 4.6, NFR-2, NFR-3_

  - [ ]* 10.2 Expand npm/pypi coverage and Python import aliases (optional — broadens coverage)
    - Add `package`/`repo`/`aliases` entries to existing canonical nodes only; never add a node — a mapping needing a missing node stays an `UnmappedPackage`
    - Extend `import_aliases.json` with Python import→distribution aliases (e.g. `sklearn` → `scikit-learn`); bump `mapping_version` again if data changes
    - _Acceptance notes: data-only, no node creation; exact-match-only (NFR-1, NFR-3)_
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ]* 10.3 Write unit tests for matcher data and alias resolution
    - New ecosystem identifiers resolve to expected nodes; missing-node identifiers go unmapped; `sklearn` resolves via alias; unknown import stays unmapped
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ]* 10.4 Write property tests for matching, aliases, and cache keys
    - **Property 6: Exact-match-only resolution (no loose substring)** — **Validates: Requirements 4.2, 7.4**
    - **Property 7: Import-alias resolution** — **Validates: Requirements 4.4, 4.5**
    - **Property 8: Mapping/scanner version keys invalidate cache** — **Validates: Requirements 4.6**
    - **Property 1: No fabrication (scan-level)** — **Validates: Requirements 4.1, 4.3, 6.4, 6.5, 8.3, NFR-1, NFR-3**
    - **Property 19: Read-only overlay invariant** — **Validates: Requirements NFR-2, NFR-3**

- [ ] 11. Monorepo workspace handling
  - [ ] 11.1 Implement workspace-path aggregation in `build_scan`
    - Replace the top-level-segment `component_of` heuristic with a workspace path = directory of a contributing manifest (root manifest → `""`/root); a node seen in multiple workspaces yields one `Detection` whose `component_paths` lists each workspace path once (sorted, de-duped)
    - _Requirements: 7.5, 9.1, 9.2_

  - [ ] 11.2 Add budget/deadline partial-coverage workspace note
    - When `Scan_Deadline` or a `Scan_Budget` cap is reached before all identified workspaces are inspected, set `coverage.partial = True` and append a note identifying the uninspected workspaces; ensure each manifest is parsed at most once
    - _Acceptance notes: bounded work within existing safeguards; partial labeled not hidden (NFR-6)_
    - _Requirements: 9.3, 9.4, 9.5, NFR-6_

  - [ ]* 11.3 Write unit tests for monorepo aggregation and partial coverage
    - Same dependency across two workspaces → one detection, both paths; forced small budget → `coverage.partial` + uninspected-workspace note
    - _Requirements: 7.5, 9.1, 9.2, 9.4_

  - [ ]* 11.4 Write property test for monorepo workspace union
    - **Property 14: Monorepo workspace union and single detection** — **Validates: Requirements 7.5, 9.1, 9.2**

- [ ] 12. Checkpoint — monorepo handling integrated
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Offline evaluation harness
  - [ ] 13.1 Implement the harness and metrics
    - Create `backend/app/scanner/evaluation/harness.py` with `RepoEval`/`EvalRun` dataclasses and `run_evaluation(accuracy_threshold, *, scope="global")`
    - Run the Scanner over each corpus fixture via a MOCK GitHub client serving only the fixture; any live network attempt aborts with an explicit error
    - Compute precision = |TP|/|reported|, recall = |TP|/|ground truth| (0.0–1.0, empty-denominator cases defined), per-fixture FP/FN as set differences, aggregate across corpus, gate on threshold and name failing metric + value
    - _Acceptance notes: offline-only, no live network; no hardcoded accuracy values (NFR-9)_
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8_

  - [ ] 13.2 Author the required minimal `Verified_Corpus` fixtures
    - Under `backend/app/scanner/evaluation/corpus/<fixture>/`: `tree.json`, `files/<path>` verbatim manifest/source fixtures, human-authored `ground-truth.json`
    - Required: ≥1 fixture per ecosystem (JS/TS, Python, Rust, Java/Kotlin, Go) + ≥1 monorepo fixture; record origin + license in `SOURCE.txt`
    - _Acceptance notes: offline fixtures; evidence-backed ground truth (NFR-9)_
    - _Requirements: 10.7_

  - [ ]* 13.3 Author expanded corpus fixtures (optional — broadens coverage)
    - Add a second framework-heavy fixture per ecosystem (one simple + one framework-heavy), per the design's recommended corpus size
    - _Requirements: 10.7_

  - [ ]* 13.4 Write unit tests for the harness
    - Precision/recall/FP/FN computed correctly on a tiny fixture; threshold gate fails and names the metric; a simulated live-network call aborts the run (R10.2)
    - _Requirements: 10.2, 10.3, 10.5, 10.6_

  - [ ]* 13.5 Write property tests for harness metrics and gate
    - **Property 20: Evaluation metric correctness** — **Validates: Requirements 10.3, 10.4, 10.6**
    - **Property 21: Evaluation threshold gate** — **Validates: Requirements 10.5**

- [ ] 14. Final verification gate
  - [ ] 14.1 Run the full offline test suite and ruff
    - Run the complete backend test suite (unit + all `hypothesis` property tests, minimum 100 iterations each) offline; confirm Phase 0–1.5B/1.5D tests remain green (NFR-10)
    - Run `ruff` lint over `backend/app/scanner/` and fix any findings
    - Confirm no live network is used anywhere in CI (NFR-9) and the evaluation harness passes at the configured threshold
    - _Acceptance notes: offline tests; backward compatibility; no fabrication across all paths_
    - _Requirements: NFR-1, NFR-9, NFR-10_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. The required
  (non-`*`) path delivers core multi-language detection (Rust/Java/Go parsers, classification,
  dedupe/concept tightening, monorepo handling, the harness, and the minimal corpus). Optional
  tasks broaden coverage: expanded npm/pypi dataset + import aliases (10.2) and the
  framework-heavy corpus fixtures (13.3), plus unit/property test sub-tasks.
- Each task references the specific requirements it satisfies; property tasks name the design
  correctness property (1–21) and the requirements it validates.
- Checkpoints ensure incremental validation after each ecosystem/phase boundary.
- Property tests use `hypothesis` (≥100 iterations each) and carry the tag
  `# Feature: techatlas-phase-1.5c-scanner-expansion, Property {n}: {property text}`.
- All work is additive and offline; the standing constraints in the Overview apply to every task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "6.2"] },
    { "id": 4, "tasks": ["3.3", "5.2", "6.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "5.3", "6.4"] },
    { "id": 6, "tasks": ["5.4", "5.5", "6.5"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "8.4", "8.5", "8.6"] },
    { "id": 9, "tasks": ["8.7", "8.8", "10.1"] },
    { "id": 10, "tasks": ["10.2", "11.1", "11.2"] },
    { "id": 11, "tasks": ["10.3", "10.4", "11.3", "11.4"] },
    { "id": 12, "tasks": ["13.1", "13.2"] },
    { "id": 13, "tasks": ["13.3", "13.4", "13.5"] },
    { "id": 14, "tasks": ["14.1"] }
  ]
}
```
