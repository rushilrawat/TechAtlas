#!/usr/bin/env python3
"""Generate a deterministic, community-aware layout snapshot for the graph.

Spec §5.2: compute layout offline, store stable coordinates, keep it deterministic
for a given graph version. The frontend loads these coordinates instead of running a
full physics simulation on every page load.

Approach (dependency-free, deterministic):
  1. Assign each node a community = its primary_domain (domains anchor the communities).
  2. Place domain anchors evenly on a circle (seeded, stable order).
  3. Seed every node near its domain anchor using a deterministic hash.
  4. Run a fixed number of Fruchterman-Reingold-style force iterations with a fixed
     seed, with domain anchors lightly pinned, so related nodes pull together.
  5. Write data/layout.json keyed by the dataset version.

No randomness without a fixed seed => identical output for identical input.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "graph.json"
OUTPUT = ROOT / "data" / "layout.json"

ITERATIONS = 300
WIDTH = 2000.0
AREA = WIDTH * WIDTH


def _seeded_unit(key: str) -> float:
    """Deterministic float in [0, 1) from a string key."""
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(0x1000000000000)


def generate(dataset: dict) -> dict:
    nodes = dataset["nodes"]
    edges = dataset["edges"]
    ids = [n["id"] for n in nodes]
    node_by_id = {n["id"]: n for n in nodes}

    domains = sorted(n["id"] for n in nodes if n["node_type"] == "domain")
    n_domains = max(len(domains), 1)
    anchor = {}
    radius_ring = WIDTH * 0.32
    for i, d in enumerate(domains):
        angle = 2 * math.pi * i / n_domains
        anchor[d] = (radius_ring * math.cos(angle), radius_ring * math.sin(angle))

    def community(nid: str) -> str:
        node = node_by_id[nid]
        return node["id"] if node["node_type"] == "domain" else node.get("primary_domain", nid)

    # initial positions: scattered deterministically around the node's domain anchor
    pos: dict[str, list[float]] = {}
    for nid in ids:
        comm = community(nid)
        ax, ay = anchor.get(comm, (0.0, 0.0))
        r = WIDTH * 0.10 * _seeded_unit(nid + ":r")
        theta = 2 * math.pi * _seeded_unit(nid + ":t")
        pos[nid] = [ax + r * math.cos(theta), ay + r * math.sin(theta)]

    adjacency: list[tuple[str, str]] = [
        (e["source"], e["target"])
        for e in edges
        if e["source"] in pos and e["target"] in pos
    ]

    k = math.sqrt(AREA / max(len(ids), 1))
    temp = WIDTH * 0.1

    for _ in range(ITERATIONS):
        disp: dict[str, list[float]] = {nid: [0.0, 0.0] for nid in ids}

        # repulsive forces (O(n^2); fine for a few hundred nodes)
        for i, a in enumerate(ids):
            ax, ay = pos[a]
            for b in ids[i + 1 :]:
                dx = ax - pos[b][0]
                dy = ay - pos[b][1]
                dist = math.hypot(dx, dy) or 0.01
                force = (k * k) / dist
                ux, uy = dx / dist, dy / dist
                disp[a][0] += ux * force
                disp[a][1] += uy * force
                disp[b][0] -= ux * force
                disp[b][1] -= uy * force

        # attractive forces along edges
        for s, t in adjacency:
            dx = pos[s][0] - pos[t][0]
            dy = pos[s][1] - pos[t][1]
            dist = math.hypot(dx, dy) or 0.01
            force = (dist * dist) / k
            ux, uy = dx / dist, dy / dist
            disp[s][0] -= ux * force
            disp[s][1] -= uy * force
            disp[t][0] += ux * force
            disp[t][1] += uy * force

        # apply, cap by temperature, pin domain anchors lightly
        for nid in ids:
            dxy = disp[nid]
            d = math.hypot(*dxy) or 0.01
            step = min(d, temp)
            pos[nid][0] += (dxy[0] / d) * step
            pos[nid][1] += (dxy[1] / d) * step
            if nid in anchor:
                # pull domains back toward their ring anchor to keep communities placed
                ax, ay = anchor[nid]
                pos[nid][0] = 0.85 * pos[nid][0] + 0.15 * ax
                pos[nid][1] = 0.85 * pos[nid][1] + 0.15 * ay

        temp *= 0.98  # cool down

    coords = {
        nid: {
            "x": round(pos[nid][0], 2),
            "y": round(pos[nid][1], 2),
            "cluster": community(nid),
        }
        for nid in ids
    }

    return {
        "layout_version": dataset["version"],
        "layout_algorithm": "deterministic-fruchterman-reingold",
        "coordinates": coords,
    }


def main() -> None:
    if not DATASET.exists():
        raise SystemExit("data/graph.json not found. Run scripts/build_dataset.py first.")
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    layout = generate(dataset)
    OUTPUT.write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)} — {len(layout['coordinates'])} positions "
        f"for layout_version {layout['layout_version']}"
    )


if __name__ == "__main__":
    main()
