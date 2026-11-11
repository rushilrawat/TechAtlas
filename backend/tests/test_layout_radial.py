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


def test_local_slot_assignment_shortens_genuine_connections():
    pos = {"a": [-10.0, 0.0], "b": [10.0, 0.0],
           "left": [-12.0, 2.0], "right": [12.0, 2.0]}
    edges = [
        {"source": "a", "target": "right", "relationship_type": "commonly_used_with"},
        {"source": "b", "target": "left", "relationship_type": "commonly_used_with"},
    ]
    before = sum(math.dist(pos[e["source"]], pos[e["target"]]) for e in edges)
    gl._shorten_local_connections([["a", "b"]], pos, edges)
    after = sum(math.dist(pos[e["source"]], pos[e["target"]]) for e in edges)
    assert after < before * 0.2
    assert {tuple(pos["a"]), tuple(pos["b"])} == {(-10.0, 0.0), (10.0, 0.0)}
