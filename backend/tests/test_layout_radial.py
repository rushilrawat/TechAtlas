"""Canonical radial-atlas geometry and edge-backbone invariants."""
import json
import math
from collections import Counter

import generate_layout as gl

from app.graph_service import GraphService


def test_canonical_radial_layout():
    dataset = json.loads(gl.DATASET.read_text())
    layout = gl.generate(dataset)
    coords = layout["coordinates"]
    assert set(coords) == {n["id"] for n in dataset["nodes"]}
    assert len(coords) == 607
    assert layout["overview_aggregates"] == []
    assert len(layout["domain_ring_order"]) == 14
    assert all(math.isfinite(c["x"]) and math.isfinite(c["y"]) for c in coords.values())
    assert all(c["ring"] in (0, 1, 2, 3) for c in coords.values())
    assert all(coords[d]["ring"] == 0 for d in layout["domain_ring_order"])
    assert all(
        abs(math.hypot(coords[d]["x"], coords[d]["y"]) - gl.MACRO_RING_R) < 0.02
        for d in layout["domain_ring_order"]
    )
    assert layout == gl.generate(dataset)

    tiers = layout["edge_tiers"]
    assert set(tiers) == {f"e{i}" for i in range(1116)}
    assert set(tiers.values()) == {"TierA", "TierB", "TierC", "TierD"}
    counts = Counter(tiers.values())
    assert 100 <= counts["TierA"] + counts["TierB"] + counts["TierC"] <= 170
    assert counts["TierC"] <= 20
    for i, edge in enumerate(dataset["edges"]):
        if edge["relationship_type"] == "has_subdomain":
            assert tiers[f"e{i}"] == "TierA"


def test_api_threads_radial_fields():
    service = GraphService()
    nodes, edges = service.graph()
    assert len(nodes) == 607 and len(edges) == 1116
    assert len(service._edge_tiers) == 1116
    assert service.overview_aggregates() == []
    assert all(node.ring in (0, 1, 2, 3) for node in nodes)
