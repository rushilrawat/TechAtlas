#!/usr/bin/env python3
"""Connect under-linked core concepts and fill out Computer Engineering (Nov 2026 review).

The Nov 2026 review found 39 nodes with a single edge, many of them cornerstones
(Raft, Paxos, Deadlocks, Process Scheduling, TLA+, Z3...). Their detail panels showed
"Relationships (1)". This batch gives each of them at least three meaningful,
taxonomy-valid relationships, chosen from facts a textbook would state:

  - Consul, CockroachDB and Kafka (KRaft) replicate state with Raft.
  - TLA+ is built on the Temporal Logic of Actions and is used to model-check consensus.
  - Kruskal's/Prim's MST and Dijkstra's algorithm are greedy algorithms.
  - MPC solves a constrained (usually convex/QP) optimisation at each step.
  - Monte Carlo localisation is a particle filter; EKF-SLAM uses an extended Kalman filter.
  - MoveIt plans with OMPL (RRTConnect by default) and ships IK solvers.

It also backfills the `belongs_to_domain` spoke for nodes whose primary_domain had no
matching edge (132 nodes from the Phase 1E CS expansion), so a field's network on
hover and the domain's "contains" list include them.

And it fills out the thin Computer Engineering umbrella (5 leaf nodes) with the
electrical side of the field that its sub-domains do not cover.
"""
from __future__ import annotations

import json
from pathlib import Path

from _apply import apply_batch

CE = "domain:computer-engineering"
ROOT = Path(__file__).resolve().parent.parent.parent


def e(source, rel, target):
    return {"source": source, "target": target, "relationship_type": rel}


def c(slug, name, desc, domain=CE, **extra):
    node = {
        "id": f"concept:{slug}", "slug": slug, "name": name,
        "node_type": "concept", "primary_domain": domain,
        "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


def t(slug, name, subtype, desc, domain=CE, **extra):
    node = {
        "id": f"technology:{slug}", "slug": slug, "name": name,
        "node_type": "technology", "node_subtype": subtype,
        "primary_domain": domain, "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


R = "related_to"

THIN_EDGES = [
    # --- computer architecture ---
    e("concept:mimd", R, "concept:simd"),
    e("concept:mimd", R, "concept:multiprocessor-architecture"),
    e("concept:mimd", R, "concept:cluster-computing"),
    e("technology:mpi", "supports", "concept:mimd"),
    e("concept:finite-state-machine", R, "concept:finite-automata"),
    e("concept:flip-flop", "enables", "concept:finite-state-machine"),
    e("concept:finite-state-machine", R, "concept:register-transfer-level"),
    # --- embedded ---
    e("concept:bare-metal-programming", R, "concept:microcontroller"),
    e("concept:bare-metal-programming", R, "concept:interrupt-handling"),
    e("concept:bare-metal-programming", R, "concept:memory-mapped-io"),
    e("concept:bare-metal-programming", R, "concept:rtos"),
    e("concept:uart", R, "concept:spi"),
    e("concept:uart", R, "concept:i2c"),
    e("technology:esp32", "supports", "concept:uart"),
    e("technology:arduino", "supports", "concept:uart"),
    e("technology:freertos", "implements", "concept:real-time-scheduling"),
    e("technology:zephyr", "implements", "concept:real-time-scheduling"),
    e("concept:real-time-scheduling", R, "concept:process-scheduling"),
    # --- operating systems ---
    e("technology:linux", "implements", "concept:process-scheduling"),
    e("concept:process-scheduling", R, "concept:thread"),
    e("concept:deadlock", R, "concept:thread"),
    e("concept:deadlock", R, "concept:lock-free-data-structures"),
    e("concept:deadlock", R, "concept:distributed-transaction"),
    e("technology:linux", "implements", "concept:kernel-architecture"),
    e("concept:kernel-architecture", R, "concept:system-call"),
    e("concept:kernel-architecture", R, "concept:device-driver"),
    e("concept:ipc", R, "concept:kernel-architecture"),
    e("concept:ipc", R, "concept:system-call"),
    e("concept:ipc", R, "concept:synchronization"),
    e("concept:ipc", R, "concept:message-queue"),
    # --- networks ---
    e("concept:congestion-control", R, "concept:quic"),
    e("concept:congestion-control", R, "concept:packet-switching"),
    e("concept:congestion-control", R, "concept:feedback-control"),
    # --- distributed consensus ---
    e("technology:consul", "implements", "concept:raft"),
    e("technology:cockroachdb", "implements", "concept:raft"),
    e("technology:kafka", "implements", "concept:raft"),
    e("concept:raft", R, "concept:replication"),
    e("concept:raft", R, "concept:paxos"),
    e("concept:paxos", R, "concept:distributed-systems"),
    e("concept:paxos", R, "concept:replication"),
    e("concept:paxos", R, "concept:byzantine-fault-tolerance"),
    # --- algorithms and complexity ---
    e("concept:space-complexity", R, "concept:time-complexity"),
    e("concept:space-complexity", R, "concept:asymptotic-analysis"),
    e("concept:space-complexity", R, "concept:computational-complexity"),
    e("concept:greedy-algorithms", R, "concept:minimum-spanning-tree"),
    e("concept:greedy-algorithms", R, "concept:dijkstra"),
    e("concept:greedy-algorithms", R, "concept:dynamic-programming"),
    e("concept:minimum-spanning-tree", R, "concept:graph-theory"),
    e("concept:minimum-spanning-tree", R, "concept:approximation-algorithms"),
    e("concept:sorting-algorithms", R, "concept:divide-and-conquer"),
    e("concept:sorting-algorithms", R, "concept:time-complexity"),
    e("concept:sorting-algorithms", R, "concept:randomized-algorithms"),
    e("concept:complexity-class-p", R, "concept:complexity-class-np"),
    e("concept:complexity-class-p", R, "concept:time-complexity"),
    e("concept:complexity-class-p", R, "concept:turing-machine"),
    e("concept:np-hardness", R, "concept:complexity-class-np"),
    e("concept:np-hardness", R, "concept:approximation-algorithms"),
    e("concept:np-hardness", R, "concept:computational-complexity"),
    e("concept:dijkstra", R, "concept:a-star-search"),
    e("concept:dijkstra", R, "concept:routing"),
    e("concept:dijkstra", R, "concept:graph-algorithms"),
    # --- automata, computability, logic ---
    e("concept:regular-languages", R, "concept:formal-languages"),
    e("concept:regular-languages", R, "concept:context-free-grammar"),
    e("concept:regular-languages", R, "concept:string-matching"),
    e("concept:undecidability", R, "concept:turing-machine"),
    e("concept:undecidability", R, "concept:computability-theory"),
    e("concept:undecidability", R, "concept:formal-verification"),
    e("technology:tla-plus", "implements", "concept:temporal-logic"),
    e("concept:temporal-logic", R, "concept:formal-verification"),
    e("concept:temporal-logic", R, "concept:hardware-verification"),
    e("technology:tla-plus", "used_for", "concept:model-checking"),
    e("technology:tla-plus", "used_for", "concept:consensus"),
    e("technology:z3", "used_for", "concept:symbolic-execution"),
    e("technology:z3", "used_for", "concept:formal-verification"),
    e("technology:z3", "supports", "concept:sat-solving"),
    e("concept:error-correcting-codes", R, "concept:dram"),
    e("concept:error-correcting-codes", R, "concept:cellular-5g"),
    e("concept:error-correcting-codes", R, "concept:quantum-error-correction"),
    # --- cryptography ---
    e("concept:symmetric-key-cryptography", R, "concept:encryption"),
    e("concept:symmetric-key-cryptography", R, "concept:tls"),
    e("technology:openssl", "implements", "concept:symmetric-key-cryptography"),
    e("concept:key-exchange", R, "concept:symmetric-key-cryptography"),
    e("concept:key-exchange", R, "concept:public-key-cryptography"),
    e("concept:key-exchange", R, "concept:tls"),
    e("concept:key-exchange", R, "concept:post-quantum-cryptography"),
    # --- robotics ---
    e("concept:pid-control", R, "concept:control-theory"),
    e("concept:pid-control", R, "concept:model-predictive-control"),
    e("concept:pid-control", R, "concept:pwm"),
    e("concept:robot-localization", R, "concept:particle-filter"),
    e("concept:robot-localization", R, "concept:extended-kalman-filter"),
    e("concept:robot-localization", R, "concept:autonomous-navigation"),
    e("concept:trajectory-planning", R, "concept:robot-dynamics"),
    e("concept:trajectory-planning", R, "concept:model-predictive-control"),
    e("technology:moveit", "implements", "concept:trajectory-planning"),
    e("technology:moveit", "used_for", "concept:motion-planning"),
    e("technology:moveit", "supports", "concept:inverse-kinematics"),
    e("technology:moveit", "supports", "concept:rrt"),
    e("concept:extended-kalman-filter", R, "concept:sensor-fusion"),
    e("concept:extended-kalman-filter", R, "concept:slam"),
    e("concept:particle-filter", R, "concept:monte-carlo-methods"),
    e("concept:particle-filter", R, "concept:bayesian-inference"),
    e("concept:occupancy-grid", R, "concept:lidar"),
    e("concept:occupancy-grid", R, "concept:path-planning"),
    e("concept:occupancy-grid", R, "concept:obstacle-avoidance"),
    e("concept:obstacle-avoidance", R, "concept:path-planning"),
    e("concept:obstacle-avoidance", R, "concept:autonomous-vehicles"),
    e("concept:rrt", R, "concept:path-planning"),
    e("concept:rrt", R, "concept:randomized-algorithms"),
    e("concept:model-predictive-control", R, "concept:convex-optimization"),
    e("concept:model-predictive-control", R, "concept:autonomous-vehicles"),
    # --- AI ---
    e("concept:geometric-deep-learning", R, "concept:convolutional-neural-network"),
    e("concept:geometric-deep-learning", R, "concept:representation-learning"),
    e("concept:geometric-deep-learning", R, "concept:protein-structure-prediction"),
    e("concept:neuro-symbolic-ai", R, "concept:knowledge-graph"),
    e("concept:neuro-symbolic-ai", R, "concept:automated-theorem-proving"),
    e("concept:neuro-symbolic-ai", R, "concept:ai-planning"),
]

# Second pass: nodes that had a domain spoke plus only ONE typed relationship. The
# detail panel hides belongs_to_domain, so these also showed "Relationships (1)",
# including GraphQL, C#, Ruby, PHP, Azure and BGP.
ONE_LINK_EDGES = [
    e("technology:urql", "implements", "concept:graphql"),
    e("concept:graphql", R, "concept:rest-api"),
    e("concept:graphql", R, "concept:api-versioning"),
    e("technology:django", "supports", "concept:middleware"),
    e("technology:aspnet-core", "implements", "concept:middleware"),
    e("concept:middleware", R, "concept:http"),
    e("technology:mongodb", "supports", "concept:database-sharding"),
    e("concept:database-sharding", R, "concept:replication"),
    e("concept:database-sharding", R, "concept:distributed-systems"),
    e("technology:rust", "used_for", "concept:systems-programming"),
    e("technology:c", "used_for", "concept:systems-programming"),
    e("concept:systems-programming", R, "concept:memory-management"),
    e("concept:solid-principles", R, "concept:object-oriented-programming"),
    e("concept:solid-principles", R, "concept:design-patterns"),
    e("concept:solid-principles", R, "concept:dependency-injection"),
    e("concept:api-versioning", R, "concept:rest-api"),
    e("concept:api-versioning", R, "concept:semantic-versioning"),
    e("concept:api-versioning", R, "concept:api-gateway"),
    e("concept:cqrs", R, "concept:domain-driven-design"),
    e("concept:cqrs", R, "concept:event-driven-architecture"),
    e("technology:npm", "supports", "concept:semantic-versioning"),
    e("technology:cargo", "supports", "concept:semantic-versioning"),
    e("technology:sonarqube", "supports", "concept:technical-debt"),
    e("technology:sonarqube", "implements", "concept:static-analysis"),
    e("concept:technical-debt", R, "concept:software-architecture"),
    e("concept:quantum-superposition", R, "concept:quantum-entanglement"),
    e("concept:quantum-superposition", R, "concept:quantum-gate"),
    e("concept:grovers-algorithm", R, "concept:search-algorithms"),
    e("concept:grovers-algorithm", R, "concept:quantum-advantage"),
    e("concept:grovers-algorithm", R, "concept:quantum-superposition"),
    e("concept:quantum-advantage", R, "concept:shors-algorithm"),
    e("concept:quantum-advantage", R, "concept:quantum-computing"),
    e("concept:lorawan", R, "concept:zigbee"),
    e("concept:lorawan", R, "concept:industrial-iot"),
    e("concept:lorawan", R, "concept:precision-agriculture"),
    e("concept:texture-mapping", R, "concept:rasterization"),
    e("concept:texture-mapping", R, "concept:polygon-mesh"),
    e("technology:opengl", "supports", "concept:texture-mapping"),
    e("concept:bgp", R, "concept:tcp-ip"),
    e("concept:bgp", R, "concept:content-delivery-network"),
    e("concept:bgp", R, "concept:ipv4"),
    e("concept:wcag", R, "concept:design-systems"),
    e("concept:wcag", R, "concept:human-computer-interaction"),
    e("concept:wcag", R, "concept:user-centered-design"),
    e("technology:nextjs", "supports", "concept:internationalization"),
    e("technology:angular", "supports", "concept:internationalization"),
    e("concept:vector-processor", R, "concept:gpu-architecture"),
    e("concept:vector-processor", R, "concept:high-performance-computing"),
    e("technology:risc-v", "supports", "concept:vector-processor"),
    e("concept:karnaugh-map", R, "concept:combinational-logic"),
    e("concept:karnaugh-map", R, "concept:logic-synthesis"),
    e("concept:karnaugh-map", R, "concept:digital-logic"),
    e("concept:z-transform", R, "concept:fourier-transform"),
    e("concept:z-transform", R, "concept:digital-signal-processing"),
    e("concept:z-transform", R, "concept:control-theory"),
    e("concept:personas", R, "concept:user-centered-design"),
    e("concept:personas", R, "concept:interaction-design"),
    e("concept:personas", R, "concept:requirements-engineering"),
    e("concept:heuristic-evaluation", R, "concept:user-centered-design"),
    e("concept:heuristic-evaluation", R, "concept:ui-prototyping"),
    e("concept:heuristic-evaluation", R, "concept:interaction-design"),
    e("concept:systems-biology", R, "concept:gene-expression-analysis"),
    e("concept:systems-biology", R, "concept:bioinformatics"),
    e("concept:systems-biology", R, "concept:genomics"),
    e("concept:robo-advisor", R, "concept:algorithmic-trading"),
    e("concept:robo-advisor", R, "concept:risk-modeling"),
    e("concept:lstm", R, "concept:time-series-forecasting"),
    e("concept:lstm", R, "concept:speech-recognition"),
    e("concept:lstm", R, "concept:transformers"),
    e("concept:cvss", R, "concept:vulnerability-assessment"),
    e("concept:cvss", R, "concept:bug-bounty"),
    e("technology:nessus", "supports", "concept:cvss"),
    e("concept:google-dorking", R, "concept:reconnaissance"),
    e("concept:google-dorking", R, "technology:shodan"),
    e("technology:burp-suite", "used_for", "concept:ssrf"),
    e("technology:owasp-zap", "used_for", "concept:ssrf"),
    e("concept:ssrf", R, "concept:idor"),
    e("concept:return-oriented-programming", R, "concept:buffer-overflow"),
    e("concept:return-oriented-programming", R, "concept:exploit-development"),
    e("technology:pwntools", "supports", "concept:return-oriented-programming"),
    e("technology:sveltekit", "supports", "concept:server-side-rendering"),
    e("technology:sveltekit", "built_on", "technology:vite"),
    e("technology:sveltekit", "alternative_to", "technology:nextjs"),
    e("technology:remix", "supports", "concept:server-side-rendering"),
    e("technology:remix", "alternative_to", "technology:nextjs"),
    e("technology:nuxt", "supports", "concept:server-side-rendering"),
    e("technology:nuxt", "built_on", "technology:vite"),
    e("technology:nuxt", "alternative_to", "technology:nextjs"),
    e("technology:sass", "integrates_with", "technology:vite"),
    e("technology:sass", R, "concept:css-in-js"),
    e("technology:babel", "integrates_with", "technology:webpack"),
    e("technology:babel", "alternative_to", "technology:esbuild"),
    e("technology:dotnet-maui", "written_in", "technology:csharp"),
    e("technology:csharp", "alternative_to", "technology:java"),
    e("technology:unity", "commonly_used_with", "technology:csharp"),
    e("technology:ruby", "supports", "concept:metaprogramming"),
    e("technology:ruby", "alternative_to", "technology:python"),
    e("technology:php", "commonly_used_with", "technology:mysql"),
    e("technology:php", "used_for", "concept:server-side-rendering"),
    e("technology:laravel", "alternative_to", "technology:rails"),
    e("technology:laravel", "implements", "concept:orm"),
    e("technology:duckdb-dbt", "used_for", "concept:data-warehouse"),
    e("technology:duckdb-dbt", "integrates_with", "technology:snowflake"),
    e("technology:duckdb-dbt", "integrates_with", "technology:bigquery"),
    e("technology:dynamodb", "part_of_ecosystem", "technology:aws"),
    e("technology:dynamodb", "alternative_to", "technology:mongodb"),
    e("technology:jupyter", "used_for", "concept:scientific-computing"),
    e("technology:jupyter", "commonly_used_with", "technology:matplotlib"),
    e("technology:mlflow", "alternative_to", "technology:weights-biases"),
    e("technology:mlflow", "integrates_with", "technology:scikit-learn"),
    e("technology:stable-diffusion", "built_on", "technology:pytorch"),
    e("technology:stable-diffusion", R, "concept:generative-adversarial-network"),
    e("technology:onnx", "integrates_with", "technology:pytorch"),
    e("technology:onnx", "integrates_with", "technology:tensorflow"),
    e("technology:ray", "supports", "concept:reinforcement-learning"),
    e("technology:ray", "integrates_with", "technology:pytorch"),
    e("technology:ray", "integrates_with", "technology:kubernetes"),
    e("technology:weights-biases", "integrates_with", "technology:pytorch"),
    e("technology:azure", "alternative_to", "technology:gcp"),
    e("technology:azure", "implements", "concept:cloud-computing"),
    e("technology:ansible", "written_in", "technology:python"),
    e("technology:ansible", "commonly_used_with", "technology:terraform"),
    e("technology:gitlab-ci", "alternative_to", "technology:github-actions"),
    e("technology:gitlab-ci", "alternative_to", "technology:jenkins"),
    e("technology:vault", "integrates_with", "technology:kubernetes"),
    e("technology:vault", "integrates_with", "technology:consul"),
    e("technology:dotnet-maui", "implements", "concept:cross-platform-ui"),
    e("technology:dotnet-maui", "alternative_to", "technology:flutter"),
    e("technology:assembly", R, "concept:isa"),
    e("technology:assembly", "used_for", "concept:bare-metal-programming"),
    e("technology:assembly", R, "concept:disassembly"),
    e("technology:qemu", "written_in", "technology:c"),
    e("technology:qemu", "commonly_used_with", "technology:gdb"),
    e("technology:r-lang", "alternative_to", "technology:python"),
    e("technology:r-lang", "used_for", "concept:data-visualization"),
    e("technology:flutter", "written_in", "technology:dart"),
    e("technology:dart", "supports", "concept:asynchronous-programming"),
    e("technology:neovim", "commonly_used_with", "technology:lua"),
    e("technology:lua", "integrates_with", "technology:nginx"),
    e("technology:vuex-pinia", "implements", "concept:state-management"),
    e("technology:vuex-pinia", "alternative_to", "technology:redux"),
    e("technology:tanstack-query", "used_for", "concept:state-management"),
    e("technology:tanstack-query", "supports", "concept:caching"),
    e("technology:nats", "alternative_to", "technology:kafka"),
    e("technology:nats", "alternative_to", "technology:rabbitmq"),
    e("technology:flink", "alternative_to", "technology:spark"),
    e("technology:flink", "integrates_with", "technology:kafka"),
    e("technology:gymnasium", "written_in", "technology:python"),
    e("technology:gymnasium", "supports", "concept:deep-rl"),
    e("technology:dvc", "integrates_with", "technology:git"),
    e("technology:dvc", "supports", "concept:data-pipeline"),
    e("technology:gpg", "implements", "concept:digital-signature"),
    e("technology:gpg", "implements", "concept:encryption"),
    e("technology:xcode", "alternative_to", "technology:android-studio"),
    e("technology:xcode", "commonly_used_with", "technology:swiftui"),
    e("technology:capacitor", "implements", "concept:cross-platform-development"),
    e("technology:capacitor", "supports", "concept:push-notifications"),
    e("technology:qt", "implements", "concept:cross-platform-ui"),
    e("technology:qt", "alternative_to", "technology:electron"),
    e("technology:fortran", "used_for", "concept:high-performance-computing"),
    e("technology:fortran", "used_for", "concept:scientific-computing"),
    e("technology:fortran", "commonly_used_with", "technology:mpi"),
    e("technology:systemd", "part_of_ecosystem", "technology:linux"),
    e("technology:systemd", "integrates_with", "technology:podman"),
    e("technology:make", "used_for", "concept:compilation"),
    e("technology:make", "commonly_used_with", "technology:c"),
    e("technology:bash", "part_of_ecosystem", "technology:linux"),
    e("technology:bash", "used_for", "concept:ci-cd"),
    e("technology:testcontainers", "integrates_with", "technology:docker"),
    e("technology:testcontainers", "integrates_with", "technology:junit"),
    e("technology:k6", "written_in", "technology:go"),
    e("technology:k6", "integrates_with", "technology:grafana"),
    e("technology:sdl", "written_in", "technology:c"),
    e("technology:sdl", "integrates_with", "technology:opengl"),
    e("technology:metal", "alternative_to", "technology:vulkan"),
    e("technology:metal", "alternative_to", "technology:directx"),
    e("technology:urql", "integrates_with", "technology:react"),
    e("technology:valkey", "implements", "concept:caching"),
    e("technology:valkey", "implements", "concept:nosql"),
    e("technology:orbstack", "implements", "concept:containerization"),
    e("technology:orbstack", "alternative_to", "technology:podman"),
    e("technology:mosquitto", "implements", "concept:message-broker"),
    e("technology:mosquitto", "commonly_used_with", "technology:node-red"),
    e("technology:qgis", "written_in", "technology:cpp"),
    e("technology:qgis", "used_for", "concept:data-visualization"),
    e("technology:hydra", "used_for", "concept:password-cracking"),
    e("technology:hydra", "part_of_ecosystem", "technology:kali-linux"),
]

# --- Computer Engineering: the electrical side of the field ---
CE_CONCEPTS = [
    c("mixed-signal-design", "Mixed-Signal Design",
      "Designing chips and boards that combine analog and digital circuits on one die or PCB.",
      importance=0.35, wikipedia_title="Mixed-signal integrated circuit"),
    c("power-electronics", "Power Electronics",
      "Converting and controlling electric power with switching circuits: regulators, inverters, chargers.",
      importance=0.35, wikipedia_title="Power electronics"),
    c("electromagnetic-compatibility", "Electromagnetic Compatibility",
      "Making sure a device neither emits nor suffers from disruptive electromagnetic interference.",
      importance=0.3, wikipedia_title="Electromagnetic compatibility", aliases=["EMC", "EMI"]),
    c("circuit-simulation", "Circuit Simulation",
      "Predicting a circuit's behaviour with software models before it is built (SPICE and friends).",
      importance=0.35, wikipedia_title="Electronic circuit simulation", aliases=["SPICE simulation"]),
]
CE_TECHNOLOGIES = [
    t("ngspice", "ngspice", "developer_tool",
      "Open-source mixed-signal SPICE circuit simulator.",
      official_url="https://ngspice.sourceforge.io",
      documentation_url="https://ngspice.sourceforge.io/docs.html"),
]
CE_EDGES = [
    e("concept:mixed-signal-design", "belongs_to_domain", CE),
    e("concept:power-electronics", "belongs_to_domain", CE),
    e("concept:electromagnetic-compatibility", "belongs_to_domain", CE),
    e("concept:circuit-simulation", "belongs_to_domain", CE),
    e("technology:ngspice", "belongs_to_domain", CE),
    e("concept:mixed-signal-design", R, "concept:analog-circuit-design"),
    e("concept:mixed-signal-design", R, "concept:analog-to-digital-conversion"),
    e("concept:mixed-signal-design", R, "concept:system-on-chip"),
    e("concept:power-electronics", R, "concept:analog-circuit-design"),
    e("concept:power-electronics", R, "concept:pwm"),
    e("concept:power-electronics", R, "concept:low-power-design"),
    e("concept:electromagnetic-compatibility", R, "concept:signal-integrity"),
    e("concept:electromagnetic-compatibility", R, "concept:printed-circuit-board"),
    e("concept:electromagnetic-compatibility", R, "concept:power-electronics"),
    e("concept:circuit-simulation", R, "concept:analog-circuit-design"),
    e("concept:circuit-simulation", R, "concept:electronic-design-automation"),
    e("concept:circuit-simulation", R, "concept:transistor"),
    e("technology:ngspice", "implements", "concept:circuit-simulation"),
    e("technology:ngspice", "used_for", "concept:mixed-signal-design"),
    e("technology:ngspice", "integrates_with", "technology:kicad"),
    e("concept:signal-integrity", R, "concept:circuit-simulation"),
    e("concept:hardware-software-codesign", R, "concept:hardware-accelerator"),
]


def domain_spokes() -> list[dict]:
    """belongs_to_domain edges for nodes whose primary_domain has no matching spoke."""
    seed = ROOT / "data" / "seed"
    nodes = [n for f in ("concepts.json", "technologies.json")
             for n in json.loads((seed / f).read_text(encoding="utf-8"))]
    edges = json.loads((seed / "edges.json").read_text(encoding="utf-8"))
    have = {(x["source"], x["target"]) for x in edges if x["relationship_type"] == "belongs_to_domain"}
    return [e(n["id"], "belongs_to_domain", n["primary_domain"])
            for n in nodes if (n["id"], n["primary_domain"]) not in have]


if __name__ == "__main__":
    apply_batch("connect_thin", concepts=CE_CONCEPTS, technologies=CE_TECHNOLOGIES,
                edges=THIN_EDGES + ONE_LINK_EDGES + CE_EDGES)
    apply_batch("domain_spokes", edges=domain_spokes())
