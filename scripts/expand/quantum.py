#!/usr/bin/env python3
"""Phase 1F expansion: Quantum Computing as its own top-level domain.

Adds the domain anchor, its core concepts and the main software stacks, and links
them to existing nodes (Python, CUDA, AWS, cryptography, complexity theory). The five
quantum nodes that previously sat inside Systems (quantum computing, qubit, quantum gate,
quantum algorithms, Qiskit) move into the new domain rather than being duplicated.
"""
from __future__ import annotations

import json

from _apply import SEED, apply_batch

QC = "domain:quantum"

DOMAIN = {
    "id": QC, "slug": "quantum", "name": "Quantum Computing & Information", "node_type": "domain",
    "primary_domain": QC,
    "short_description": "Computing with qubits, superposition and entanglement to tackle "
                         "problems that are hard for classical machines.",
    "importance": 0.7, "lifecycle_status": "active",
}


def t(slug, name, subtype, desc, **extra):
    node = {
        "id": f"technology:{slug}", "slug": slug, "name": name,
        "node_type": "technology", "node_subtype": subtype,
        "primary_domain": QC, "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


def c(slug, name, desc, **extra):
    node = {
        "id": f"concept:{slug}", "slug": slug, "name": name,
        "node_type": "concept", "primary_domain": QC,
        "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


CONCEPTS = [
    c("quantum-superposition", "Quantum Superposition",
      "A quantum state that is a combination of several basis states at once.",
      importance=0.65, wikipedia_title="Quantum superposition"),
    c("quantum-entanglement", "Quantum Entanglement",
      "Correlation between qubits so the state of one cannot be described independently.",
      importance=0.65, wikipedia_title="Quantum entanglement"),
    c("quantum-circuit", "Quantum Circuit",
      "A sequence of quantum gates and measurements that expresses a quantum program.",
      importance=0.7, wikipedia_title="Quantum circuit"),
    c("shors-algorithm", "Shor's Algorithm",
      "A quantum algorithm that factors integers in polynomial time, threatening RSA.",
      importance=0.6, wikipedia_title="Shor's algorithm"),
    c("grovers-algorithm", "Grover's Algorithm",
      "A quantum search algorithm with a quadratic speedup over classical search.",
      importance=0.55, wikipedia_title="Grover's algorithm"),
    c("quantum-error-correction", "Quantum Error Correction",
      "Encoding logical qubits across many physical qubits to survive noise.",
      importance=0.6, wikipedia_title="Quantum error correction"),
    c("quantum-advantage", "Quantum Advantage",
      "A task a quantum computer completes far faster than any classical computer.",
      aliases=["Quantum supremacy"], importance=0.5, wikipedia_title="Quantum supremacy"),
    c("variational-quantum-eigensolver", "Variational Quantum Eigensolver",
      "A hybrid quantum-classical algorithm that estimates ground-state energies.",
      aliases=["VQE"], importance=0.45, wikipedia_title="Variational quantum eigensolver"),
    c("quantum-annealing", "Quantum Annealing",
      "Finding low-energy solutions to optimization problems with quantum fluctuations.",
      importance=0.45, wikipedia_title="Quantum annealing"),
    c("quantum-key-distribution", "Quantum Key Distribution",
      "Sharing encryption keys whose interception is detectable by quantum physics.",
      aliases=["QKD"], importance=0.5, wikipedia_title="Quantum key distribution"),
    c("superconducting-qubits", "Superconducting Qubits",
      "Qubits built from superconducting circuits, used by IBM and Google hardware.",
      importance=0.5, wikipedia_title="Superconducting quantum computing"),
    c("trapped-ion-qubits", "Trapped-Ion Qubits",
      "Qubits stored in individual ions held by electromagnetic fields.",
      importance=0.45, wikipedia_title="Trapped-ion quantum computer"),
]

TECHNOLOGIES = [
    t("cirq", "Cirq", "library",
      "Google's Python library for writing and simulating quantum circuits.",
      official_url="https://quantumai.google/cirq",
      documentation_url="https://quantumai.google/cirq", wikipedia_title="Cirq"),
    t("pennylane", "PennyLane", "library",
      "A Python library for quantum machine learning and differentiable quantum programs.",
      official_url="https://pennylane.ai", documentation_url="https://docs.pennylane.ai"),
    t("q-sharp", "Q#", "programming_language",
      "Microsoft's domain-specific language for quantum programs.",
      official_url="https://learn.microsoft.com/azure/quantum/qsharp-overview",
      documentation_url="https://learn.microsoft.com/azure/quantum/",
      wikipedia_title="Q Sharp"),
    t("openqasm", "OpenQASM", "standard",
      "An open assembly language for describing quantum circuits.",
      official_url="https://openqasm.com", documentation_url="https://openqasm.com",
      wikipedia_title="OpenQASM"),
    t("amazon-braket", "Amazon Braket", "cloud_service",
      "AWS's managed service for running quantum programs on simulators and hardware.",
      official_url="https://aws.amazon.com/braket/",
      documentation_url="https://docs.aws.amazon.com/braket/"),
    t("azure-quantum", "Azure Quantum", "cloud_service",
      "Microsoft's cloud service for quantum hardware access and development.",
      official_url="https://azure.microsoft.com/products/quantum",
      documentation_url="https://learn.microsoft.com/azure/quantum/"),
    t("ibm-quantum-platform", "IBM Quantum Platform", "cloud_service",
      "IBM's cloud access to its superconducting quantum processors.",
      official_url="https://www.ibm.com/quantum",
      documentation_url="https://docs.quantum.ibm.com/"),
    t("cuda-q", "CUDA-Q", "sdk",
      "NVIDIA's platform for hybrid quantum-classical programs on GPUs and QPUs.",
      official_url="https://developer.nvidia.com/cuda-q",
      documentation_url="https://nvidia.github.io/cuda-quantum/"),
]


# Existing nodes that belong in this domain (previously filed under Systems).
MOVED = ["concept:quantum-computing", "concept:qubit", "concept:quantum-gate",
         "concept:quantum-algorithms", "technology:qiskit"]


def e(s, r, t_):
    return {"source": s, "target": t_, "relationship_type": r}


EDGES = [
    e("domain:software-engineering", "has_subdomain", QC),
    *(e(n["id"], "belongs_to_domain", QC) for n in CONCEPTS + TECHNOLOGIES),
    *(e(nid, "belongs_to_domain", QC) for nid in MOVED),
    # core physics and the circuit model
    e("concept:qubit", "related_to", "concept:quantum-superposition"),
    e("concept:qubit", "related_to", "concept:quantum-entanglement"),
    e("concept:quantum-gate", "enables", "concept:quantum-circuit"),
    e("concept:quantum-error-correction", "related_to", "concept:qubit"),
    e("concept:superconducting-qubits", "related_to", "concept:qubit"),
    e("concept:trapped-ion-qubits", "related_to", "concept:qubit"),
    e("concept:superconducting-qubits", "alternative_to", "concept:trapped-ion-qubits"),
    e("concept:quantum-annealing", "related_to", "concept:qubit"),
    # algorithms
    e("concept:shors-algorithm", "related_to", "concept:quantum-algorithms"),
    e("concept:grovers-algorithm", "related_to", "concept:quantum-algorithms"),
    e("concept:shors-algorithm", "related_to", "concept:quantum-circuit"),
    e("concept:variational-quantum-eigensolver", "related_to", "concept:quantum-circuit"),
    e("concept:quantum-advantage", "related_to", "concept:computational-complexity"),
    # cryptography links
    e("concept:shors-algorithm", "related_to", "concept:public-key-cryptography"),
    e("concept:shors-algorithm", "related_to", "concept:post-quantum-cryptography"),
    e("concept:quantum-key-distribution", "related_to", "concept:quantum-entanglement"),
    e("concept:quantum-key-distribution", "related_to", "concept:cryptography"),
    # software stack
    e("technology:qiskit", "written_in", "technology:python"),
    e("technology:cirq", "written_in", "technology:python"),
    e("technology:pennylane", "written_in", "technology:python"),
    e("technology:qiskit", "implements", "concept:quantum-circuit"),
    e("technology:cirq", "implements", "concept:quantum-circuit"),
    e("technology:qiskit", "alternative_to", "technology:cirq"),
    e("technology:pennylane", "supports", "concept:variational-quantum-eigensolver"),
    e("technology:openqasm", "used_for", "concept:quantum-circuit"),
    e("technology:qiskit", "integrates_with", "technology:openqasm"),
    e("technology:q-sharp", "used_for", "concept:quantum-circuit"),
    e("technology:azure-quantum", "commonly_used_with", "technology:q-sharp"),
    e("technology:ibm-quantum-platform", "commonly_used_with", "technology:qiskit"),
    e("technology:ibm-quantum-platform", "supports", "concept:superconducting-qubits"),
    e("technology:amazon-braket", "used_for", "concept:quantum-circuit"),
    e("technology:amazon-braket", "part_of_ecosystem", "technology:aws"),
    e("technology:amazon-braket", "alternative_to", "technology:azure-quantum"),
    e("technology:cuda-q", "integrates_with", "technology:cuda"),
    e("technology:cuda-q", "used_for", "concept:quantum-circuit"),
]


def _rewrite(name: str, fn) -> None:
    path = SEED / name
    data = fn(json.loads(path.read_text(encoding="utf-8")))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def add_domain_and_move() -> None:
    _rewrite("domains.json", lambda ds: ds if any(d["id"] == QC for d in ds) else [*ds, DOMAIN])
    moved = set(MOVED)

    def move(nodes: list[dict]) -> list[dict]:
        for n in nodes:
            if n["id"] in moved:
                n["primary_domain"] = QC
        return nodes
    _rewrite("concepts.json", move)
    _rewrite("technologies.json", move)
    # The old Systems membership edge goes; apply_batch adds the Quantum one.
    _rewrite("edges.json", lambda es: [x for x in es if not (
        x["source"] in moved and x["relationship_type"] == "belongs_to_domain"
        and x["target"] == "domain:systems")])


if __name__ == "__main__":
    add_domain_and_move()
    apply_batch("quantum", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
