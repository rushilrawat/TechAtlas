#!/usr/bin/env python3
"""Single source of truth for node render radius.

Both the offline layout generator (scripts/generate_layout.py) and the backend
(backend/app/graph_service.py) must agree on how big a bubble is, otherwise the
overlap-resolution pass in the layout would relax against the wrong sizes.

This module is dependency-free and pure so it can be imported from either side.
The backend keeps its own thin wrapper that delegates here.

Spec §5.3: three separate scales (domain / concept / technology), bounded radii,
sqrt scaling for technologies so hubs don't dwarf everything.
"""
from __future__ import annotations

import math

# Bounded render-size bands by node type. Keep in sync with any UI expectations.
SIZE_DOMAIN = (14.0, 26.0)
SIZE_CONCEPT = (6.0, 12.0)
SIZE_TECH = (5.0, 16.0)


def compute_degrees(edges: list[dict]) -> dict[str, int]:
    """Total (undirected) degree per node id."""
    degree: dict[str, int] = {}
    for e in edges:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    return degree


def max_tech_degree(nodes: list[dict], degree: dict[str, int]) -> int:
    return max(
        (degree.get(n["id"], 0) for n in nodes if n["node_type"] == "technology"),
        default=1,
    ) or 1


def node_radius(node: dict, degree: dict[str, int], max_tech_deg: int) -> float:
    """Render radius for a single node, matching the API's sizing exactly."""
    ntype = node["node_type"]
    if ntype == "domain":
        lo, hi = SIZE_DOMAIN
        imp = node.get("importance") or 0.5
        return round(lo + (hi - lo) * imp, 2)
    if ntype == "concept":
        lo, hi = SIZE_CONCEPT
        imp = node.get("importance") or 0.4
        return round(lo + (hi - lo) * imp, 2)
    lo, hi = SIZE_TECH
    norm = (degree.get(node["id"], 0) / max_tech_deg) if max_tech_deg else 0.0
    return round(lo + (hi - lo) * math.sqrt(norm), 2)


def radii_for_dataset(nodes: list[dict], edges: list[dict]) -> dict[str, float]:
    """Radius for every node id in the dataset."""
    degree = compute_degrees(edges)
    max_deg = max_tech_degree(nodes, degree)
    return {n["id"]: node_radius(n, degree, max_deg) for n in nodes}
