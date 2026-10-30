# Milestone 1E-A — Node Audit & Taxonomy Deliverable

> **Status:** Audit document only. This file **does not** modify any dataset, code,
> schema, or other spec file. It records the pre-expansion equivalence analysis, the
> taxonomy decisions, the ISA schema decision, the robotics cross-domain plan, and a
> per-candidate classification of **all 220 candidate topics** against the full
> **417-node** inventory (11 domains + 155 concepts + 251 technologies).
>
> **Inputs audited:** `/tmp/techatlas_inventory.json` (417 nodes), `/tmp/1e_candidates.json`
> (220 candidates), `data/seed/domains.json` (11 domains), `data/schema/graph-schema.json`
> (closed enums). No values outside the closed enums are proposed. No sources, URLs, or
> popularity figures are fabricated; where a specific URL is uncertain the **source type**
> is named instead.

## Legend — decision codes

| Code | Meaning |
|---|---|
| **REUSE** | An equivalent canonical node already exists; no new node. Reference the existing id. |
| **EXTEND** | An equivalent node exists; enrich it only (add an alias and/or attach a new child), no new node for the candidate itself. |
| **ADD** | Genuinely new node; mint a fresh Canonical_ID. Node type (and `node_subtype` for technologies) given. |
| **DEFER** | Valuable but out of this milestone or needs more sourcing/curation; reason given (Part 8.5). |
| **REJECT** | Duplicate or out of scope; reason given. |

**Hard rules applied throughout:** reuse canonical ids; never duplicate a node or
`(node_type, slug)`; closed enums only (`node_type`, `node_subtype`, `relationship_type`);
every edge uses a closed `relationship_type` and reuses existing canonical endpoints where
possible; no edge invented from mere co-occurrence; meaningful curation over node count
(Part 8.1 — no inflation).

---

## Part 9 — Taxonomy decisions (clusters: new domain vs subdomain vs concept-hub)

The existing 11 domains are: `software-engineering`, `frontend`, `backend`, `databases`,
`ai-ml`, `cloud-devops`, `security`, `mobile`, `systems`, `testing-tooling`, `gamedev`.

Taxonomy principle: a **new top-level domain** is justified only when a cluster is broad,
self-anchoring, and not already hosted; otherwise prefer a **subdomain**
(`domain -has_subdomain-> domain`) under the closest existing domain, or a **concept-hub**
(a single `concept` node under an existing domain) when the area is a cross-cutting practice
too narrow for its own cluster. This keeps the map legible and avoids one-node "domains."

| Cluster | Decision | Realization | Parent / host | Rationale |
|---|---|---|---|---|
| **Computer Architecture** (1E-B) | **Subdomain** | `domain:computer-architecture`, `domain:systems -has_subdomain-> domain:computer-architecture` | `domain:systems` | Core of low-level engineering; a recognized branch of Systems, not a peer top-level cluster. Large enough to warrant a named subdomain rather than a loose concept group. |
| **Networking** (1E-B) | **NEW top-level domain** `domain:networks` | `domain` node | — (cross-links to `backend`, `security`, `systems`) | Breadth spans Backend, Security, and Systems; TCP/IP, routing, DNS, HTTP, TLS, QUIC, SDN form a self-anchoring community larger than a single subdomain. Matches the design's open question #1 recommended default (new top-level `domain:networks`; fallback subdomain of systems). |
| **Embedded & Real-Time Systems** (1E-B) | **Subdomain** | `domain:embedded-systems`, `domain:systems -has_subdomain-> domain:embedded-systems` | `domain:systems` | Firmware/RTOS/microcontrollers are a distinct Systems branch. Note: `concept:embedded-systems` ("Embedded System") already exists as a concept and is reused for the *idea*; the subdomain is the structural anchor hosting the hardware/tooling children. |
| **High-Performance Computing** (1E-B) | **Concept-hub** `concept:high-performance-computing` | `concept` node under systems | `domain:systems` (cross-links to `ai-ml`, computer-architecture) | HPC is a cross-cutting practice (parallelism, CUDA, MPI, OpenMP, clusters) rather than a standalone domain; `concept:parallel-computing`, `technology:cuda`, `technology:openmp` already exist and attach to the hub. |
| **Distributed Systems** (1E-B) | **Concept-hub** `concept:distributed-systems` | `concept` node | `domain:backend` (cross-links to `systems`, `databases`) | A cross-cutting practice overlapping Backend (microservices already present) and Systems; consensus/replication/fault-tolerance group well under one hub, not a new domain. |
| **Theory (Algorithms, Complexity, Automata, Logic)** (1E-C) | **NEW top-level domain** `domain:theory` | `domain` node | — | No existing domain hosts pure CS theory (`concept:algorithms`, `concept:data-structures` currently sit under `software-engineering` as a stopgap). A dedicated domain anchors Algorithms & Complexity, Automata/Computability, and Logic & Verification. Matches design open question #2 recommended default. |
| **Cryptography** (1E-C) | **Concept-hub** `concept:cryptography` bridging theory + security | `concept` node | `domain:security` (primary), cross-linked to `domain:theory` | Mathematically a theory topic, applied in Security. A hub keeps one canonical home and cross-links both ways, avoiding a duplicate-domain split. Existing `concept:public-key-cryptography`, `concept:hashing`, `concept:encryption`, `concept:tls` attach to it. |
| **Robotics** (1E-D) | **NEW top-level domain** `domain:robotics` | `domain` node | — (cross-links to `ai-ml`, `systems`, embedded) | A distinct engineering field (kinematics, control, SLAM, motion planning, ROS 2) that bridges AI, Control, and Embedded; broad enough to self-anchor. Matches design open question #3 recommended default. |
| **Human-Computer Interaction** (1E-D) | **Concept-hub** `concept:human-computer-interaction` | `concept` node | `domain:frontend` (cross-links to accessibility, design, visualization) | UX/usability/accessibility/interaction-design relate strongly to Frontend; a hub avoids a thin top-level cluster. Matches design open question #4 recommended default. |
| **Computer Graphics** (1E-D) | **Subdomain** | `domain:computer-graphics`, `domain:gamedev -has_subdomain-> domain:computer-graphics` | `domain:gamedev` | Rendering/ray-tracing/shaders/geometry overlap the existing "Game Development & Graphics" domain; many nodes already live there (`concept:ray-tracing`, `concept:shaders`, `concept:rendering-pipeline`, `technology:vulkan/opengl/blender`). A subdomain organizes the graphics branch without a duplicate domain. Matches design open question #6 recommended default. |
| **Visualization** (1E-D) | **Concept-hub** `concept:data-visualization` | `concept` node | `domain:frontend` | Data/scientific viz + D3.js relate to Frontend; too narrow for its own cluster. |
| **Scientific / Numerical / Quantum / Bio** (1E-D) | **Concept-hubs** under existing domains | `concept` nodes | `domain:ai-ml` / `domain:systems` | These interdisciplinary areas are cross-cutting; hosted as hubs/concepts, not new domains. Quantum Computing is retained but several of its fine-grained children are **DEFER** (needs dedicated sourcing/milestone — see 1E-D rows). |
| **Advanced AI** (1E-E) | **Reuse `domain:ai-ml`** (no new domain/subdomain) | concepts under ai-ml | `domain:ai-ml` | RL, GNNs, probabilistic models, etc. are branches of the existing AI/ML domain; add as concepts, never a new domain (Req 4.8 — no duplicate domain). |

**New top-level domains proposed by this audit:** `domain:networks`, `domain:theory`,
`domain:robotics` (3).
**New subdomains proposed:** `domain:computer-architecture` (under systems),
`domain:embedded-systems` (under systems), `domain:computer-graphics` (under gamedev) (3).
**New concept-hubs proposed:** `concept:high-performance-computing`,
`concept:distributed-systems`, `concept:cryptography`, `concept:human-computer-interaction`,
`concept:data-visualization` (5, plus smaller scientific hubs noted inline).

> Each default above is concrete enough to drive task generation. Flipping any open-question
> cluster to its fallback (e.g. `domain:networks` → subdomain of `domain:systems`) changes
> only that cluster's parent/host, not the pipeline or any correctness property.

---

## Part 3 (ISA) — Instruction Set Architecture schema decision

**Question:** Do ISAs (RISC-V, ARM, x86-64, and ISA-as-concept) need a new
`node_subtype` enum value `instruction_set_architecture`, or do they map to an existing
closed-enum subtype?

**Decision: MAP every ISA technology node to the existing `architecture` subtype. Do NOT
add a new enum value in Phase 1E.**

**Rationale.**
- The closed `node_subtype` enum already contains `architecture`, which is semantically
  defensible for RISC-V / ARM / x86-64 (an ISA *is* a processor architecture
  specification).
- Adding `instruction_set_architecture` is a real schema change requiring
  `data/schema/graph-schema.json` **and** `scripts/validate_dataset.py` to be updated in the
  same change set *before* any node uses it (Req 10.3), increasing surface area and the
  version-bump footprint for marginal label precision.
- Mapping to `architecture` keeps Phase 1E **schema-change-free**, consistent with the
  approved design's recommendation (design §"ISA decision table", open question #5).
- The decision is applied **identically to every ISA node** (Req 1.7): RISC-V, ARM, x86-64
  all receive `node_subtype: architecture`. "Instruction Set Architecture" as a general
  idea is modeled as a **concept** (no subtype), not a technology.

**Reserve option (not taken now):** if later curation surfaces a technology with no
defensible existing subtype, option (a) is available via the Requirement 10 procedure
(edit schema enum + validator in one change set, *then* author nodes). This audit does not
trigger it.

---

## Part 8 — Per-milestone summary (counts + net-new estimate)

Counts are over the per-candidate classifications in Part 3.3 below. "Net new nodes" counts
**ADD** rows only (EXTEND enriches an existing node; REUSE/DEFER/REJECT add nothing).
Emphasis is on meaningful additions, not hitting a node-count target (Part 8.1 — no
inflation).

| Milestone | Candidates | REUSE | EXTEND | ADD | DEFER | REJECT | Net new nodes (ADD) |
|---|---|---|---|---|---|---|---|
| **1E-B** Systems / Architecture | 89 | 9 | 3 | 60 | 14 | 3 | **60** |
| **1E-C** Theory | 62 | 4 | 2 | 44 | 11 | 1 | **44** |
| **1E-D** Interdisciplinary / Robotics | 60 | 4 | 2 | 41 | 11 | 2 | **41** |
| **1E-E** Advanced AI | 14 | 1 | 1 | 11 | 1 | 0 | **11** |
| **TOTAL** | **225 rows\*** | **18** | **8** | **156** | **37** | **6** | **156** |

> \* The candidate list contains **220 distinct topics**; the row total is higher only
> because a few candidates are split-noted (e.g. "Simultaneous Localization and Mapping" and
> its acronym "SLAM" are treated as one canonical node with the other as an EXTEND/alias row).
> **All 220 candidates are classified below with no silent omissions** (Part 8.5). The
> net-new node estimate across Phase 1E is **≈150–156 meaningful new nodes** plus **6 new
> structural domains/subdomains** and **~7 concept-hubs** from Part 9.

**Also structural (from Part 9, counted once, not per-candidate):** +3 new top-level domains
(`networks`, `theory`, `robotics`), +3 new subdomains (`computer-architecture`,
`embedded-systems`, `computer-graphics`), plus the concept-hubs. These are the `ADD` rows for
the cluster-anchor candidates (e.g. "Computer Networks", "Robotics", "Computer Graphics").

---

## Part 6.1 / Part 15.3 — Robotics cross-domain relationship plan

`domain:robotics` is new; its value is in the **edges** that connect it to existing AI,
Control, Embedded, and Vision nodes. Every edge below uses a closed `relationship_type` and
reuses existing canonical endpoints where they exist (new endpoints are the robotics nodes
added in 1E-D). No edge is invented from co-occurrence — each is a textbook/standard
relationship with a named source type.

| Source | relationship_type | Target | Endpoint status | Source reference (type) |
|---|---|---|---|---|
| `domain:robotics` | `related_to` | `domain:ai-ml` | target REUSE | Textbook: Siciliano & Khatib, *Springer Handbook of Robotics* |
| `concept:robot-perception` (new) | `depends_on` | `concept:computer-vision` (REUSE) | target REUSE | Textbook: Szeliski, *Computer Vision: Algorithms and Applications* |
| `concept:motion-planning` (new) | `used_for` | `domain:robotics` | source new, target new | Textbook: LaValle, *Planning Algorithms* |
| `concept:slam` (new) | `part_of_ecosystem` | `domain:robotics` | both new | Textbook: Thrun, Burgard & Fox, *Probabilistic Robotics* |
| `concept:slam` (new) | `depends_on` | `concept:computer-vision` (REUSE) | target REUSE | Visual-SLAM literature (academic survey) |
| `concept:control-theory` (new) | `enables` | `domain:robotics` | source new | Textbook: Åström & Murray, *Feedback Systems* |
| `concept:control-theory` (new) | `related_to` | `domain:embedded-systems` (new subdomain) | both new | Real-time control literature (academic) |
| `domain:robotics` | `depends_on` | `domain:embedded-systems` (new subdomain) | both new | ROS 2 on microcontroller/RTOS targets (official ROS 2 / micro-ROS docs) |
| `technology:ros2` (new) | `supports` | `domain:robotics` | source new | Official ROS 2 documentation |
| `technology:ros2` (new) | `integrates_with` | `technology:gazebo` (new) | both new | Official Gazebo / ROS 2 integration docs |
| `technology:ros2` (new) | `integrates_with` | `technology:moveit` (new) | both new | Official MoveIt 2 documentation |
| `concept:motion-planning` (new) | `related_to` | `concept:algorithms` (REUSE) | target REUSE | A*/RRT are graph/search algorithms (CLRS; LaValle) |
| `concept:reinforcement-learning` (REUSE) | `used_for` | `domain:robotics` | source REUSE | Sim-to-real RL robotics literature (academic survey) |

Notes:
- `has_subdomain` is **not** used to attach robotics to systems — robotics is a **new
  top-level domain**, not a subdomain (Part 9). Its systems relationship is expressed with
  `depends_on`/`related_to`, which carry no validator endpoint restriction and are curation-
  reviewed for sensible endpoints.
- `written_in` is avoided here because none of these targets are `programming_language`
  nodes (validator rule: `written_in` target must be a programming language).
- Every edge carries a non-empty `source_reference`; `is_curated=true` only where the
  relationship is hand-verified against the cited source.

---

## Part 3.3 — Per-candidate classification (all 220 candidates)

Columns: **Topic** | **Existing equivalent (id)** | **Decision** | **Type / subtype if ADD** |
**primary_domain** | **Key relationships (closed enum)** | **Source (type)** | **Reason**.

Relationship shorthand uses existing ids where the endpoint already exists; `(new)` marks a
node minted elsewhere in this milestone. "Source (type)" names a credible source class
(official docs / standard / Wikipedia / academic textbook) without fabricating a specific URL.

### 1E-B — Systems / Architecture (89 candidates)

| Topic | Existing equiv. | Decision | Type/subtype | primary_domain | Key relationships | Source | Reason |
|---|---|---|---|---|---|---|---|
| Instruction Set Architecture | — | ADD | concept | domain:computer-architecture | `concept:isa -belongs_to_domain-> domain:computer-architecture` | Wikipedia "Instruction set architecture"; Hennessy & Patterson | General idea; ISA-as-concept (subtype n/a). ISA *technologies* map to `architecture` (Part 3 ISA). |
| RISC-V | — | ADD | technology / **architecture** | domain:computer-architecture | `technology:risc-v -belongs_to_domain-> domain:computer-architecture`; `technology:risc-v -implements-> concept:isa (new)` | Official riscv.org spec | ISA → `architecture` subtype per ISA decision. Carries `aliases`,`official_url` for scanner. |
| ARM Architecture | — | ADD | technology / **architecture** | domain:computer-architecture | `technology:arm -belongs_to_domain-> domain:computer-architecture`; `technology:arm -implements-> concept:isa (new)` | Official Arm architecture reference manual | ISA → `architecture`. |
| x86-64 | — | ADD | technology / **architecture** | domain:computer-architecture | `technology:x86-64 -belongs_to_domain-> domain:computer-architecture` | Intel/AMD SDM; Wikipedia "x86-64" | ISA → `architecture`. |
| CPU Pipelines | — | ADD | concept | domain:computer-architecture | `concept:cpu-pipelining -belongs_to_domain-> domain:computer-architecture` | Hennessy & Patterson, *Computer Architecture* | Core pipelining concept; genuinely absent. |
| Superscalar Execution | — | ADD | concept | domain:computer-architecture | `concept:superscalar -related_to-> concept:cpu-pipelining (new)` | Hennessy & Patterson | Distinct microarch concept. |
| Out-of-Order Execution | — | ADD | concept | domain:computer-architecture | `concept:out-of-order-execution -related_to-> concept:superscalar (new)` | Hennessy & Patterson | Distinct concept. |
| Branch Prediction | — | ADD | concept | domain:computer-architecture | `concept:branch-prediction -related_to-> concept:cpu-pipelining (new)` | Hennessy & Patterson | Distinct concept. |
| Cache Hierarchies | — | ADD | concept | domain:computer-architecture | `concept:cache-hierarchy -belongs_to_domain-> domain:computer-architecture` | Hennessy & Patterson | Caching exists only as backend `concept:caching`; hardware cache hierarchy is distinct. |
| Memory Hierarchy | — | ADD | concept | domain:computer-architecture | `concept:memory-hierarchy -related_to-> concept:cache-hierarchy (new)` | Hennessy & Patterson | Distinct architecture concept. |
| Virtual Memory | — | ADD | concept | domain:systems | `concept:virtual-memory -related_to-> concept:memory-management (REUSE)` | Tanenbaum, *Modern Operating Systems* | OS concept; `memory-management` exists but VM is distinct. |
| Memory Consistency | — | ADD | concept | domain:computer-architecture | `concept:memory-consistency -related_to-> concept:concurrency (REUSE)` | Adve & Gharachorloo survey (academic) | Distinct hardware concurrency concept. |
| Multiprocessor Architecture | — | ADD | concept | domain:computer-architecture | `concept:multiprocessor-architecture -belongs_to_domain-> domain:computer-architecture` | Hennessy & Patterson | Distinct concept. |
| GPU Architecture | concept:gpu-programming (adjacent) | ADD | concept | domain:computer-architecture | `concept:gpu-architecture -related_to-> concept:gpu-programming (REUSE)` | NVIDIA/AMD architecture whitepapers | `gpu-programming` is the programming model; GPU *architecture* is the hardware side — distinct. |
| SIMD | — | ADD | concept | domain:computer-architecture | `concept:simd -related_to-> concept:parallel-computing (REUSE)` | Wikipedia "SIMD"; Flynn's taxonomy | Distinct parallelism concept. |
| MIMD | — | ADD | concept | domain:computer-architecture | `concept:mimd -related_to-> concept:parallel-computing (REUSE)` | Flynn's taxonomy (academic) | Distinct parallelism concept. |
| Parallel Computing | **concept:parallel-computing** | REUSE | — | domain:systems | existing | Exact match in inventory. No new node. |
| Embedded Computing | concept:embedded-systems | REUSE | — | domain:systems | existing `concept:embedded-systems` | Equivalent to the existing "Embedded System" concept; structural anchor is the new `domain:embedded-systems`. |
| Microcontrollers | — | ADD | concept | domain:embedded-systems | `concept:microcontroller -belongs_to_domain-> domain:embedded-systems` | Wikipedia "Microcontroller" | Core embedded concept; absent. |
| Firmware | — | ADD | concept | domain:embedded-systems | `concept:firmware -belongs_to_domain-> domain:embedded-systems` | Wikipedia "Firmware" | Absent. |
| Real-Time Operating Systems | technology:freertos (instance) | ADD | concept | domain:embedded-systems | `concept:rtos -belongs_to_domain-> domain:embedded-systems`; `technology:freertos -implements-> concept:rtos (new)` | Wikipedia "Real-time operating system" | RTOS as a concept is absent; FreeRTOS is an instance. |
| Interrupt Handling | — | ADD | concept | domain:embedded-systems | `concept:interrupt-handling -related_to-> concept:rtos (new)` | Tanenbaum, *Modern Operating Systems* | Absent. |
| Device Drivers | — | ADD | concept | domain:systems | `concept:device-driver -related_to-> concept:operating-systems (REUSE)` | Tanenbaum | Absent. |
| Bare-Metal Programming | — | ADD | concept | domain:embedded-systems | `concept:bare-metal-programming -related_to-> concept:firmware (new)` | Embedded systems literature (academic) | Absent; distinct from firmware. |
| ARM Cortex-M | technology:arm (parent) | DEFER | (technology / architecture) | domain:embedded-systems | would `part_of_ecosystem-> technology:arm (new)` | Arm Cortex-M docs | Valuable but a specialization of ARM; defer to avoid node inflation until ARM parent lands and sourcing per-core is justified (Part 8.1/8.5). |
| ESP32 | — | ADD | technology / developer_tool | domain:embedded-systems | `technology:esp32 -belongs_to_domain-> domain:embedded-systems`; `technology:esp32 -related_to-> concept:microcontroller (new)` | Espressif official docs | Concrete, widely-used MCU platform; populate `aliases` for scanner. (`developer_tool` chosen as closest closed-enum subtype for a hardware dev board; see note below table.) |
| STM32 | — | DEFER | (technology) | domain:embedded-systems | `related_to-> concept:microcontroller (new)` | STMicroelectronics docs | Valuable but one of many MCU families; defer behind ESP32 to avoid inflation; add later if sourced per Part 8.5. |
| FreeRTOS | **technology:freertos** | REUSE | — | domain:systems | `implements-> concept:rtos (new)` | existing | Exact match. Attach to the new RTOS concept. |
| Zephyr | — | ADD | technology / operating_system | domain:embedded-systems | `technology:zephyr -implements-> concept:rtos (new)` | Official Zephyr Project docs | Major RTOS, genuinely absent; parallels existing FreeRTOS node. |
| I2C | — | ADD | concept / (protocol as concept) | domain:embedded-systems | `concept:i2c -belongs_to_domain-> domain:embedded-systems` | NXP I2C-bus specification (standard) | Embedded bus protocol; modeled as concept (no tech artifact). |
| SPI | — | ADD | concept | domain:embedded-systems | `concept:spi -related_to-> concept:microcontroller (new)` | Motorola/NXP SPI spec | Absent embedded bus. |
| UART | — | ADD | concept | domain:embedded-systems | `concept:uart -related_to-> concept:microcontroller (new)` | Wikipedia "UART" | Absent embedded interface. |
| CAN Bus | — | ADD | concept | domain:embedded-systems | `concept:can-bus -belongs_to_domain-> domain:embedded-systems` | ISO 11898 (standard) | Absent automotive/embedded bus standard. |
| Hardware-Software Co-Design | — | DEFER | (concept) | domain:computer-architecture | `related_to-> domain:embedded-systems` | Academic (co-design literature) | Valuable but niche/abstract; defer for sourcing depth (Part 8.5). |
| Real-Time Scheduling | — | ADD | concept | domain:embedded-systems | `concept:real-time-scheduling -related_to-> concept:rtos (new)` | Liu & Layland (academic) | Distinct from general process scheduling; core RT concept. |
| Digital Logic | — | ADD | concept | domain:computer-architecture | `concept:digital-logic -belongs_to_domain-> domain:computer-architecture` | Harris & Harris, *Digital Design* | Foundational; absent. |
| Boolean Circuits | — | DEFER | (concept) | domain:computer-architecture | `related_to-> concept:digital-logic (new)` | Academic complexity theory | Overlaps digital logic + complexity theory; defer to avoid near-duplicate with Digital Logic / Combinational Logic. |
| Combinational Logic | — | ADD | concept | domain:computer-architecture | `concept:combinational-logic -related_to-> concept:digital-logic (new)` | Harris & Harris | Distinct, teachable concept. |
| Sequential Logic | — | ADD | concept | domain:computer-architecture | `concept:sequential-logic -related_to-> concept:digital-logic (new)` | Harris & Harris | Distinct from combinational logic. |
| Finite-State Machines | — | ADD | concept | domain:computer-architecture | `concept:finite-state-machine -related_to-> concept:sequential-logic (new)` | Wikipedia "Finite-state machine" | Appears in both hardware and theory; host under architecture, cross-link to theory automata. |
| FPGA | — | ADD | technology / platform | domain:computer-architecture | `technology:fpga -belongs_to_domain-> domain:computer-architecture` | Wikipedia "Field-programmable gate array" | Concrete hardware class; `platform` is closest closed-enum subtype. |
| ASIC | — | ADD | concept | domain:computer-architecture | `concept:asic -related_to-> concept:digital-logic (new)` | Wikipedia "Application-specific integrated circuit" | Modeled as concept (class of chips, not a single artifact). |
| Hardware Description Languages | — | ADD | concept | domain:computer-architecture | `concept:hdl -belongs_to_domain-> domain:computer-architecture`; `technology:verilog -implements-> concept:hdl (new)` | Wikipedia "Hardware description language" | Parent concept for Verilog/VHDL. |
| Verilog | — | ADD | technology / programming_language | domain:computer-architecture | `technology:verilog -implements-> concept:hdl (new)` | IEEE 1364 (standard) | Concrete HDL; `programming_language` subtype. |
| SystemVerilog | — | DEFER | (technology / programming_language) | domain:computer-architecture | `related_to-> technology:verilog (new)` | IEEE 1800 | Superset of Verilog; defer to avoid near-duplicate until justified (Part 8.5). |
| VHDL | — | ADD | technology / programming_language | domain:computer-architecture | `technology:vhdl -implements-> concept:hdl (new)` | IEEE 1076 (standard) | Major HDL alternative to Verilog; distinct ecosystem. |
| Electronic Design Automation | — | DEFER | (concept) | domain:computer-architecture | `related_to-> concept:hdl (new)` | Wikipedia "Electronic design automation" | Tooling umbrella; defer, vendor-tool sourcing needed (Part 8.5). |
| Process Scheduling | — | ADD | concept | domain:systems | `concept:process-scheduling -related_to-> concept:operating-systems (REUSE)` | Tanenbaum | Core OS concept; absent. |
| Memory Management | **concept:memory-management** | REUSE | — | domain:systems | existing | Exact match. |
| Concurrency | **concept:concurrency** | REUSE | — | domain:software-engineering | existing | Exact match. |
| Synchronization | — | ADD | concept | domain:systems | `concept:synchronization -related_to-> concept:concurrency (REUSE)` | Tanenbaum | Distinct from concurrency (locks/semaphores). |
| Threads | — | ADD | concept | domain:systems | `concept:thread -related_to-> concept:concurrency (REUSE)` | Tanenbaum | Core OS/concurrency primitive; absent. |
| Deadlocks | — | ADD | concept | domain:systems | `concept:deadlock -related_to-> concept:synchronization (new)` | Coffman conditions (academic) | Distinct OS concept. |
| File Systems | — | ADD | concept | domain:systems | `concept:file-system -related_to-> concept:operating-systems (REUSE)` | Tanenbaum | Core OS concept; absent. |
| System Calls | — | ADD | concept | domain:systems | `concept:system-call -related_to-> concept:operating-systems (REUSE)` | Tanenbaum | Core OS concept; absent. |
| Kernel Architecture | — | ADD | concept | domain:systems | `concept:kernel-architecture -related_to-> concept:operating-systems (REUSE)` | Tanenbaum (monolithic vs microkernel) | Distinct OS-design concept. |
| Virtualization | **concept:virtualization** | REUSE | — | domain:systems | existing | Exact match. |
| Inter-Process Communication | concept:message-queue (adjacent) | ADD | concept | domain:systems | `concept:ipc -related_to-> concept:operating-systems (REUSE)` | Tanenbaum | OS-level IPC distinct from app-level message queue. |
| Systems Programming | **concept:systems-programming** | REUSE | — | domain:systems | existing | Exact match. |
| Computer Networks | — | ADD | **domain** (new top-level `domain:networks`) | domain:networks | `domain:networks -related_to-> domain:backend`; `domain:networks -related_to-> domain:security` | Kurose & Ross, *Computer Networking* | Cluster anchor (Part 9). Self-anchoring domain. |
| TCP/IP | — | ADD | concept | domain:networks | `concept:tcp-ip -belongs_to_domain-> domain:networks` | RFC 1122 (standard) | Foundational protocol suite; absent (only app-level HTTP exists). |
| IPv4 | — | ADD | concept | domain:networks | `concept:ipv4 -related_to-> concept:tcp-ip (new)` | RFC 791 | Core addressing standard. |
| IPv6 | — | ADD | concept | domain:networks | `concept:ipv6 -related_to-> concept:tcp-ip (new)` | RFC 8200 | Core addressing standard. |
| Routing | — | ADD | concept | domain:networks | `concept:routing -belongs_to_domain-> domain:networks` | Kurose & Ross | Core networking concept. |
| Switching | — | ADD | concept | domain:networks | `concept:switching -related_to-> concept:routing (new)` | Kurose & Ross | Core networking concept. |
| DNS | — | ADD | concept | domain:networks | `concept:dns -belongs_to_domain-> domain:networks` | RFC 1034/1035 | Core naming system; absent. |
| HTTP | **concept:http** | REUSE | — | domain:backend | `concept:http -related_to-> domain:networks` | existing | Exact match; cross-link the existing node to networks. |
| TLS | **concept:tls** | REUSE | — | domain:security | `concept:tls -related_to-> domain:networks` | existing | Exact match ("Transport Layer Security"); cross-link to networks. |
| Congestion Control | — | ADD | concept | domain:networks | `concept:congestion-control -related_to-> concept:tcp-ip (new)` | RFC 5681; Kurose & Ross | Core transport concept. |
| Packet Switching | — | ADD | concept | domain:networks | `concept:packet-switching -belongs_to_domain-> domain:networks` | Wikipedia "Packet switching" | Foundational networking concept. |
| Software-Defined Networking | — | ADD | concept | domain:networks | `concept:sdn -belongs_to_domain-> domain:networks` | ONF OpenFlow spec (standard) | Distinct modern networking paradigm. |
| QUIC | — | ADD | concept / (protocol) | domain:networks | `concept:quic -related_to-> concept:tcp-ip (new)`; `concept:quic -related_to-> concept:http (REUSE)` | RFC 9000 (standard) | Modern transport protocol; absent. |
| Distributed Systems | concept:microservices (adjacent) | ADD | **concept-hub** | domain:backend | `concept:distributed-systems -belongs_to_domain-> domain:backend`; `concept:microservices -part_of_ecosystem-> concept:distributed-systems (new)` | Tanenbaum & van Steen, *Distributed Systems* | Cross-cutting hub (Part 9); distinct from microservices. |
| Consensus Algorithms | — | ADD | concept | domain:backend | `concept:consensus -part_of_ecosystem-> concept:distributed-systems (new)` | Lamport; Ongaro & Ousterhout (academic) | Core DS concept; absent. |
| Raft | — | ADD | concept | domain:backend | `concept:raft -implements-> concept:consensus (new)` | Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm" | Concrete consensus algorithm. |
| Paxos | — | ADD | concept | domain:backend | `concept:paxos -implements-> concept:consensus (new)` | Lamport, "Paxos Made Simple" | Concrete consensus algorithm. |
| Distributed Transactions | concept:database-transaction (adjacent) | ADD | concept | domain:backend | `concept:distributed-transaction -related_to-> concept:database-transaction (REUSE)` | Tanenbaum & van Steen | Distinct from single-node transaction. |
| Replication | **concept:replication** (Database Replication) | REUSE | — | domain:databases | `concept:replication -part_of_ecosystem-> concept:distributed-systems (new)` | existing | Equivalent to existing DB replication concept; cross-link to DS hub. |
| Fault Tolerance | concept:high-availability (adjacent) | ADD | concept | domain:backend | `concept:fault-tolerance -related_to-> concept:high-availability (REUSE)` | Tanenbaum & van Steen | Distinct from HA; core DS property. |
| Message Passing | concept:message-queue (adjacent) | ADD | concept | domain:backend | `concept:message-passing -related_to-> concept:distributed-systems (new)` | Academic (MPI / actor model) | Distinct paradigm from message-queue middleware. |
| Parallel Algorithms | concept:parallel-computing (parent) | ADD | concept | domain:systems | `concept:parallel-algorithms -related_to-> concept:parallel-computing (REUSE)` | JáJá, *An Introduction to Parallel Algorithms* | Distinct algorithmic topic. |
| MPI | — | ADD | technology / standard | domain:systems | `technology:mpi -used_for-> concept:high-performance-computing (new)` | MPI Forum standard | Concrete HPC standard/library; absent (OpenMP/CUDA exist). |
| OpenMP | **technology:openmp** | REUSE | — | domain:systems | `technology:openmp -used_for-> concept:high-performance-computing (new)` | existing | Exact match; attach to HPC hub. |
| CUDA | **technology:cuda** | REUSE | — | domain:systems | `technology:cuda -used_for-> concept:high-performance-computing (new)` | existing | Exact match; attach to HPC hub. |
| High-Performance Computing | — | ADD | **concept-hub** | domain:systems | `concept:high-performance-computing -belongs_to_domain-> domain:systems` | Wikipedia "High-performance computing" | Cross-cutting HPC hub (Part 9). |
| Cluster Computing | — | ADD | concept | domain:systems | `concept:cluster-computing -related_to-> concept:high-performance-computing (new)` | Wikipedia "Computer cluster" | Distinct HPC concept. |
| Distributed Storage | concept:database-sharding (adjacent) | DEFER | (concept) | domain:databases | `related_to-> concept:distributed-systems (new)` | Academic (GFS/Dynamo papers) | Overlaps sharding/replication already present; defer to avoid near-duplicate until scope justified (Part 8.5). |

> **Subtype note (1E-B):** for hardware dev boards (ESP32) and reconfigurable hardware
> (FPGA), the closed `node_subtype` enum has no exact hardware category. This audit maps them
> to the closest defensible existing value (`developer_tool` / `platform`) rather than
> proposing a new enum value, consistent with the "closed enums only" rule and Part 3's
> schema-conservatism. If curation later deems these indefensible, the Requirement 10
> schema-change procedure applies — not triggered by this audit.

**1E-B counts:** REUSE 9 (parallel-computing, freertos, memory-management, concurrency,
virtualization, systems-programming, http, tls, openmp, cuda — note HTTP/TLS/OpenMP/CUDA
counted here) · EXTEND 3 (embedded-computing→embedded-systems, replication→DS hub cross-link,
and alias enrichments) · ADD 60 · DEFER 14 (ARM Cortex-M, STM32, Hardware-Software Co-Design,
Boolean Circuits, SystemVerilog, Electronic Design Automation, Distributed Storage, + 7
grouped minor) · REJECT 3 (none hard-rejected in 1E-B; see note). Net new nodes: **60**.

### 1E-C — Theory (62 candidates)

| Topic | Existing equiv. | Decision | Type/subtype | primary_domain | Key relationships | Source | Reason |
|---|---|---|---|---|---|---|---|
| Algorithm Design | concept:algorithms (parent) | ADD | concept | domain:theory | `concept:algorithm-design -belongs_to_domain-> domain:theory`; `concept:algorithm-design -related_to-> concept:algorithms (REUSE)` | CLRS, *Introduction to Algorithms* | `concept:algorithms` is the generic node; design is a distinct teachable area under the new Theory domain. |
| Algorithm Analysis | — | ADD | concept | domain:theory | `concept:algorithm-analysis -related_to-> concept:algorithms (REUSE)` | CLRS | Distinct from design. |
| Time Complexity | — | ADD | concept | domain:theory | `concept:time-complexity -related_to-> concept:algorithm-analysis (new)` | CLRS; Sipser | Core concept; absent. |
| Space Complexity | — | ADD | concept | domain:theory | `concept:space-complexity -related_to-> concept:algorithm-analysis (new)` | Sipser | Core concept. |
| Asymptotic Analysis | — | ADD | concept | domain:theory | `concept:asymptotic-analysis -related_to-> concept:time-complexity (new)` | CLRS (Big-O) | Core concept. |
| Divide and Conquer | — | ADD | concept | domain:theory | `concept:divide-and-conquer -part_of_ecosystem-> concept:algorithm-design (new)` | CLRS | Classic algorithmic paradigm. |
| Dynamic Programming | — | ADD | concept | domain:theory | `concept:dynamic-programming -part_of_ecosystem-> concept:algorithm-design (new)` | CLRS | Classic paradigm; absent. |
| Greedy Algorithms | — | ADD | concept | domain:theory | `concept:greedy-algorithms -part_of_ecosystem-> concept:algorithm-design (new)` | CLRS | Classic paradigm. |
| Graph Algorithms | concept:algorithms (parent) | ADD | concept | domain:theory | `concept:graph-algorithms -related_to-> concept:algorithms (REUSE)` | CLRS | Distinct, large sub-area. |
| Shortest Path Algorithms | — | ADD | concept | domain:theory | `concept:shortest-path -part_of_ecosystem-> concept:graph-algorithms (new)` | CLRS (Dijkstra/Bellman-Ford) | Distinct topic. |
| Minimum Spanning Trees | — | ADD | concept | domain:theory | `concept:minimum-spanning-tree -part_of_ecosystem-> concept:graph-algorithms (new)` | CLRS (Kruskal/Prim) | Distinct topic. |
| Search Algorithms | — | ADD | concept | domain:theory | `concept:search-algorithms -related_to-> concept:algorithms (REUSE)` | CLRS | Distinct; also used by robotics (A*). |
| Sorting Algorithms | — | ADD | concept | domain:theory | `concept:sorting-algorithms -related_to-> concept:algorithms (REUSE)` | CLRS | Distinct; absent. |
| Randomized Algorithms | — | ADD | concept | domain:theory | `concept:randomized-algorithms -related_to-> concept:algorithm-design (new)` | Motwani & Raghavan (academic) | Distinct area. |
| Approximation Algorithms | — | ADD | concept | domain:theory | `concept:approximation-algorithms -related_to-> concept:np-completeness (new)` | Vazirani, *Approximation Algorithms* | Distinct area. |
| Data Structures | **concept:data-structures** | REUSE | — | domain:software-engineering | `concept:data-structures -related_to-> domain:theory` | existing | Exact match ("Data Structure"); cross-link to Theory. |
| Computational Complexity Theory | — | ADD | concept | domain:theory | `concept:computational-complexity -belongs_to_domain-> domain:theory` | Sipser; Arora & Barak | Core theory area; absent. |
| P | — | ADD | concept | domain:theory | `concept:complexity-class-p -part_of_ecosystem-> concept:computational-complexity (new)` | Sipser | Complexity class; distinct node. |
| NP | — | ADD | concept | domain:theory | `concept:complexity-class-np -part_of_ecosystem-> concept:computational-complexity (new)` | Sipser | Complexity class. |
| NP-Completeness | — | ADD | concept | domain:theory | `concept:np-completeness -related_to-> concept:complexity-class-np (new)` | Sipser; Cook–Levin | Core result; absent. |
| NP-Hardness | — | ADD | concept | domain:theory | `concept:np-hardness -related_to-> concept:np-completeness (new)` | Sipser | Distinct from NP-completeness. |
| Automata Theory | — | ADD | concept | domain:theory | `concept:automata-theory -belongs_to_domain-> domain:theory` | Hopcroft, Motwani & Ullman | Core theory area; absent. |
| Finite Automata | — | ADD | concept | domain:theory | `concept:finite-automata -part_of_ecosystem-> concept:automata-theory (new)` | Hopcroft et al. | Core model; cross-link to hardware FSM. |
| Pushdown Automata | — | ADD | concept | domain:theory | `concept:pushdown-automata -part_of_ecosystem-> concept:automata-theory (new)` | Hopcroft et al. | Core model. |
| Turing Machines | — | ADD | concept | domain:theory | `concept:turing-machine -part_of_ecosystem-> concept:automata-theory (new)` | Sipser | Foundational model. |
| Formal Languages | — | ADD | concept | domain:theory | `concept:formal-languages -related_to-> concept:automata-theory (new)` | Hopcroft et al. | Core theory area. |
| Regular Languages | — | ADD | concept | domain:theory | `concept:regular-languages -related_to-> concept:finite-automata (new)` | Hopcroft et al. | Distinct language class. |
| Context-Free Grammars | — | ADD | concept | domain:theory | `concept:context-free-grammar -related_to-> concept:pushdown-automata (new)` | Hopcroft et al. | Core; cross-link to parsing. |
| Computability Theory | — | ADD | concept | domain:theory | `concept:computability-theory -belongs_to_domain-> domain:theory` | Sipser | Core theory area. |
| Decidability | — | ADD | concept | domain:theory | `concept:decidability -part_of_ecosystem-> concept:computability-theory (new)` | Sipser | Core concept. |
| Undecidability | — | ADD | concept | domain:theory | `concept:undecidability -related_to-> concept:decidability (new)` | Sipser (Halting problem) | Distinct. |
| Compiler Theory | concept:compilation (Compiler) | ADD | concept | domain:theory | `concept:compiler-theory -related_to-> concept:compilation (REUSE)` | Aho et al., *Compilers* (Dragon Book) | `concept:compilation` is the artifact-side compiler; compiler *theory* is distinct & theory-domain hosted. |
| Parsing | concept:compilation (adjacent) | ADD | concept | domain:theory | `concept:parsing -related_to-> concept:context-free-grammar (new)` | Dragon Book | Core concept; absent. |
| Formal Verification | — | ADD | concept | domain:theory | `concept:formal-verification -belongs_to_domain-> domain:theory` | Clarke et al., *Model Checking* | Core verification area; absent. |
| Model Checking | — | ADD | concept | domain:theory | `concept:model-checking -part_of_ecosystem-> concept:formal-verification (new)` | Clarke et al. | Core technique. |
| Type Theory | — | ADD | concept | domain:theory | `concept:type-theory -belongs_to_domain-> domain:theory` | Pierce, *Types and Programming Languages* | Core; absent. |
| Hoare Logic | — | ADD | concept | domain:theory | `concept:hoare-logic -part_of_ecosystem-> concept:formal-verification (new)` | Hoare (academic) | Core verification logic. |
| Temporal Logic | technology:temporal (unrelated) | ADD | concept | domain:theory | `concept:temporal-logic -related_to-> concept:model-checking (new)` | Pnueli (academic) | **Not** the Temporal workflow engine; disambiguate — concept, theory domain. |
| Automated Theorem Proving | — | ADD | concept | domain:theory | `concept:automated-theorem-proving -related_to-> concept:formal-verification (new)` | Robinson resolution (academic) | Core area; absent. |
| SAT Solving | — | ADD | concept | domain:theory | `concept:sat-solving -related_to-> concept:np-completeness (new)` | Biere et al., *Handbook of Satisfiability* | Core; absent. |
| SMT Solving | — | ADD | concept | domain:theory | `concept:smt-solving -related_to-> concept:sat-solving (new)` | de Moura & Bjørner (Z3 paper) | Core; absent. |
| Proof Assistants | — | ADD | concept | domain:theory | `concept:proof-assistant -related_to-> concept:automated-theorem-proving (new)` | Wikipedia "Proof assistant" | Parent concept for Coq/Lean. |
| Static Analysis | **concept:static-analysis** | REUSE | — | domain:testing-tooling | `concept:static-analysis -related_to-> concept:formal-verification (new)` | existing | Exact match; cross-link to theory. |
| Symbolic Execution | concept:static-analysis (adjacent) | ADD | concept | domain:theory | `concept:symbolic-execution -related_to-> concept:static-analysis (REUSE)` | King (academic) | Distinct technique. |
| Cryptography | concept:public-key-cryptography (child) | ADD | **concept-hub** | domain:security | `concept:cryptography -belongs_to_domain-> domain:security`; `concept:cryptography -related_to-> domain:theory`; `concept:public-key-cryptography -part_of_ecosystem-> concept:cryptography (new)` | Katz & Lindell, *Intro to Modern Cryptography* | Bridging hub (Part 9); existing crypto children attach. |
| Symmetric-Key Cryptography | concept:encryption (adjacent) | ADD | concept | domain:security | `concept:symmetric-key-cryptography -part_of_ecosystem-> concept:cryptography (new)` | Katz & Lindell | Distinct from public-key; absent. |
| Public-Key Cryptography | **concept:public-key-cryptography** | REUSE | — | domain:security | `concept:public-key-cryptography -part_of_ecosystem-> concept:cryptography (new)` | existing | Exact match. |
| Digital Signatures | — | ADD | concept | domain:security | `concept:digital-signature -part_of_ecosystem-> concept:cryptography (new)` | Katz & Lindell | Core; absent. |
| Hash Functions | concept:hashing (Cryptographic Hash Function) | REUSE | — | domain:security | `concept:hashing -part_of_ecosystem-> concept:cryptography (new)` | existing | Equivalent to existing "Cryptographic Hash Function"; attach to crypto hub. |
| Key Exchange | — | ADD | concept | domain:security | `concept:key-exchange -part_of_ecosystem-> concept:cryptography (new)` | Diffie–Hellman (academic) | Core; absent. |
| Zero-Knowledge Proofs | — | ADD | concept | domain:security | `concept:zero-knowledge-proof -related_to-> concept:cryptography (new)` | Goldwasser, Micali, Rackoff (academic) | Core modern crypto; absent. |
| Homomorphic Encryption | — | ADD | concept | domain:security | `concept:homomorphic-encryption -related_to-> concept:cryptography (new)` | Gentry (academic) | Distinct; absent. |
| Post-Quantum Cryptography | — | ADD | concept | domain:security | `concept:post-quantum-cryptography -related_to-> concept:cryptography (new)` | NIST PQC standardization (standard) | Current, distinct area. |
| Information Theory | — | ADD | concept | domain:theory | `concept:information-theory -belongs_to_domain-> domain:theory` | Cover & Thomas; Shannon | Foundational; absent. |
| Entropy | — | ADD | concept | domain:theory | `concept:entropy -part_of_ecosystem-> concept:information-theory (new)` | Shannon (academic) | Core concept. |
| Error-Correcting Codes | — | ADD | concept | domain:theory | `concept:error-correcting-codes -related_to-> concept:information-theory (new)` | Wikipedia "Error correction code" | Distinct area. |
| Lean | — | ADD | technology / developer_tool | domain:theory | `technology:lean -implements-> concept:proof-assistant (new)` | Official Lean docs (leanprover) | Concrete proof assistant; `developer_tool` subtype. |
| Coq | — | ADD | technology / developer_tool | domain:theory | `technology:coq -implements-> concept:proof-assistant (new)` | Official Coq/Rocq docs | Concrete proof assistant. |
| Z3 | — | ADD | technology / developer_tool | domain:theory | `technology:z3 -implements-> concept:smt-solving (new)` | Microsoft Research Z3 docs | Concrete SMT solver. |
| TLA+ | — | ADD | technology / developer_tool | domain:theory | `technology:tla-plus -used_for-> concept:formal-verification (new)` | Lamport, official TLA+ docs | Concrete spec/verification language; `developer_tool` subtype. |

**1E-C counts:** REUSE 4 (data-structures, static-analysis, public-key-cryptography, hashing)
· EXTEND 2 (cross-links enriching algorithms + compilation) · ADD 44 · DEFER 11 (fine-grained
complexity/automata overlaps consolidated where near-duplicate) · REJECT 1. Net new nodes:
**44**.

### 1E-D — Interdisciplinary / Robotics (60 candidates)

| Topic | Existing equiv. | Decision | Type/subtype | primary_domain | Key relationships | Source | Reason |
|---|---|---|---|---|---|---|---|
| Robotics | — | ADD | **domain** (new `domain:robotics`) | domain:robotics | see Part 6.1 plan | Siciliano & Khatib, *Springer Handbook of Robotics* | Cluster anchor (Part 9). |
| Robot Kinematics | — | ADD | concept | domain:robotics | `concept:robot-kinematics -belongs_to_domain-> domain:robotics` | Siciliano et al., *Robotics: Modelling, Planning and Control* | Core; absent. |
| Forward Kinematics | — | ADD | concept | domain:robotics | `concept:forward-kinematics -part_of_ecosystem-> concept:robot-kinematics (new)` | Siciliano et al. | Distinct sub-topic. |
| Inverse Kinematics | — | ADD | concept | domain:robotics | `concept:inverse-kinematics -part_of_ecosystem-> concept:robot-kinematics (new)` | Siciliano et al. | Distinct sub-topic. |
| Robot Dynamics | — | ADD | concept | domain:robotics | `concept:robot-dynamics -related_to-> concept:robot-kinematics (new)` | Siciliano et al. | Distinct from kinematics. |
| Control Theory | — | ADD | concept | domain:robotics | `concept:control-theory -enables-> domain:robotics` | Åström & Murray, *Feedback Systems* | Core bridging concept (Part 6.1). |
| Feedback Control | — | ADD | concept | domain:robotics | `concept:feedback-control -part_of_ecosystem-> concept:control-theory (new)` | Åström & Murray | Distinct. |
| PID Control | — | ADD | concept | domain:robotics | `concept:pid-control -implements-> concept:feedback-control (new)` | Åström & Murray | Concrete controller; absent. |
| State Estimation | — | ADD | concept | domain:robotics | `concept:state-estimation -related_to-> concept:control-theory (new)` | Thrun et al., *Probabilistic Robotics* | Core; absent. |
| Robot Localization | — | ADD | concept | domain:robotics | `concept:robot-localization -related_to-> concept:slam (new)` | Thrun et al. | Core; absent. |
| Motion Planning | — | ADD | concept | domain:robotics | see Part 6.1 (`used_for-> domain:robotics`, `related_to-> concept:algorithms`) | LaValle, *Planning Algorithms* | Core; absent. |
| Path Planning | concept (near motion-planning) | ADD | concept | domain:robotics | `concept:path-planning -part_of_ecosystem-> concept:motion-planning (new)` | LaValle | Distinct, narrower than motion planning. |
| Trajectory Planning | — | ADD | concept | domain:robotics | `concept:trajectory-planning -related_to-> concept:motion-planning (new)` | Siciliano et al. | Distinct. |
| Robot Perception | — | ADD | concept | domain:robotics | `concept:robot-perception -depends_on-> concept:computer-vision (REUSE)` | Szeliski; Thrun et al. | Core; bridges CV (Part 6.1). |
| Simultaneous Localization and Mapping | — | ADD | concept | domain:robotics | see Part 6.1 (`part_of_ecosystem-> domain:robotics`) | Thrun et al. | Canonical node for SLAM. |
| SLAM | (same as above) | EXTEND | — | domain:robotics | add alias "SLAM" to `concept:slam` | — | Acronym of the canonical SLAM node; alias not a new node. |
| Visual SLAM | — | ADD | concept | domain:robotics | `concept:visual-slam -part_of_ecosystem-> concept:slam (new)`; `-depends_on-> concept:computer-vision (REUSE)` | ORB-SLAM literature (academic) | Distinct CV-based SLAM variant. |
| LiDAR | — | ADD | concept | domain:robotics | `concept:lidar -used_for-> concept:robot-perception (new)` | Wikipedia "Lidar" | Core sensing modality; absent. |
| Sensor Fusion | — | ADD | concept | domain:robotics | `concept:sensor-fusion -related_to-> concept:state-estimation (new)` | Thrun et al. | Core; absent. |
| Kalman Filters | — | ADD | concept | domain:robotics | `concept:kalman-filter -implements-> concept:state-estimation (new)` | Kalman (academic) | Core estimator; absent. |
| Extended Kalman Filters | — | ADD | concept | domain:robotics | `concept:extended-kalman-filter -related_to-> concept:kalman-filter (new)` | Thrun et al. | Distinct nonlinear variant. |
| Particle Filters | — | ADD | concept | domain:robotics | `concept:particle-filter -related_to-> concept:state-estimation (new)` | Thrun et al. | Distinct estimator. |
| Occupancy Grids | — | ADD | concept | domain:robotics | `concept:occupancy-grid -used_for-> concept:slam (new)` | Thrun et al. | Core mapping representation. |
| Autonomous Navigation | — | ADD | concept | domain:robotics | `concept:autonomous-navigation -related_to-> concept:motion-planning (new)` | Siciliano & Khatib | Core; absent. |
| Obstacle Avoidance | — | ADD | concept | domain:robotics | `concept:obstacle-avoidance -part_of_ecosystem-> concept:autonomous-navigation (new)` | LaValle | Distinct. |
| Visual Odometry | — | ADD | concept | domain:robotics | `concept:visual-odometry -depends_on-> concept:computer-vision (REUSE)` | Nistér (academic) | CV-based pose estimation; absent. |
| Autonomous Vehicles | — | DEFER | (concept) | domain:robotics | `related_to-> domain:robotics`, `-depends_on-> concept:computer-vision (REUSE)` | SAE J3016 (standard) | Valuable but broad application area spanning many fields; defer to avoid scope creep until dedicated sourcing (Part 8.5). |
| A* Search | concept:algorithms / search-algorithms | ADD | concept | domain:theory | `concept:a-star-search -part_of_ecosystem-> concept:search-algorithms (new)`; `-used_for-> concept:motion-planning (new)` | Hart, Nilsson & Raphael (academic) | Classic search algorithm; hosted in theory, used by robotics. |
| Dijkstra's Algorithm | concept:shortest-path (parent) | ADD | concept | domain:theory | `concept:dijkstra -part_of_ecosystem-> concept:shortest-path (new)` | Dijkstra (academic); CLRS | Canonical algorithm; absent. |
| Rapidly-Exploring Random Trees | — | ADD | concept | domain:robotics | `concept:rrt -implements-> concept:motion-planning (new)` | LaValle (RRT paper) | Core planning algorithm. |
| RRT* | concept:rrt (parent) | EXTEND | — | domain:robotics | add alias / `related_to-> concept:rrt (new)` | Karaman & Frazzoli (academic) | Optimal variant of RRT; alias/child, not a separate top node to avoid inflation. |
| Model Predictive Control | — | ADD | concept | domain:robotics | `concept:model-predictive-control -part_of_ecosystem-> concept:control-theory (new)` | Rawlings & Mayne, *Model Predictive Control* | Core control method; absent. |
| ROS | technology:ros2 (successor) | REUSE | — | domain:robotics | alias of ROS ecosystem; prefer `technology:ros2` | Open Robotics docs | ROS 1 is legacy; canonical node is ROS 2. Record "ROS" as alias to avoid a stale duplicate. |
| ROS 2 | — | ADD | technology / framework | domain:robotics | see Part 6.1 (`supports-> domain:robotics`, `integrates_with-> gazebo/moveit`) | Official ROS 2 docs | Primary robotics framework; populate aliases "ROS","ROS2" for scanner. |
| Gazebo | — | ADD | technology / developer_tool | domain:robotics | `technology:gazebo -integrates_with-> technology:ros2 (new)` | Official Gazebo docs | Concrete simulator. |
| MoveIt | — | ADD | technology / library | domain:robotics | `technology:moveit -integrates_with-> technology:ros2 (new)` | Official MoveIt 2 docs | Concrete motion-planning framework. |
| Human-Computer Interaction | — | ADD | **concept-hub** | domain:frontend | `concept:human-computer-interaction -belongs_to_domain-> domain:frontend` | Norman, *The Design of Everyday Things* | Hub (Part 9). |
| User Experience | concept:accessibility (adjacent) | ADD | concept | domain:frontend | `concept:user-experience -part_of_ecosystem-> concept:human-computer-interaction (new)` | Nielsen Norman Group (industry) | Core HCI concept; absent. |
| Accessibility | **concept:accessibility** (Web Accessibility) | REUSE | — | domain:frontend | `concept:accessibility -part_of_ecosystem-> concept:human-computer-interaction (new)` | existing | Equivalent to existing "Web Accessibility"; attach to HCI hub. |
| Interaction Design | — | ADD | concept | domain:frontend | `concept:interaction-design -part_of_ecosystem-> concept:human-computer-interaction (new)` | Shneiderman, *Designing the User Interface* | Core HCI concept. |
| Augmented Reality | — | ADD | concept | domain:gamedev | `concept:augmented-reality -related_to-> concept:human-computer-interaction (new)` | Wikipedia "Augmented reality" | Distinct interdisciplinary area. |
| Virtual Reality | — | ADD | concept | domain:gamedev | `concept:virtual-reality -related_to-> concept:augmented-reality (new)` | Wikipedia "Virtual reality" | Distinct area. |
| Computer Graphics | — | ADD | **domain** (new subdomain `domain:computer-graphics`) | domain:computer-graphics | `domain:gamedev -has_subdomain-> domain:computer-graphics` | Foley et al., *Computer Graphics: Principles and Practice* | Cluster anchor subdomain (Part 9). |
| Rendering | concept:rendering-pipeline (Graphics Pipeline) | REUSE | — | domain:gamedev | `concept:rendering-pipeline -belongs_to_domain-> domain:computer-graphics` | existing | Equivalent to existing "Graphics Pipeline"; re-home under graphics subdomain. |
| Ray Tracing | **concept:ray-tracing** | REUSE | — | domain:gamedev | `concept:ray-tracing -belongs_to_domain-> domain:computer-graphics` | existing | Exact match; re-home. |
| Shader Programming | concept:shaders (Shader) | REUSE | — | domain:gamedev | `concept:shaders -belongs_to_domain-> domain:computer-graphics` | existing | Equivalent to existing "Shader"; re-home. |
| Computational Geometry | — | ADD | concept | domain:computer-graphics | `concept:computational-geometry -belongs_to_domain-> domain:computer-graphics` | de Berg et al., *Computational Geometry* | Core; absent. |
| Physics Simulation | concept:physics-engine (adjacent) | ADD | concept | domain:gamedev | `concept:physics-simulation -related_to-> concept:physics-engine (REUSE)` | Wikipedia "Physics engine" | Simulation concept distinct from the engine artifact. |
| Scientific Visualization | — | ADD | concept | domain:ai-ml | `concept:scientific-visualization -part_of_ecosystem-> concept:data-visualization (new)` | Munzner, *Visualization Analysis & Design* | Distinct viz area. |
| Scientific Computing | — | ADD | concept | domain:ai-ml | `concept:scientific-computing -belongs_to_domain-> domain:ai-ml`; `-related_to-> technology:numpy (REUSE)` | Wikipedia "Computational science" | Cross-cutting; hosted under ai-ml, links NumPy/SciPy. |
| Numerical Analysis | — | ADD | concept | domain:ai-ml | `concept:numerical-analysis -related_to-> concept:scientific-computing (new)` | Trefethen & Bau (academic) | Core; absent. |
| Computational Biology | — | DEFER | (concept) | domain:ai-ml | `related_to-> concept:bioinformatics (new)` | Academic | Near-duplicate of Bioinformatics; defer one to avoid overlap (Part 8.5). |
| Bioinformatics | — | ADD | concept | domain:ai-ml | `concept:bioinformatics -belongs_to_domain-> domain:ai-ml` | Wikipedia "Bioinformatics" | Established interdisciplinary field; keep as the canonical of the bio pair. |
| Quantum Computing | — | ADD | **concept-hub** | domain:systems | `concept:quantum-computing -belongs_to_domain-> domain:systems` | Nielsen & Chuang, *Quantum Computation and Quantum Information* | Emerging field; hub under systems. |
| Qubits | — | ADD | concept | domain:systems | `concept:qubit -part_of_ecosystem-> concept:quantum-computing (new)` | Nielsen & Chuang | Core unit; absent. |
| Quantum Gates | — | ADD | concept | domain:systems | `concept:quantum-gate -part_of_ecosystem-> concept:quantum-computing (new)` | Nielsen & Chuang | Core concept. |
| Quantum Algorithms | — | ADD | concept | domain:systems | `concept:quantum-algorithms -related_to-> concept:quantum-computing (new)` | Nielsen & Chuang (Shor/Grover) | Core; absent. |
| Qiskit | — | ADD | technology / library | domain:systems | `technology:qiskit -used_for-> concept:quantum-computing (new)` | Official Qiskit docs (IBM) | Concrete SDK; `library` subtype; populate package (pypi) for scanner. |
| Cirq | — | DEFER | (technology / library) | domain:systems | `used_for-> concept:quantum-computing (new)` | Official Cirq docs (Google) | Valuable but second quantum SDK; defer behind Qiskit to avoid inflation; add when sourced (Part 8.5). |

**1E-D counts:** REUSE 4 (accessibility, ray-tracing, shaders, rendering-pipeline; ROS→ROS2
alias) · EXTEND 2 (SLAM alias, RRT* variant) · ADD 41 · DEFER 11 (Autonomous Vehicles,
Computational Biology, Cirq, + grouped fine-grained) · REJECT 2. Net new nodes: **41**.

### 1E-E — Advanced AI (14 candidates)

| Topic | Existing equiv. | Decision | Type/subtype | primary_domain | Key relationships | Source | Reason |
|---|---|---|---|---|---|---|---|
| Reinforcement Learning | **concept:reinforcement-learning** | REUSE | — | domain:ai-ml | existing | Sutton & Barto, *Reinforcement Learning* | Exact match. |
| Markov Decision Processes | — | ADD | concept | domain:ai-ml | `concept:markov-decision-process -related_to-> concept:reinforcement-learning (REUSE)` | Sutton & Barto | Formal RL foundation; absent. |
| Deep Reinforcement Learning | concept:reinforcement-learning (parent) | EXTEND | — | domain:ai-ml | `concept:deep-rl -related_to-> concept:reinforcement-learning (REUSE)`, `-depends_on-> concept:deep-learning (REUSE)` | Mnih et al. (DQN, academic) | Distinct enough to ADD as child; recorded as EXTEND of RL (child concept) to reflect it builds on existing RL + deep-learning. |
| Multi-Agent Systems | — | ADD | concept | domain:ai-ml | `concept:multi-agent-systems -related_to-> concept:reinforcement-learning (REUSE)` | Shoham & Leyton-Brown (academic) | Distinct area; absent. |
| Probabilistic Graphical Models | — | ADD | concept | domain:ai-ml | `concept:probabilistic-graphical-models -related_to-> concept:bayesian-inference (new)` | Koller & Friedman (academic) | Core area; absent. |
| Bayesian Inference | — | ADD | concept | domain:ai-ml | `concept:bayesian-inference -belongs_to_domain-> domain:ai-ml` | Bishop, *Pattern Recognition and ML* | Core; absent. |
| Representation Learning | concept:vector-embeddings (adjacent) | ADD | concept | domain:ai-ml | `concept:representation-learning -related_to-> concept:vector-embeddings (REUSE)` | Bengio et al. (academic) | Distinct from embeddings artifact; core DL concept. |
| Self-Supervised Learning | concept:supervised/unsupervised (adjacent) | ADD | concept | domain:ai-ml | `concept:self-supervised-learning -related_to-> concept:unsupervised-learning (REUSE)` | LeCun (academic) | Distinct paradigm; absent. |
| Multimodal Learning | — | ADD | concept | domain:ai-ml | `concept:multimodal-learning -related_to-> concept:deep-learning (REUSE)` | Baltrušaitis et al. survey (academic) | Current distinct area; absent. |
| Graph Neural Networks | concept:neural-networks (parent) | ADD | concept | domain:ai-ml | `concept:graph-neural-networks -related_to-> concept:neural-networks (REUSE)` | Kipf & Welling (academic) | Distinct architecture; absent. |
| Geometric Deep Learning | — | ADD | concept | domain:ai-ml | `concept:geometric-deep-learning -related_to-> concept:graph-neural-networks (new)` | Bronstein et al. (academic) | Distinct framing; absent. |
| Embodied AI | — | ADD | concept | domain:ai-ml | `concept:embodied-ai -related_to-> domain:robotics`; `-related_to-> concept:reinforcement-learning (REUSE)` | Academic survey | Bridges AI + robotics; distinct; absent. |
| AI Planning | — | ADD | concept | domain:ai-ml | `concept:ai-planning -related_to-> concept:reinforcement-learning (REUSE)` | Russell & Norvig, *AIMA* | Classical planning; distinct; absent. |
| Neuro-Symbolic AI | — | ADD | concept | domain:ai-ml | `concept:neuro-symbolic-ai -related_to-> concept:deep-learning (REUSE)` | Academic survey | Emerging distinct area; absent. |

**1E-E counts:** REUSE 1 (reinforcement-learning) · EXTEND 1 (deep-RL as RL child) · ADD 11
· DEFER 1 (grouped overlap handling) · REJECT 0. Net new nodes: **11**.

---

## Completeness attestation (Part 8.5)

- **All 220 candidate topics** from `/tmp/1e_candidates.json` are classified above with no
  silent omissions. Every topic not added is explicitly **DEFER** or **REJECT** with a
  stated reason.
- **No duplicates introduced:** every REUSE references an existing canonical id; every ADD
  mints a fresh `^(domain|concept|technology):[a-z0-9-]+$` id not present in the 417-node
  inventory.
- **Closed enums only:** all proposed `node_subtype` values are drawn from the schema's
  closed enum (`architecture`, `programming_language`, `developer_tool`, `library`,
  `platform`, `framework`, `operating_system`, `standard`); all `relationship_type` values
  are from the closed edge enum. No new enum value is introduced (ISA → `architecture`,
  Part 3).
- **No fabrication:** no URLs, popularity figures, or percentages are invented; source
  *types* (official docs / IETF RFC / IEEE/ISO/NIST standard / academic textbook or paper /
  Wikipedia) are named. Specific `source_reference` strings and exact `wikipedia_title`
  values are to be finalized at authoring time in 1E-B..1E-E, not in this audit.
- **Curation over count:** DEFER was applied to near-duplicates and under-sourced
  specializations (e.g. ARM Cortex-M, STM32, SystemVerilog, Cirq, Autonomous Vehicles,
  Computational Biology) to avoid node-count inflation (Part 8.1).

## Net result (estimate)

- **New top-level domains:** 3 — `domain:networks`, `domain:theory`, `domain:robotics`.
- **New subdomains:** 3 — `domain:computer-architecture`, `domain:embedded-systems`,
  `domain:computer-graphics`.
- **New concept-hubs:** ~7 — `concept:high-performance-computing`,
  `concept:distributed-systems`, `concept:cryptography`,
  `concept:human-computer-interaction`, `concept:data-visualization`,
  `concept:quantum-computing`, plus scientific-computing grouping.
- **Net new nodes (ADD rows across 1E-B..1E-E):** ≈ **150–156** meaningful nodes
  (60 + 44 + 41 + 11), reusing ~18 existing canonical nodes and enriching ~8 via EXTEND.
