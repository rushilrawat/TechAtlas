# Requirements Document

TechAtlas Phase 1.5C: Scanner Expansion

## Status

Requirements draft **for review**. This document authorizes no implementation. It restates
the Phase 1.5C scope as testable EARS criteria, grounded in the audited TechAtlas scanner
codebase, and expands the existing "Repo X-Ray" repository scanner with new ecosystem
parsers, broader library/framework coverage, improved accuracy, monorepo handling, and an
evaluation harness.

## Introduction

Phase 1.5A built the scanner pipeline (`backend/app/scanner/`): resolve a public GitHub
repository to a commit SHA, inspect the file tree within bounds, parse manifests, match
detected dependencies against TechAtlas canonical nodes, infer concepts conservatively,
attach commit-pinned evidence, and return a `RepoScan`. Phase 1.5B added the React graph
overlay. Phase 1.5D added production safeguards (rate limiting, concurrency gate, scan
store, spoof-resistant IP keying) and Render deployment. Those phases are **done and out of
scope** here.

Phase 1.5C expands **detection breadth and accuracy** only. It adds parser modules for Rust,
Java/Kotlin, and Go; broadens JavaScript and Python library/framework coverage; sharpens
direct-vs-transitive classification; tightens concept inference; deduplicates detections and
surfaces unmapped dependencies honestly; extends coverage to large monorepos within existing
bounds; and introduces an evaluation harness measured against manually verified real
repositories with precision/recall-style thresholds.

Every capability inherits the scanner's standing invariants: never fabricate nodes, edges,
or percentages; reuse the one canonical TechAtlas graph read-only; never execute repository
code; keep `GITHUB_TOKEN` server-side; keep work bounded by the existing scan deadline and
safeguards; and attach file-and-locator evidence to every reported detection.

## Repository audit (what Phase 1.5C builds on — verified, not assumed)

- **Pipeline:** `scan_orchestrator.py` runs resolve → `tree_inspector.select_files` →
  `fetch_text` → per-file parse (`_parse_file`) → consolidate per node id → assemble
  `RepoScan`. `build_scan` is a pure, network-free assembly step already unit-testable with
  fixtures. Overall wall-clock `deadline`, `max_files`, `max_source_files`, and `max_bytes`
  budgets are enforced; exceeding any budget sets `coverage.partial = True` and never claims
  full coverage.
- **Parsers today:** `manifest_parsers/js.py` (package.json, package-lock.json, vite/next/
  tsconfig/angular configs, source imports), `manifest_parsers/python.py`
  (pyproject.toml, requirements*.txt, poetry.lock, uv.lock, source imports),
  `manifest_parsers/infra.py` (Dockerfile, compose, workflows). All emit `RawDetection`
  (`common.py`): either `(ecosystem, package)` or a direct `node_id`, plus
  `evidence_type`, `file_path`, `description`, `detection_status`, `rule`, `direct`, `line`.
- **Matching:** `technology_matcher.py` resolves `(ecosystem, package)` → canonical node id
  via dataset `package` ({ecosystem, name}), `repo` ("owner/name"), normalized name, and
  aliases (dataset aliases + `import_aliases.json`). Loose-substring matching is forbidden.
  Unresolved packages are recorded as unmapped, never invented.
- **Roles/classification:** `import_role.py` derives a functional role from `node_subtype`;
  `RawDetection.direct` carries direct-vs-transitive where the format allows.
- **Consolidation:** `build_scan` already keys one `Detection` per node id, merges many
  `Evidence` ids, ranks status via `_STATUS_RANK` (`related < inferred < declared <
  confirmed`), and tracks `component_paths` per node from the top-level path segment.
- **Models:** `models.py` — `RepoScan`, `Detection`, `Evidence`, `ScanCoverage`,
  `ScanSummary`, `UnmappedPackage`, `ScanRepository`. `SCANNER_VERSION` and
  `mapping_version` form part of the cache key. `EvidenceType` and `DetectionStatus` are
  closed `Literal` sets.

## Decisions carried in from prior phases (binding)

- Overlay, not a new graph: detections emphasize a subset of existing nodes; the base graph
  is never rebuilt, repositioned, or mutated (read-only overlay invariant).
- Deterministic static analysis only: no LLM for detection, no code execution, no dependency
  installation.
- Reuse the one canonical catalog and its `package`/`repo`/`aliases` data; never duplicate
  the graph or invent nodes/edges.
- One parser module per ecosystem; a shared matching/classification/consolidation pipeline.
- `GITHUB_TOKEN` stays server-side; scans stay within the existing deadline, concurrency
  gate, and rate-limit safeguards.
- Never fabricate detections, confidence percentages, progress percentages, edges, or nodes.

## Glossary

- **Scanner**: The backend Repo X-Ray pipeline in `backend/app/scanner/` that turns a
  GitHub repository URL into a `RepoScan`.
- **Parser_Module**: An ecosystem-specific module under `manifest_parsers/` that converts
  selected files into `RawDetection` records without executing repository code.
- **Rust_Parser / Java_Parser / Go_Parser**: The Phase 1.5C `Parser_Module`s for the Rust
  (Cargo), Java/Kotlin (Maven + Gradle), and Go (modules) ecosystems respectively.
- **Matcher**: `technology_matcher.py`, which resolves an `(ecosystem, package)` pair to a
  canonical node id or to unmapped.
- **Canonical_Node**: An existing TechAtlas graph node (technology or concept). The Scanner
  reuses these; it never creates new ones.
- **Detection**: One consolidated result per `Canonical_Node`, carrying a detection status
  and one or more `Evidence` ids.
- **Evidence**: A single traceable observation: node id, file path, evidence type, locator
  (line when available), description, status, and a commit-pinned source URL.
- **Locator**: The file path plus, when available, a line number identifying where an
  `Evidence` observation occurs.
- **Detection_Status**: One of `confirmed`, `declared`, `inferred`, `related` (the existing
  closed set), ranked by `_STATUS_RANK`.
- **Direct_Dependency**: A dependency the repository declares itself (e.g. a `[dependencies]`
  entry, a Maven `<dependency>`, a go.mod `require` without the indirect marker).
- **Transitive_Dependency**: A dependency pulled in only through another dependency, typically
  known from a lockfile or an indirect marker.
- **Unmapped_Package**: A detected dependency with no resolving `Canonical_Node`, surfaced as
  an `UnmappedPackage` with its evidence.
- **Concept_Node**: A `Canonical_Node` representing an engineering concept (id prefixed
  `concept:`), inferred only from specific evidence.
- **Monorepo**: A repository containing multiple manifests across multiple subdirectories,
  each treated as a workspace/component.
- **Workspace**: A subdirectory within a `Monorepo` that owns its own manifest(s).
- **Evaluation_Harness**: An offline, deterministic test suite that runs the Scanner against
  fixtures derived from manually verified real repositories and asserts precision/recall-style
  thresholds.
- **Verified_Corpus**: The set of manually verified real GitHub repositories (captured as
  offline fixtures with a human-authored expected-detection ground truth) used by the
  `Evaluation_Harness`.
- **Scan_Deadline**: The existing overall wall-clock budget enforced by `run_scan`
  (`deadline`), beyond which coverage is labeled partial.
- **Scan_Budgets**: The existing `max_files`, `max_source_files`, and `max_bytes` caps plus
  the concurrency gate and rate limiter.
- **Mapping_Version**: The dataset mapping version that, with `SCANNER_VERSION`, forms the
  scan cache key.

---

## Requirements

### Requirement 1: Rust ecosystem detection

**User Story:** As a developer scanning a Rust repository, I want crates, frameworks, and source-level imports detected with direct-vs-transitive classification, so the overlay reflects the real stack.

#### Acceptance Criteria

1.1. WHEN the Scanner selects a `Cargo.toml` file, THE Rust_Parser SHALL emit one `RawDetection` per declared dependency with ecosystem `cargo`, `detection_status` `declared`, and `direct` set to true.

1.2. WHEN the Scanner selects a `Cargo.lock` file, THE Rust_Parser SHALL emit one `RawDetection` per locked package with ecosystem `cargo`, `detection_status` `declared`, and `direct` set to false.

1.3. WHEN the Scanner selects a Rust source file (`.rs`) and the file contains a `use` or `extern crate` statement whose first path segment is an external crate name (not `crate`, `self`, `super`, or a Rust standard-library root such as `std`, `core`, or `alloc`), THE Rust_Parser SHALL emit a `RawDetection` with ecosystem `cargo`, `evidence_type` `source_import`, `detection_status` `confirmed`, and the Locator line of the statement.

1.4. WHERE a `Cargo.toml` declares a dependency under `[dev-dependencies]` or `[build-dependencies]`, THE Rust_Parser SHALL emit the dependency's `RawDetection` with `direct` set to true and its declaring section recorded so the shared pipeline can distinguish dev/build from runtime dependencies.

1.5. IF a `Cargo.toml` or `Cargo.lock` file cannot be parsed, THEN THE Rust_Parser SHALL return zero detections for that file and SHALL allow the remainder of the scan to continue.

1.6. WHERE a repository contains no Rust manifest, THE Rust_Parser SHALL contribute zero detections and SHALL NOT affect detections from other `Parser_Module`s.

1.7. THE Rust_Parser SHALL emit only crate names and versions that appear literally in the parsed source or manifest file and SHALL NOT fabricate a crate name, version, or `Canonical_Node`.

---

### Requirement 2: Java and Kotlin ecosystem detection

**User Story:** As a developer scanning a Java or Kotlin repository, I want Maven and Gradle dependencies and frameworks like Spring Boot detected from their coordinates, so the overlay reflects the real stack.

#### Acceptance Criteria

2.1. WHEN the Scanner selects a `pom.xml` file, THE Java_Parser SHALL emit one `RawDetection` per `<dependency>` element carrying the coordinate formatted as `groupId:artifactId`, ecosystem `maven`, and `detection_status` `declared`.

2.2. WHEN the Scanner selects a `build.gradle` or `build.gradle.kts` file, THE Java_Parser SHALL emit one `RawDetection` per declared dependency carrying the coordinate formatted as `group:name`, ecosystem `maven`, and `detection_status` `declared`.

2.3. WHERE a Gradle version catalog file `gradle/libs.versions.toml` is present and a build script references a catalog alias defined in that file, THE Java_Parser SHALL resolve the alias to its declared `group:name` coordinate before emitting the detection.

2.4. WHEN a Spring Boot coordinate is detected and a corresponding Spring Boot `Canonical_Node` exists, THE Matcher SHALL resolve the coordinate to that `Canonical_Node`.

2.5. IF a Spring Boot coordinate is detected and no corresponding Spring Boot `Canonical_Node` exists, THEN THE Matcher SHALL record the coordinate as an `Unmapped_Package`.

2.6. WHERE a Maven or Gradle declaration marks a dependency as test-scoped (Maven `<scope>test</scope>`, Gradle `testImplementation`), THE Java_Parser SHALL emit the `RawDetection` with its scope recorded as test.

2.7. IF a `pom.xml`, `build.gradle`, or `build.gradle.kts` file cannot be parsed, THEN THE Java_Parser SHALL emit zero detections for that file and SHALL allow the scan to continue processing remaining files.

2.8. WHERE a dependency coordinate uses a Maven property or Gradle variable that the selected files do not define, THE Java_Parser SHALL emit the `RawDetection` using the unresolved coordinate text and SHALL NOT emit a fabricated version or a `Canonical_Node`.

---

### Requirement 3: Go ecosystem detection

**User Story:** As a developer scanning a Go repository, I want modules, frameworks, and source imports detected with direct-vs-transitive classification, so the overlay reflects the real stack.

#### Acceptance Criteria

3.1. WHEN the Scanner selects a `go.mod` file, THE Go_Parser SHALL emit one `RawDetection` per external `require` module with ecosystem `go`, `detection_status` `declared`, and `direct` set to false WHERE the require line carries the `// indirect` marker and true otherwise.

3.2. WHERE a `require` entry in `go.mod` references the repository's own module path (declared by the `module` directive) or a Go standard-library path, THE Go_Parser SHALL NOT emit a detection for it.

3.3. WHEN the Scanner selects a `go.sum` file, THE Go_Parser SHALL emit each module entry with `detection_status` `declared` and `direct` set to false, so a `go.sum` entry alone never marks a module as a `Direct_Dependency`.

3.4. WHEN the Scanner selects a Go source file (`.go`) whose import block references an external module path, THE Go_Parser SHALL emit a `RawDetection` with ecosystem `go`, `evidence_type` `source_import`, `detection_status` `confirmed`, and the Locator line of the import statement.

3.5. WHERE a Go import path or require module path belongs to the repository's own module or to the Go standard library, THE Go_Parser SHALL NOT emit an external-module detection for it.

3.6. IF a `go.mod`, `go.sum`, or `.go` source file cannot be parsed, THEN THE Go_Parser SHALL return zero detections for that file, SHALL NOT fabricate a module path or `Canonical_Node`, and SHALL allow the scan to continue with remaining files.

---

### Requirement 4: Expanded JavaScript and Python ecosystem coverage

**User Story:** As a user, I want more of the libraries and frameworks I actually use to be recognized, without any fabricated mappings.

#### Acceptance Criteria

4.1. THE Matcher SHALL recognize an expanded set of real JavaScript/TypeScript (`npm`) and Python (`pypi`) libraries and frameworks by mapping each identifier to an existing `Canonical_Node`, recorded in the shared, centrally managed mapping data, and SHALL NOT invent a node for any such identifier.

4.2. WHERE a broadened mapping is added, THE Matcher SHALL map an identifier only when it exactly matches the target `Canonical_Node` by ecosystem-qualified `package`, `repo`, normalized official name, or approved alias, and SHALL NOT map by loose substring.

4.3. IF a broadened mapping would require a node that does not exist in the canonical graph, THEN THE Scanner SHALL record the dependency as an `Unmapped_Package` and SHALL NOT create a node.

4.4. WHEN a Python import name differs from its distribution name (e.g. `sklearn` -> `scikit-learn`), THE Matcher SHALL resolve the import name to the correct distribution via the shared `import_aliases.json` data before mapping to a `Canonical_Node`.

4.5. IF a Python import name is absent from the shared import-alias data and does not exactly match a distribution, THEN THE Scanner SHALL record it as an `Unmapped_Package` and SHALL NOT infer a distribution name.

4.6. WHEN the mapping data changes, THE Scanner SHALL update `Mapping_Version` so that scans cached under the prior `Mapping_Version` + `SCANNER_VERSION` key are not served as current.

---

### Requirement 5: Direct-vs-transitive classification across all ecosystems

**User Story:** As a user, I want to see which dependencies the repository actually declares versus those pulled in transitively, so the overlay distinguishes the authored stack.

#### Acceptance Criteria

5.1. WHERE a lockfile for a supported ecosystem (`Cargo.lock`, `go.mod` indirect markers, npm/yarn/pnpm lockfile, `poetry.lock`, or `uv.lock`) is present and parseable, THE Scanner SHALL assign each dependency a `Dependency_Classification` value from the closed set {`Direct_Dependency`, `Transitive_Dependency`, `Undetermined`}.

5.2. WHERE a manifest declares a dependency directly, THE Scanner SHALL set its `Dependency_Classification` to `Direct_Dependency` even when the same package also appears in a lockfile.

5.3. IF a dependency appears only in a lockfile and in no manifest declaration, THEN THE Scanner SHALL set its `Dependency_Classification` to `Transitive_Dependency`.

5.4. WHERE an ecosystem's selected files provide no basis to distinguish direct from transitive (no parseable manifest declaration and no parseable lockfile linkage), THE Scanner SHALL set the `Dependency_Classification` to `Undetermined` and SHALL NOT assign `Direct_Dependency`.

5.5. IF a lockfile for a supported ecosystem is present but cannot be parsed, THEN THE Scanner SHALL set the `Dependency_Classification` of each affected dependency to `Undetermined` and SHALL record an error indication identifying the unparseable lockfile.

5.6. THE Scanner SHALL expose the `Dependency_Classification` value on each `Detection` it produces as an attribute distinct from `Detection_Status`, and SHALL leave the closed `Detection_Status` set {`confirmed`, `declared`, `inferred`, `related`} unchanged.

---

### Requirement 6: More reliable concept inference

**User Story:** As a user, I want engineering concepts shown only when specific evidence supports them, with fewer spurious concept edges.

#### Acceptance Criteria

6.1. WHEN a `Concept_Node` is inferred, THE Scanner SHALL back the inference with at least one `Evidence` item that references a concrete source artifact (a file path, dependency manifest entry, or configuration key) and SHALL set `Detection_Status` to `inferred`.

6.2. IF the only evidence for a concept is that a declared dependency is capable of supporting it, without an artifact demonstrating that the concept is exercised, THEN THE Scanner SHALL NOT infer that concept.

6.3. IF the only evidence for a deployment platform or outcome is the presence of a configuration file or key, without an artifact confirming the platform or outcome, THEN THE Scanner SHALL NOT infer that platform or outcome.

6.4. WHEN the Scanner infers a `Concept_Node`, THE Scanner SHALL select only a `Concept_Node` whose id (prefixed `concept:`) already exists in the canonical graph.

6.5. THE Scanner SHALL NOT create a `Concept_Node` that does not already exist in the canonical graph, and SHALL NOT create an inferred edge between two technologies based solely on their co-occurrence in the same repository.

6.6. IF the only evidence for a concept is a mention in a README file or a name that contains a known concept term as a substring, THEN THE Scanner SHALL NOT infer that concept.

---

### Requirement 7: Deduplication and false-positive reduction

**User Story:** As a user, I want each detected technology to appear once with all its evidence merged, not duplicated across signals.

#### Acceptance Criteria

7.1. WHEN the same `Canonical_Node` is matched through two or more signals (e.g. a manifest declaration and a source import), THE Scanner SHALL consolidate the result into exactly one `Detection` for that node whose `Evidence` set is the union of the contributing evidence, with each distinct `Evidence` id appearing exactly once.

7.2. WHEN a consolidated `Detection` has evidence of differing `Detection_Status`, THE Scanner SHALL report the highest-ranked status per `_STATUS_RANK` (`related` < `inferred` < `declared` < `confirmed`).

7.3. THE Scanner SHALL NOT emit a `Detection` that has fewer than one `Evidence` item.

7.4. IF a candidate match derives only from a package name that contains a known term as a loose substring (e.g. a package name containing "react" that is not the React package), THEN THE Scanner SHALL NOT assign that `Detection` a `confirmed` status for that technology.

7.5. WHERE the same dependency is observed in two or more `Workspace`s of a `Monorepo`, THE Scanner SHALL report a single `Detection` for the corresponding `Canonical_Node` whose `component_paths` records each contributing `Workspace` path exactly once.

---

### Requirement 8: Honest handling of unmapped dependencies

**User Story:** As a user, I want dependencies without a canonical node surfaced honestly, never dropped or faked.

#### Acceptance Criteria

8.1. WHERE a detected dependency resolves to no `Canonical_Node`, THE Scanner SHALL record it as an `Unmapped_Package` carrying its name, ecosystem, detection status, and at least one evidence id.

8.2. IF a detected dependency fails to map to a `Canonical_Node`, THEN THE Scanner SHALL retain it as an `Unmapped_Package` and SHALL NOT discard it from the scan output.

8.3. IF a dependency is unmapped, THEN THE Scanner SHALL NOT create, auto-insert, or fabricate a `Canonical_Node`, edge, or confidence percentage for that dependency.

8.4. WHEN the Scanner produces a scan summary, THE Scanner SHALL include a non-negative integer count of `Unmapped_Package`s equal to the total number of `Unmapped_Package`s recorded during the scan.

8.5. WHERE an `Unmapped_Package` is recorded with no resolvable ecosystem, THE Scanner SHALL record its ecosystem as "unknown" and SHALL retain the `Unmapped_Package` with its name, detection status, and at least one evidence id.

---

### Requirement 9: Monorepo coverage within existing bounds

**User Story:** As a user scanning a large monorepo, I want manifests across subdirectories aggregated per workspace, without the scan exceeding its time or request budgets.

#### Acceptance Criteria

9.1. WHEN a repository contains manifests in two or more subdirectories, THE Scanner SHALL identify each subdirectory containing at least one manifest as a distinct `Workspace` and inspect the manifests in every identified `Workspace` rather than only the repository root.

9.2. WHEN a `Detection` originates from a `Workspace`, THE Scanner SHALL record on that `Detection` the `component_paths` of every manifest in that `Workspace` that contributed to the `Detection`.

9.3. WHILE scanning a `Monorepo`, THE Scanner SHALL inspect no more than `max_files` total files, no more than `max_source_files` source files, and no more than `max_bytes` total bytes as defined by `Scan_Budgets`, and SHALL complete inspection on or before `Scan_Deadline`.

9.4. IF `Scan_Deadline` is reached or any `Scan_Budget` limit (`max_files`, `max_source_files`, or `max_bytes`) is reached before every identified `Workspace` has been inspected, THEN THE Scanner SHALL stop inspecting further `Workspace`s, set `coverage.partial` to true, and record a coverage note identifying which `Workspace`s were not inspected.

9.5. THE Scanner SHALL inspect each manifest in each identified `Workspace` at most once so that the count of inspected files and issued requests does not exceed the `Scan_Budgets` limits regardless of repository size.

---

### Requirement 10: Evaluation harness with precision/recall thresholds

**User Story:** As a maintainer, I want accuracy claims backed by evaluation against manually verified repositories, so detection quality is measurable and regressions are caught.

#### Acceptance Criteria

10.1. WHEN executing an evaluation run, THE Evaluation_Harness SHALL run the Scanner against every repository fixture in the `Verified_Corpus` using only local offline fixtures.

10.2. IF any Scanner operation during an evaluation run attempts a live GitHub network call, THEN THE Evaluation_Harness SHALL abort the run and report an error indicating that live network access was attempted.

10.3. WHEN evaluating a repository fixture, THE Evaluation_Harness SHALL compare the Scanner's reported detections against the human-authored ground truth for that fixture and compute precision and recall as values in the range 0.0 to 1.0.

10.4. WHEN an evaluation run completes, THE Evaluation_Harness SHALL compute aggregate precision and recall across all repository fixtures in the `Verified_Corpus`.

10.5. IF aggregate precision or aggregate recall is below the configured `Accuracy_Threshold` parameter, THEN THE Evaluation_Harness SHALL fail the run and report which metric fell below the `Accuracy_Threshold` and the computed value.

10.6. WHEN an evaluation run completes, THE Evaluation_Harness SHALL report, for each repository fixture, the count and identity of false positives and false negatives relative to that fixture's ground truth.

10.7. THE Verified_Corpus SHALL include at least one repository fixture for each supported ecosystem (JavaScript/TypeScript, Python, Rust, Java/Kotlin, and Go) and at least one `Monorepo` fixture.

10.8. WHEN reporting accuracy, THE Evaluation_Harness SHALL derive all reported accuracy values from the computed precision and recall against the `Verified_Corpus` ground truth and SHALL NOT report any accuracy percentage that is not computed from an evaluation run.

---

## Non-functional requirements

- NFR-1. **No fabrication.** THE Scanner SHALL NOT fabricate `Canonical_Node`s, edges,
  confidence percentages, or progress percentages in any ecosystem.
- NFR-2. **Read-only overlay.** THE Scanner SHALL NOT mutate, rebuild, reposition, or
  relayout the canonical TechAtlas graph.
- NFR-3. **Reuse one catalog.** THE Scanner SHALL reuse the single canonical node catalog and
  its `package`/`repo`/`aliases` data and SHALL NOT duplicate the graph.
- NFR-4. **Static analysis only.** THE Scanner SHALL NOT execute repository code, install
  dependencies, or resolve dependencies over the network.
- NFR-5. **Modularity.** THE Scanner SHALL implement one `Parser_Module` per ecosystem behind
  the shared matching/classification/consolidation pipeline; a `Parser_Module` SHALL fail
  gracefully (zero detections, scan continues) when its files are absent or unparsable.
- NFR-6. **Bounded work.** THE Scanner SHALL complete within the existing `Scan_Deadline` and
  `Scan_Budgets`, including for monorepos, and SHALL honor the existing concurrency gate and
  rate limiter.
- NFR-7. **Token secrecy.** THE Scanner SHALL keep `GITHUB_TOKEN` server-side only.
- NFR-8. **Evidence required.** THE Scanner SHALL attach a file-and-Locator `Evidence` item to
  every reported `Detection`; WHERE no evidence exists, the technology SHALL NOT be reported.
- NFR-9. **Offline tests.** THE test suite, including the `Evaluation_Harness`, SHALL run
  against mocked/fixtured GitHub responses with no live network in CI.
- NFR-10. **Additive and backward compatible.** THE Phase 1.5C changes SHALL be additive to
  the existing models and API and SHALL keep Phase 0–1.5B/1.5D behavior passing unchanged.

---

## Open questions (need reviewer decision before design is final)

1. **Precision/recall thresholds (R10.3):** what exact aggregate thresholds gate the
   `Evaluation_Harness` (e.g. precision ≥ 0.9, recall ≥ 0.8), and are they per-ecosystem or
   global?
2. **Ecosystem labels:** confirm the ecosystem string for each new parser (`cargo`, `maven`
   for both Maven and Gradle, `go`) so the dataset `package` fields and `import_aliases.json`
   align with the Matcher.
3. **Direct-vs-transitive surfacing — RESOLVED (R5.6):** the `Dependency_Classification`
   ({`Direct_Dependency`, `Transitive_Dependency`, `Undetermined`}) lives on `Detection` as a
   new optional attribute distinct from the closed `Detection_Status` set. Confirm during
   design review if a different placement is preferred.
4. **Gradle parsing depth (R2.2/R2.3):** how far should Gradle script parsing go without code
   execution (static DSL scan vs version-catalog-only), and is Kotlin DSL (`.kts`) in MVP
   scope at the same depth as Groovy?
5. **Verified_Corpus size and licensing:** how many repositories per ecosystem, and may their
   manifest/source fixtures be vendored into the test tree under their licenses?
6. **Monorepo workspace discovery (R9):** rely on manifest presence per directory, or also
   honor workspace declarations (npm/yarn/pnpm workspaces, Cargo workspaces, Gradle
   multi-project settings)?
