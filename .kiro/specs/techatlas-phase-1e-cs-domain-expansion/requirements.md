# Requirements Document

## Introduction

Phase 1E — **Computer Science Domain Expansion** — broadens the TechAtlas knowledge graph
to cover core computer-science fields that are currently under-represented: Computer
Architecture, Computer Networks, Embedded & Real-Time Systems, High-Performance Computing,
Performance Analysis, Algorithms & Complexity, Cryptography, Logic & Verification,
Human-Computer Interaction, Robotics, Computer Graphics, Visualization, Computer Vision,
Natural Language Processing, and Web & Information Retrieval.

This is a **new feature, independent of the Repo X-Ray scanner work.** It is a **planning
and requirements document only** — it authorizes no implementation code and no edits to any
dataset file. Its goal is to describe *what* must be true of the expanded graph, not *how*
to build it.

Phase 1E is grounded in the repository as it exists today (audited, not invented):

- The canonical graph is authored in `data/seed/{domains,concepts,technologies,edges}.json`,
  compiled into `data/graph.json` by `scripts/build_dataset.py`, validated by
  `scripts/validate_dataset.py` (with the `--require-targets` gate), and laid out
  deterministically into `data/layout.json` by `scripts/generate_layout.py`. Batch-expansion
  tooling exists from Phase 1B under `scripts/expand/` (merging only curated literals through
  `scripts/expand/_apply.py`, which refuses duplicate ids/edges and pre-checks endpoint rules).
- The schema (`data/schema/graph-schema.json`) defines a **closed** `node_type` enum
  (`domain`, `concept`, `technology`), a **closed** `node_subtype` enum for technologies, and
  a **closed** `relationship_type` enum for edges. Node ids match
  `^(domain|concept|technology):[a-z0-9-]+$`. Edges carry `weight`, `confidence`,
  `description`, `source_reference`, and `is_curated`.
- Current audited counts: **417 nodes = 11 domains + 155 concepts + 251 technologies.** The
  11 domains are `software-engineering`, `frontend`, `backend`, `databases`, `ai-ml`,
  `cloud-devops`, `security`, `mobile`, `systems`, `testing-tooling`, `gamedev`.
- The `node_subtype` enum currently has **no instruction-set-architecture value**. Phase 1E
  must explicitly decide whether to add one (a schema change) or map ISAs to an existing
  subtype (see Requirement 1).
- The layout pipeline is deterministic and keyed to the dataset version, with cross-version
  pinning so unchanged nodes keep their coordinates
  (`scripts/generate_layout.py`, `scripts/sizing.py`).
- The Repo X-Ray scanner (separate, in-flight work) resolves technologies by the schema's
  `package`, `repo`, and `aliases` fields. Phase 1E must keep those fields correct on new
  technology nodes so the scanner continues to match.

Phase 1E must preserve all existing Phase 1 / 1.5 behavior: popularity scoring (Phase 1D),
search, Wikipedia integration (exact `wikipedia_title`), and the Repo X-Ray scanner's
ability to match packages/repos/aliases.

## Glossary

- **Field**: A top-level area of computer science presented to the user as a distinct area
  of study. In the current schema a Field is realized as a node of `node_type` `domain`
  (e.g. "Computer Architecture"). A Field is NOT a Technology.
- **Concept**: An idea, principle, protocol, standard, algorithm, or technique with no single
  concrete product identity, realized as a node of `node_type` `concept` (e.g. "Cache
  Coherence", "P vs NP", "TCP/IP").
- **Technology**: A concrete, nameable artifact — a language, framework, library, database,
  tool, platform, runtime, protocol implementation, standard, engine, or SDK — realized as a
  node of `node_type` `technology` with a `node_subtype` from the closed enum (e.g. "RISC-V",
  "OpenCV", "ROS 2").
- **Domain**: The `node_type` value `domain`; the schema-level realization of a Field. A
  visual anchor/community in the graph.
- **Subdomain**: A Domain nested under a parent Domain via a `has_subdomain` edge
  (`domain -has_subdomain-> domain`). Used when a Field is a branch of an existing Field
  rather than a new top-level cluster.
- **Concept_Hub**: A `concept` node that groups a Field's sub-area when that Field is judged
  too narrow for its own Domain. Child concepts/technologies relate to the Concept_Hub rather
  than to a new Domain.
- **Cross_Domain_Edge**: An edge whose endpoints belong to different Domains, drawn from the
  closed `relationship_type` enum, carrying provenance (`source_reference`) and honest
  `is_curated` semantics. Used to express that CS fields overlap (e.g. Computer Networks
  relates to Backend and Security).
- **Canonical_ID**: The single `id` for an entity, matching
  `^(domain|concept|technology):[a-z0-9-]+$`. One canonical node per real-world entity; ids
  are never duplicated and never reassigned.
- **Node_Subtype**: The closed technology classification enum
  (`programming_language`, `framework`, `library`, `database`, `runtime`, `platform`,
  `cloud_service`, `developer_tool`, `protocol`, `standard`, `architecture`, `technique`,
  `methodology`, `operating_system`, `engine`, `sdk`).
- **Relationship_Type**: The closed edge type enum
  (`belongs_to_domain`, `has_subdomain`, `related_to`, `implements`, `used_for`,
  `written_in`, `built_on`, `depends_on`, `integrates_with`, `alternative_to`,
  `commonly_used_with`, `supports`, `part_of_ecosystem`, `enables`).
- **Node_Audit**: The pre-expansion review of all existing nodes to find entities equivalent
  to a planned addition, so existing Canonical_IDs are reused rather than duplicated.
- **Require_Targets_Gate**: The `scripts/validate_dataset.py --require-targets` invocation
  that enforces milestone counts and all data-quality rules; its exit code 0 is the
  acceptance gate.
- **Detail_Panel**: The frontend node-detail surface that displays a node's fields.
- **Dataset_Version**: The semver string in `data/graph.json` (`version`), to which layout
  snapshots and popularity scores are keyed.
- **Scanner**: The Repo X-Ray technology matcher (separate work) that resolves technology
  nodes from a repository via the `package`, `repo`, and `aliases` node fields.
- **Validator**: `scripts/validate_dataset.py`.
- **Build_Pipeline**: The deterministic sequence `build_dataset.py` → `validate_dataset.py`
  → `generate_layout.py`.
- **System**: The TechAtlas dataset tooling, backend, and frontend collectively, as scoped by
  each requirement.

## Requirements

### Requirement 1: Surface the Field / Concept / Technology distinction

**User Story:** As a learner, I want fields, concepts, and technologies to be clearly and consistently distinguished, so that I never mistake an area of study or an idea for a concrete technology.

#### Acceptance Criteria

1. THE System SHALL classify every Phase 1E entity as exactly one of a Field (`node_type` `domain`), a Concept (`node_type` `concept`), or a Technology (`node_type` `technology`), assigning exactly one `node_type` value from the closed Node_Type enum {`domain`, `concept`, `technology`} to each entity.
2. WHERE an entity has `node_type` `technology`, THE System SHALL assign exactly one `node_subtype` value drawn from the closed Node_Subtype enum.
3. IF an entity has `node_type` `domain` or `node_type` `concept`, THEN THE System SHALL leave `node_subtype` unset and reject any assigned `node_subtype` value on that entity with an error indicating that `node_subtype` is permitted only on Technology nodes, without persisting the entity.
4. WHEN a user opens the Detail_Panel for any node, THE Detail_Panel SHALL display the node's `node_type` value.
5. WHERE the opened node has `node_type` `technology`, THE Detail_Panel SHALL display the node's `node_subtype` value in addition to its `node_type` value.
6. THE System SHALL classify "Computer Architecture" as a Field (`node_type` `domain`), "Cache Coherence" as a Concept (`node_type` `concept`), and "RISC-V" as a Technology (`node_type` `technology`).
7. WHERE a Technology represents an instruction set architecture, THE System SHALL record an explicit documented decision that selects exactly one of (a) adding a new `instruction_set_architecture` value to the Node_Subtype enum as a schema change per Requirement 10, or (b) mapping every ISA to one named existing Node_Subtype value, and THE System SHALL apply the selected option identically to every ISA node in Phase 1E.
8. IF option (a) is chosen, THEN THE System SHALL update the schema and the Validator to include the new `instruction_set_architecture` value before any node is assigned that value, and SHALL reject any node using the new value until both the schema and the Validator have been updated, with an error indicating the value is not yet defined.

### Requirement 2: Systems field expansion (priority 1)

**User Story:** As a user exploring low-level computing, I want Systems topics broadened, so that computer architecture, networks, embedded systems, HPC, and performance analysis are represented.

#### Acceptance Criteria

1. THE System SHALL expand the Systems area to add nodes covering all five of the following sub-areas: Computer Architecture (CPUs, GPUs, instruction set architectures, RISC-V, ARM, caches), Computer Networks (TCP/IP, DNS, routing, HTTP, sockets), Embedded & Real-Time Systems (RTOS, microcontrollers, firmware, ESP32), High-Performance Computing (CUDA, MPI, parallelism, OpenMP), and Measurement & Performance Analysis (benchmarking, profiling, latency, throughput), with each of the five sub-areas represented by at least one node.
2. WHERE a Systems sub-area is classified as a Subdomain per Requirement 4, THE System SHALL nest it under `domain:systems` using exactly one `has_subdomain` edge whose source is `domain:systems` and whose target is the Subdomain node.
3. WHERE a Systems sub-area is classified as a Concept_Hub per Requirement 4, THE System SHALL realize it as a `concept` node, and each child entity of that hub SHALL relate to it via exactly one relationship whose type is a member of the closed Relationship_Type enum.
4. WHEN a Systems Technology node is added, THE System SHALL assign it a `node_subtype` equal to one member of the closed Node_Subtype enum.
5. IF no member of the closed Node_Subtype enum applies to an added Systems Technology node, THEN THE System SHALL flag a required schema change per Requirement 10 and SHALL NOT assign a `node_subtype` value outside the closed enum.
6. WHEN a Systems node is added, THE System SHALL assign it a `primary_domain` that references the identifier of an existing domain node.
7. IF an added Systems node's `primary_domain` does not reference the identifier of an existing domain node, THEN THE System SHALL reject the node with an error indicating the referenced domain does not exist, and SHALL NOT persist the node.

### Requirement 3: Theory, Interdisciplinary, and AI field expansion (priorities 2-4)

**User Story:** As a user, I want theoretical, interdisciplinary, and AI areas broadened, so that the graph reflects the breadth of computer science beyond applied engineering.

#### Acceptance Criteria

1. THE System SHALL expand Theory to cover Algorithms & Complexity (Big-O, graph algorithms, P vs NP, dynamic programming), Cryptography (AES, RSA, hashing, digital signatures, zero-knowledge proofs), and Logic & Verification (formal methods, model checking, SAT/SMT, theorem proving), adding each sub-area only if an equivalent node does not already exist per the Requirement 6 audit.
2. THE System SHALL expand Interdisciplinary areas to cover Human-Computer Interaction (UX, usability, accessibility, interaction design), Robotics (ROS 2, SLAM, motion planning, perception), Computer Graphics (rendering, shaders, ray tracing, Vulkan), and Visualization (data visualization, D3.js, scientific visualization), adding each sub-area only if an equivalent node does not already exist per the Requirement 6 audit.
3. THE System SHALL expand AI by broadening `domain:ai-ml` to cover Computer Vision (image classification, object detection, segmentation, OpenCV, YOLO), Natural Language Processing (tokenization, transformers, embeddings, NLTK, spaCy), and Web & Information Retrieval (search engines, indexing, ranking, vector search, RAG), adding each sub-area only if an equivalent node does not already exist per the Requirement 6 audit.
4. WHERE a Theory/Interdisciplinary/AI sub-area is classified as a Subdomain per Requirement 4, THE System SHALL nest it under exactly one parent domain using a single `has_subdomain` edge directed from parent domain to the sub-area.
5. WHERE a Theory/Interdisciplinary/AI sub-area is classified as a Concept_Hub per Requirement 4, THE System SHALL realize it as exactly one `concept` node.
6. THE System SHALL create a Cross_Domain_Edge per Requirement 5 relating each Cryptography entity to `domain:security`, each HCI entity to `domain:frontend`, each Computer Graphics entity to `domain:gamedev`, and each Computer Vision entity to `domain:ai-ml`.
7. THE System SHALL implement the four areas strictly in the sequence Systems, then Theory, then Interdisciplinary, then AI, such that no node or edge for a lower-priority area is created before every node and edge for all higher-priority areas is created.
8. IF adding a sub-area, `has_subdomain` edge, `concept` node, or Cross_Domain_Edge would create a duplicate of an existing graph element, THEN THE System SHALL skip creation of that element and retain the existing element unchanged.

### Requirement 4: Per-field domain-vs-subdomain classification

**User Story:** As a graph curator, I want each new field explicitly classified as a top-level domain, a subdomain, or a concept hub, so that not every field becomes a top-level cluster and the map stays legible.

#### Acceptance Criteria

1. THE System SHALL classify each Phase 1E field as exactly one of the following three mutually exclusive categories: a new top-level Domain, a Subdomain of an existing Domain, or a Concept_Hub under an existing Domain.
2. IF a Phase 1E field is not assigned to exactly one of the three categories (zero categories or more than one), THEN THE System SHALL reject the field, exclude it from the graph, and produce an error indicating the unresolved or conflicting classification.
3. WHEN a field is classified, THE System SHALL record, before that field is added to the graph, its classification decision as a stated acceptance criterion that names the chosen category, the parent Domain identifier (for Subdomain and Concept_Hub categories), and a rationale of at least 1 non-empty sentence.
4. IF a field is added to the graph without a recorded classification decision containing the chosen category, parent Domain identifier where applicable, and rationale, THEN THE System SHALL reject the addition and produce an error indicating the missing classification record.
5. IF a field lacks a recorded classification decision containing the chosen category, parent Domain identifier where applicable, and rationale, THEN THE System SHALL produce an error flagging the inconsistency for audit purposes even when no attempt is made to add that field to the graph.
5. WHERE a field is a Subdomain, THE System SHALL connect it to its parent Domain with exactly one `has_subdomain` edge whose source node and target node are both of type `domain`.
6. WHERE a field is a Concept_Hub, THE System SHALL NOT create a new `domain` node for it, and SHALL attach each of its child entities to the Concept_Hub node using a relationship whose type is a member of the closed Relationship_Type enum.
7. IF a Concept_Hub child attachment references a relationship type that is not a member of the closed Relationship_Type enum, THEN THE System SHALL reject that attachment and produce an error indicating the invalid relationship type.
8. IF a field would otherwise duplicate an existing Domain (e.g. Computer Vision under existing `domain:ai-ml`), THEN THE System SHALL reuse the existing Domain node and SHALL NOT create a new top-level Domain node.

### Requirement 5: Evidence-backed cross-domain relationships

**User Story:** As a user, I want cross-field connections to be real and sourced, so that the graph shows how CS fields overlap without fabricating links.

#### Acceptance Criteria

1. WHEN a Cross_Domain_Edge is created, THE System SHALL assign its `relationship_type` exactly one value drawn from the closed Relationship_Type enum.
2. IF a Cross_Domain_Edge specifies a `relationship_type` value absent from the closed Relationship_Type enum, or omits `relationship_type` entirely, THEN THE System SHALL reject the edge, record no edge in the graph, and emit an error indicating the invalid or missing `relationship_type`.
3. WHEN a Cross_Domain_Edge is created, THE System SHALL require a non-empty `source_reference` provenance value of at least 1 character.
4. IF a Cross_Domain_Edge is missing a `source_reference` or its `source_reference` is empty, THEN THE System SHALL reject the edge, record no edge in the graph, and emit an error indicating absent or empty provenance.
5. THE System SHALL represent each of the following as a Cross_Domain_Edge carrying a closed-enum `relationship_type`: Computer Networks to each of Backend, Security, and networking concepts; Computer Vision to each of AI, Robotics, Graphics, Python, and GPU computing; Cryptography to each of theory, Security, authentication, and distributed systems; High-Performance Computing to each of computer architecture, CUDA, distributed computing, and machine learning; and Human-Computer Interaction to each of Frontend, accessibility, design, and Visualization.
6. WHEN a Cross_Domain_Edge is hand-verified against its `source_reference`, THE System SHALL set `is_curated` to true; WHEN a Cross_Domain_Edge is inferred rather than hand-verified, THE System SHALL set `is_curated` to false.
7. IF a Cross_Domain_Edge's provenance is unsupported by its `source_reference`, THEN THE System SHALL omit the edge from the graph.
8. IF a Cross_Domain_Edge violates any validator endpoint rule — a `has_subdomain` edge whose source or target is not a domain node, a `written_in` edge whose target is not a programming_language node, or a `belongs_to_domain` edge whose target is not a domain node — THEN THE System SHALL reject the edge, record no edge in the graph, and emit an error indicating the violated endpoint rule.

### Requirement 6: Audit-first, no duplication

**User Story:** As a graph curator, I want existing nodes audited before anything is added, so that new entities never duplicate entities already in the graph.

#### Acceptance Criteria

1. WHEN Phase 1E planning begins, THE System SHALL perform a Node_Audit comparing each planned addition against all 417 existing nodes (11 domains, 155 concepts, 251 technologies) before adding any node.
2. WHERE the Node_Audit compares a planned entity against an existing node, THE System SHALL classify the pair as equivalent when both resolve to the same real-world entity, determined by matching normalized name (case-insensitive, whitespace- and punctuation-trimmed) or by a shared `(node_type, slug)` pair.
3. IF the Node_Audit classifies an existing node as equivalent to a planned entity, THEN THE System SHALL reuse that existing node's Canonical_ID and SHALL NOT create a new node for that entity.
4. THE System SHALL maintain exactly one canonical node per real-world entity.
5. WHEN a new node is added, THE System SHALL assign a Canonical_ID matching `^(domain|concept|technology):[a-z0-9-]+$` that is not equal to any Canonical_ID among the existing nodes or any other node added during Phase 1E.
6. THE System SHALL preserve every existing Canonical_ID unchanged across the Phase 1E expansion, such that the count and values of the 417 pre-existing Canonical_IDs are identical before and after expansion.
7. WHEN the expanded dataset is validated, THE Validator SHALL report exactly zero duplicate node ids and exactly zero duplicate `(node_type, slug)` pairs.
8. IF the Validator detects one or more duplicate node ids or duplicate `(node_type, slug)` pairs, THEN THE Validator SHALL fail validation and SHALL report each conflicting Canonical_ID or `(node_type, slug)` pair, and the expanded dataset SHALL NOT be accepted.

### Requirement 7: Populate fields with concepts, techniques, algorithms, standards, and tools

**User Story:** As a learner, I want each selected field populated with its important concepts, techniques, algorithms, standards, and tools, so that fields are substantive rather than empty labels.

#### Acceptance Criteria

1. WHEN a field is selected for population, THE System SHALL add its concepts, techniques, algorithms, standards, and tools as nodes, assigning each node the `node_type` value matching its category.
2. WHEN adding a technology node, THE System SHALL set its `node_subtype` to an existing value from the closed Node_Subtype enum, and WHEN adding an edge, THE System SHALL set its relationship to an existing value from the closed Relationship_Type enum.
3. IF no existing Node_Subtype value fits an added technology node, or no existing Relationship_Type value fits an added edge, THEN THE System SHALL flag an explicit schema change per Requirement 10.
4. THE System SHALL NOT assign a non-enum or approximate `node_subtype` or `relationship_type` value to any node or edge at any time, as a standing unconditional rule independent of whether a schema-change trigger condition has occurred.
5. THE System SHALL NOT create any node, edge, popularity figure, or percentage that is not supported by a verifiable source.
6. WHEN adding a significant edge, THE System SHALL attach a non-empty `source_reference` identifying the provenance of that edge, and IF a significant edge lacks a verifiable `source_reference`, THEN THE System SHALL NOT add that edge.
7. WHERE a node has a Wikipedia identity, THE System SHALL set its `wikipedia_title` to the exact Wikipedia article title and SHALL NOT derive the title from the node name.

### Requirement 8: Preserve existing behavior (popularity, search, Wikipedia, Scanner)

**User Story:** As an existing user, I want popularity sizing, search, Wikipedia summaries, and the Repo X-Ray scanner to keep working, so that the expansion does not regress existing features.

#### Acceptance Criteria

1. WHEN popularity scoring is computed for any technology present before the Phase 1E expansion, THE System SHALL produce the same popularity score and the same size output as the Phase 1D behavior for identical inputs, including applying the connectivity-based fallback for any technology with no sourced popularity score.
2. WHEN a search query matches an added node's `name` or any value in its declared `aliases`, THE System SHALL return that node in the search results.
3. WHEN Wikipedia identity is resolved for an added node that has a `wikipedia_title`, THE System SHALL resolve it using the exact `wikipedia_title` value and SHALL NOT use name-derived lookup.
4. WHEN the Repo X-Ray scanner resolves an added Technology node that corresponds to a real package or repository, THE System SHALL resolve that Technology using the node's populated `package`, `repo`, and `aliases` fields.
5. IF an added Technology node corresponds to a real package or repository but is missing one or more of the `package`, `repo`, or `aliases` fields required for Scanner resolution, THEN THE System SHALL reject that node during validation and SHALL indicate which required field is missing, and the node SHALL NOT be added to the graph.
6. WHEN an `/api/v1` request is served, THE System SHALL return response shapes that retain every field and structural element present before the Phase 1E expansion, and SHALL NOT remove or rename any existing field or response-shape element; new fields or nodes added by Phase 1E SHALL be additive only.
7. THE System SHALL preserve the graph schema such that no existing field is removed or renamed and all changes are additive.
8. IF a technology has no sourced popularity value, THEN THE System SHALL mark that technology as having no popularity score and SHALL NOT assign a fabricated or default non-fallback popularity value.

### Requirement 9: Layout and positioning

**User Story:** As a user, I want new fields positioned sensibly without the existing map shifting around, so that the expansion is additive to the visual layout.

#### Acceptance Criteria

1. WHEN `scripts/generate_layout.py` is executed two or more times against the same Dataset_Version, THE System SHALL produce byte-identical node coordinates across all runs.
2. WHEN a new top-level Domain is added, THE System SHALL assign its coordinates through the deterministic layout pipeline in `scripts/generate_layout.py` while honoring the no-overlap constraint.
3. WHEN `scripts/generate_layout.py` generates a layout for a new Dataset_Version, THE System SHALL preserve the exact coordinates (zero positional delta on both axes) of every node that is unchanged from the prior Dataset_Version via cross-version pinning.
4. THE System SHALL position node bubbles such that the edge-to-edge gap between any two bubbles is greater than or equal to the minimum margin value defined in `scripts/sizing.py`.
5. IF a no-overlap constraint or a cross-version pinning constraint cannot be satisfied, THEN THE System SHALL abort without writing a partial or shifted layout file and SHALL report an error indicating the violated constraint and the affected node identifier.
6. THE System SHALL read all node sizing and margin values from `scripts/sizing.py` in both the layout generator and the backend, with no duplicated sizing constants defined elsewhere.

### Requirement 10: Closed schema enums stay authoritative

**User Story:** As a maintainer, I want the closed schema enums to remain authoritative, so that any new classification is a deliberate, validated schema change rather than an ad-hoc value.

#### Acceptance Criteria

1. THE System SHALL treat the `node_type`, `node_subtype`, and `relationship_type` enums defined in `data/schema/graph-schema.json` as the single closed, authoritative set of permitted values, where "closed" means no value outside these enums is valid for any node or edge.
2. IF a Phase 1E addition requires a `node_subtype` or `relationship_type` value that is not present in the authoritative enums, THEN THE System SHALL reject the addition until the value is added to `data/schema/graph-schema.json` as an explicit schema change.
3. WHEN a value is added to any enum in `data/schema/graph-schema.json`, THE System SHALL update both `data/schema/graph-schema.json` and `scripts/validate_dataset.py` within the same change set before any node or edge references the new value.
4. WHEN `scripts/validate_dataset.py` runs, IF one or more nodes or edges have a `node_type`, `node_subtype`, or `relationship_type` value absent from the authoritative enums in `data/schema/graph-schema.json`, THEN THE System SHALL report in a single run a validation error for every offending node or edge together with its invalid value, and SHALL exit with a non-zero exit code.

### Requirement 11: Validation, versioning, and pre-deploy testing

**User Story:** As a maintainer, I want the expansion validated, versioned, and tested before deployment, so that the live site is never updated with an invalid or unverified graph.

#### Acceptance Criteria

1. WHEN the expanded dataset is validated by `scripts/validate_dataset.py` with the `--require-targets` gate, THE Require_Targets_Gate SHALL exit with code 0 only if every validation check passes, and SHALL exit with a non-zero code otherwise.
2. WHEN the dataset content changes, THE System SHALL increment the Dataset_Version following semantic versioning (MAJOR.MINOR.PATCH), where a backward-incompatible schema or data change increments MAJOR, an additive change increments MINOR, and a correction that does not change structure increments PATCH.
3. WHEN preparing a deployment, THE System SHALL run the Build_Pipeline stages in order (`build_dataset`, then `validate`, then `generate_layout`) against the real dataset, followed by the browser/end-to-end test suite, before any deployment step executes.
4. IF any Build_Pipeline stage exits with a non-zero code OR any browser/end-to-end test fails, THEN THE System SHALL abort the deployment, leave the live dataset unchanged, and report which stage or test failed.
5. WHEN the expanded dataset is rendered, THE System SHALL render all nodes and edges present before the expansion with the same visual representation and layout behavior as before the expansion.

### Requirement 12: Independence from Repo X-Ray

**User Story:** As a maintainer, I want Phase 1E kept independent of the Repo X-Ray scanner work, so that the two efforts can proceed and ship on separate timelines.

#### Acceptance Criteria

1. THE System SHALL implement Phase 1E as a self-contained dataset and graph expansion whose Build_Pipeline, validation, and deployment complete successfully without requiring any Repo X-Ray scanner code, configuration, or deployment to be present.
2. WHERE Phase 1E adds Technology nodes, THE System SHALL populate each node's `package`, `repo`, and `aliases` fields such that they pass `scripts/validate_dataset.py` without introducing any dependency on Repo X-Ray scanner changes.
3. THE System SHALL NOT include any Phase 2 AI recommendation functionality within Phase 1E.

## Non-Functional Constraints

- **NFR-1 (Canonical identity).** One canonical node per entity; Canonical_IDs are preserved,
  never duplicated, and never reassigned across Phase 1E.
- **NFR-2 (No fabrication).** The System SHALL never fabricate nodes, edges, popularity
  figures, or percentages; absence of data SHALL be represented as absence. Every significant
  edge SHALL carry provenance via `source_reference`, and `is_curated` SHALL be `true` only
  for hand-verified relationships.
- **NFR-3 (Closed enums).** The schema `node_type`, `node_subtype`, and `relationship_type`
  enums remain authoritative; any new value is a deliberate schema change validated by both
  the schema file and the Validator before use.
- **NFR-4 (Validation gate).** All additions SHALL pass
  `scripts/validate_dataset.py --require-targets` with exit code 0, and the Dataset_Version
  SHALL be bumped per semantic versioning.
- **NFR-5 (Determinism).** The Build_Pipeline SHALL remain deterministic and CI-reproducible,
  preserving unchanged-node coordinates via cross-version pinning and the no-overlap guarantee.
- **NFR-6 (Preservation).** Phase 1D popularity behavior, search, exact `wikipedia_title`
  resolution, and the Repo X-Ray scanner's package/repo/alias matching SHALL continue to hold.
- **NFR-7 (Backward compatibility).** The graph schema and `/api/v1` response shapes SHALL
  remain backward compatible; new data SHALL be additive.
- **NFR-8 (Pre-deploy verification).** Backend, frontend, dataset, and browser/end-to-end
  tests SHALL pass before any deployment that includes the Phase 1E expansion.
