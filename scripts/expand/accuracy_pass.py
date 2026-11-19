"""Accuracy pass (Nov 2026): correct wrong facts, edges and captions in the seed data.

Idempotent: re-running it changes nothing once applied. Each fix states what was wrong.
Run from the repo root: python scripts/expand/accuracy_pass.py
"""
from __future__ import annotations

import json
from pathlib import Path

SEED = Path(__file__).resolve().parents[2] / "data" / "seed"


def load(name):
    return json.loads((SEED / name).read_text(encoding="utf-8"))


def save(name, data):
    (SEED / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def save_apps(apps):
    """apps.json keeps its hand-written layout: one line per stack entry and list."""
    def one(v):
        return json.dumps(v, ensure_ascii=False)
    blocks = []
    for a in apps:
        lines = []
        for k, v in a.items():
            if k == "stack":
                rows = ",\n".join(f"      {one(s)}" for s in v)
                lines.append(f'    "stack": [\n{rows}\n    ]')
            else:
                lines.append(f"    {one(k)}: {one(v)}")
        blocks.append("  {\n" + ",\n".join(lines) + "\n  }")
    (SEED / "apps.json").write_text("[\n" + ",\n".join(blocks) + "\n]\n", encoding="utf-8")


T = "technology:"
C = "concept:"

# --- node field fixes: id -> {field: value} ------------------------------------------
NODE_FIXES = {
    # ESP32 is a chip family (hardware), not a developer tool.
    T + "esp32": {"node_subtype": "platform"},
    # Sass is a CSS preprocessor, not a standard.
    T + "sass": {"node_subtype": "developer_tool"},
    # OpenGL has had no new version since 4.6 (2017); Vulkan is Khronos' successor.
    T + "opengl": {"lifecycle_status": "mature",
                   "short_description": "A cross-platform API for 2D and 3D graphics, frozen at 4.6 since 2017 as Vulkan took over."},
    # Coq was renamed the Rocq Prover in 2025 (Rocq 9.0).
    T + "coq": {"name": "Rocq (Coq)", "aliases": ["Coq", "Rocq", "Rocq Prover"],
                "official_url": "https://rocq-prover.org",
                "short_description": "An interactive theorem prover for formal proofs, renamed from Coq to Rocq in 2025."},
    # Remix v2 merged into React Router v7 (framework mode) in late 2024.
    T + "remix": {"short_description": "A full-stack React framework built on web standards; Remix v2 merged into React Router v7 in 2024."},
    # Cuckoo 2 (Python 2) has been unmaintained since 2019; CAPE and Cuckoo3 carry it on.
    T + "cuckoo-sandbox": {"lifecycle_status": "deprecated",
                           "short_description": "Ran suspicious files in an isolated VM and reported what they did; unmaintained since 2019, continued by CAPE and Cuckoo3."},
    # Wikipedia titles that pointed at a different subject, so the summary was wrong.
    C + "embodied-ai": {"wikipedia_title": "Embodied agent"},  # was "Embodied cognition" (psychology)
    C + "fraud-detection": {"wikipedia_title": "Data analysis techniques for fraud detection"},  # was "Fraud"
    C + "database-sharding": {"name": "Database Sharding", "aliases": ["sharding", "shard"]},
    # RSC still ship a client runtime; it is the components' own code that stays on the server.
    C + "react-server-components": {"short_description": "Components that render on the server and send no component code to the client."},
    # Samsung shipped GAA at 3 nm (2022); TSMC N2 and Intel 18A follow at the 2 nm class.
    C + "gate-all-around-transistors": {"short_description": "Transistors whose gate wraps the channel, succeeding FinFETs from the 3 nm and 2 nm nodes."},
    # Frontier, Aurora and El Capitan each have roughly 9,000 to 11,000 nodes.
    C + "supercomputer": {"short_description": "Machines with thousands of nodes and fast interconnects for the largest simulations."},
    # The theorem only holds for band-limited signals.
    C + "sampling-theorem": {"short_description": "Sampling a band-limited signal above twice its highest frequency captures it exactly."},
}

# --- edge fixes ----------------------------------------------------------------------
# (source, target, old_type) -> None (delete) or (new_source, new_target, new_type)
EDGE_FIXES = {
    # Nmap is written mostly in C++ (plus C and Lua), not C.
    (T + "nmap", T + "c", "written_in"): (T + "nmap", T + "cpp", "written_in"),
    # Vite and Vue 3 are written in TypeScript.
    (T + "vite", T + "javascript", "written_in"): (T + "vite", T + "typescript", "written_in"),
    (T + "vue", T + "javascript", "written_in"): (T + "vue", T + "typescript", "written_in"),
    # PyTorch and TensorFlow run on CPUs too; CUDA is optional acceleration.
    (T + "pytorch", T + "cuda", "depends_on"): (T + "pytorch", T + "cuda", "integrates_with"),
    (T + "tensorflow", T + "cuda", "depends_on"): (T + "tensorflow", T + "cuda", "integrates_with"),
    # Kubernetes talks to any CRI runtime (containerd, CRI-O); it does not require containerd.
    (T + "kubernetes", T + "containerd", "depends_on"): (T + "kubernetes", T + "containerd", "integrates_with"),
    # gRPC uses Protocol Buffers as its default IDL; protobuf is not part of gRPC.
    (T + "protobuf", T + "grpc", "part_of_ecosystem"): (T + "grpc", T + "protobuf", "integrates_with"),
    # LeRobot is a Hugging Face library, but not part of the Transformers library.
    (T + "lerobot", T + "huggingface-transformers", "part_of_ecosystem"): (T + "lerobot", T + "huggingface-transformers", "related_to"),
    # Cloudflare mitigates DDoS attacks; "supports" read as if it enabled them.
    (T + "cloudflare", C + "ddos-attack", "supports"): (T + "cloudflare", C + "ddos-attack", "related_to"),
    # Falco is runtime threat detection on hosts and containers, not threat modeling.
    (T + "falco", C + "threat-modeling", "supports"): (T + "falco", C + "endpoint-detection-and-response", "related_to"),
    # Trivy scans for known vulnerabilities; that is not threat modeling.
    (T + "trivy", C + "threat-modeling", "used_for"): (T + "trivy", C + "vulnerability-assessment", "used_for"),
    # Snort is an IDS that sniffs packets; threat modeling is a design activity.
    (T + "snort", C + "threat-modeling", "related_to"): (T + "snort", C + "packet-sniffing", "related_to"),
}

# --- guided path captions: (journey title, step id) -> caption ------------------------
CAPTION_FIXES = {
    ("How HTTPS stays private", T + "let-s-encrypt"):
        "Let's Encrypt issues free certificates, so any site can serve HTTPS.",
    ("Machine learning on tiny devices", T + "esp32"):
        "An ESP32 can run small models on a battery budget.",
    ("Smart homes that just work", T + "matter"):
        "Matter runs over Thread, as well as Wi-Fi and Ethernet.",
    ("Smart homes that just work", C + "home-automation"):
        "Devices from different brands work together.",
}
CAPTION_REPLACE = {
    # (step id, old caption) -> new caption, for captions shared by several paths
    (T + "bitcoin", "Bitcoin was the first blockchain, created for digital money."):
        "Bitcoin was the first cryptocurrency and the first blockchain in wide use.",
    (C + "mitre-attack", "ATT&CK names every technique they use."):
        "ATT&CK catalogues the techniques real attackers use.",
}

# --- famous apps: (app id, tech) -> note; additions; not_in_atlas additions ------------
APP_NOTE_FIXES = {
    # Kafka was built at LinkedIn around 2010 and open-sourced in early 2011.
    ("linkedin", "kafka"): "Created at LinkedIn; open-sourced in 2011",
    ("figma", "webgl"): "Canvas rendering (original renderer)",
    ("chatgpt", "azure"): "Primary cloud and supercomputers; capacity also from Oracle, CoreWeave and Google Cloud since 2025",
    ("wikipedia", "elasticsearch"): "On-wiki search (CirrusSearch), now moving to the OpenSearch fork",
}
APP_STACK_ADD = {
    # Figma moved its renderer to WebGPU in 2025, with WebGL as the fallback.
    "figma": [("webgl", {"tech": "webgpu", "layer": "web", "note": "Renderer moved to WebGPU in 2025, WebGL as fallback"})],
}
APP_MISSING_ADD = {"wikipedia": ["OpenSearch"]}


def main() -> None:
    changed = []
    techs, concepts = load("technologies.json"), load("concepts.json")
    for coll, name in ((techs, "technologies.json"), (concepts, "concepts.json")):
        for n in coll:
            for k, v in NODE_FIXES.get(n["id"], {}).items():
                if n.get(k) != v:
                    n[k] = v
                    changed.append(f"{n['id']}.{k}")
        save(name, coll)

    edges = load("edges.json")
    existing = {(e["source"], e["target"], e["relationship_type"]) for e in edges}
    out = []
    for e in edges:
        key = (e["source"], e["target"], e["relationship_type"])
        if key in EDGE_FIXES:
            new = EDGE_FIXES[key]
            changed.append(f"edge {key} -> {new}")
            if new is None or new in existing:
                continue
            e = {"source": new[0], "target": new[1], "relationship_type": new[2]}
            existing.add(new)
        out.append(e)
    save("edges.json", out)

    journeys = load("journeys.json")
    for j in journeys:
        for s in j["steps"]:
            new = CAPTION_FIXES.get((j["title"], s["id"])) or CAPTION_REPLACE.get((s["id"], s["caption"]))
            if new and s["caption"] != new:
                s["caption"] = new
                changed.append(f"caption {j['title']} / {s['id']}")
    save("journeys.json", journeys)

    apps = load("apps.json")
    for a in apps:
        for s in a["stack"]:
            note = APP_NOTE_FIXES.get((a["id"], s["tech"]))
            if note and s.get("note") != note:
                s["note"] = note
                changed.append(f"app {a['id']}/{s['tech']} note")
        have = {s["tech"] for s in a["stack"]}
        for after, add in APP_STACK_ADD.get(a["id"], []):
            if add["tech"] not in have:
                at = next((i + 1 for i, s in enumerate(a["stack"]) if s["tech"] == after), len(a["stack"]))
                a["stack"].insert(at, add)
                changed.append(f"app {a['id']} +{add['tech']}")
        for m in APP_MISSING_ADD.get(a["id"], []):
            if m not in a.get("not_in_atlas", []):
                a.setdefault("not_in_atlas", []).append(m)
                changed.append(f"app {a['id']} not_in_atlas +{m}")
    save_apps(apps)
    print(f"{len(changed)} change(s)")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
