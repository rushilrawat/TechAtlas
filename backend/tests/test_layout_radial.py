"""Canonical radial-atlas geometry and edge-backbone invariants."""

import json
import math
from collections import Counter

import generate_layout as gl

from app.graph_service import GraphService

DATASET = json.loads(gl.DATASET.read_text())
LAYOUT = gl.generate(DATASET)


def _members(coords, anchor):
    return [nid for nid, c in coords.items() if c["cluster"] == anchor and nid != anchor]


def test_canonical_nodes_and_ids_preserved():
    coords = LAYOUT["coordinates"]
    assert len(DATASET["nodes"]) == gl.EXPECTED_NODES and len(DATASET["edges"]) == gl.EXPECTED_EDGES
    assert sorted(coords) == sorted(n["id"] for n in DATASET["nodes"])
    assert LAYOUT["overview_aggregates"] == []
    assert LAYOUT["layout_algorithm"] == gl.LAYOUT_ALGORITHM
    assert all(math.isfinite(c["x"]) and math.isfinite(c["y"]) for c in coords.values())
    assert all(c["ring"] in (0, 1, 2, 3) for c in coords.values())
    # member counts: spatial cluster == canonical primary_domain for every node
    by_domain = Counter(n["primary_domain"] for n in DATASET["nodes"] if n["node_type"] != "domain")
    for domain, count in by_domain.items():
        assert len(_members(coords, domain)) == count
    assert len(_members(coords, "domain:robotics")) == 29


def test_fourteen_whole_ecosystems_never_overlap():
    coords, ext = LAYOUT["coordinates"], LAYOUT["domain_extents"]
    order = LAYOUT["domain_ring_order"]
    assert len(order) == 15
    assert LAYOUT["macro_composition"] == gl.MACRO_COMPOSITION == "continents"
    for d in order:
        assert coords[d]["ring"] == 0
    # whole territories (not just anchors) clear each other
    for i, a in enumerate(order):
        for b in order[i + 1:]:
            gap = math.dist((coords[a]["x"], coords[a]["y"]), (coords[b]["x"], coords[b]["y"]))
            assert gap >= ext[a] + ext[b] + gl.MACRO_GAP_PX - 0.05, (a, b)


def test_nested_subdomains_are_centered_constellations():
    coords = LAYOUT["coordinates"]
    nested = {"domain:computer-architecture": "domain:systems",
              "domain:embedded": "domain:systems",
              "domain:computer-graphics": "domain:gamedev"}
    for sub, parent in nested.items():
        assert coords[sub]["ring"] in (2, 3)
        dist = math.dist((coords[sub]["x"], coords[sub]["y"]),
                         (coords[parent]["x"], coords[parent]["y"]))
        assert dist <= LAYOUT["domain_extents"][parent]
        members = _members(coords, sub)
        assert members
        # the subdomain anchor is the center of its own small constellation
        cx = sum(coords[m]["x"] for m in members) / len(members)
        cy = sum(coords[m]["y"] for m in members) / len(members)
        spread = max(math.dist((coords[m]["x"], coords[m]["y"]),
                               (coords[sub]["x"], coords[sub]["y"])) for m in members)
        if len(members) > 1:
            assert math.dist((cx, cy), (coords[sub]["x"], coords[sub]["y"])) <= 0.25 * spread


def test_parents_are_central_with_full_360_coverage():
    coords = LAYOUT["coordinates"]
    for anchor, c in coords.items():
        if not anchor.startswith("domain:"):
            continue
        members = _members(coords, anchor)
        if len(members) < 8:
            continue
        ax, ay = c["x"], c["y"]
        angles = sorted(math.atan2(coords[m]["y"] - ay, coords[m]["x"] - ax) for m in members)
        gaps = [b - a for a, b in zip(angles, angles[1:], strict=False)]
        gaps.append(angles[0] + 2 * math.pi - angles[-1])
        assert math.degrees(max(gaps)) < 90, f"{anchor} has a one-sided fan"
        quadrants = {(coords[m]["x"] >= ax, coords[m]["y"] >= ay) for m in members}
        assert len(quadrants) == 4, anchor
        extent = max(math.dist((coords[m]["x"], coords[m]["y"]), (ax, ay)) for m in members)
        cx = sum(coords[m]["x"] for m in members) / len(members) - ax
        cy = sum(coords[m]["y"] for m in members) / len(members) - ay
        assert math.hypot(cx, cy) <= 0.25 * extent, f"{anchor} is not centered"


def test_drawn_circles_keep_a_visible_gap():
    coords = LAYOUT["coordinates"]
    ids = sorted(coords)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            gap = math.dist((coords[a]["x"], coords[a]["y"]), (coords[b]["x"], coords[b]["y"]))
            assert gap - coords[a]["r"] - coords[b]["r"] >= gl.OVERLAP_MARGIN - 0.5, (a, b)


def test_layout_is_stable_and_matches_committed_artifact():
    assert LAYOUT == gl.generate(json.loads(gl.DATASET.read_text()))
    committed = json.loads(gl.OUTPUT.read_text())
    assert json.loads(json.dumps(LAYOUT)) == committed


def test_edge_tiers_are_a_sparse_canonical_backbone():
    tiers = LAYOUT["edge_tiers"]
    coords = LAYOUT["coordinates"]
    assert set(tiers) == {f"e{i}" for i in range(gl.EXPECTED_EDGES)}
    assert set(tiers.values()) == {"TierA", "TierB", "TierC", "TierD"}
    counts = Counter(tiers.values())
    # Rush asked for more visible connections than the original 100-170 target.
    assert 250 <= counts["TierA"] + counts["TierB"] + counts["TierC"] <= 360
    assert counts["TierC"] <= gl.TIER_C_CAP
    for i, edge in enumerate(DATASET["edges"]):
        tier = tiers[f"e{i}"]
        if edge["relationship_type"] == "has_subdomain":
            # nested hierarchy is Tier A; taxonomic root spokes never cross the atlas
            assert tier == ("TierD" if edge["source"] == gl.ROOT_DOMAIN else "TierA")
        if tier == "TierC":
            assert coords[edge["source"]]["cluster"] != coords[edge["target"]]["cluster"]
    # membership spokes are a minority of the backbone, not a fake hub-and-spoke web
    spokes = sum(1 for i, e in enumerate(DATASET["edges"])
                 if e["relationship_type"] == "belongs_to_domain" and tiers[f"e{i}"] == "TierB")
    assert spokes < counts["TierB"] / 2


def test_api_threads_radial_fields():
    service = GraphService()
    nodes, edges = service.graph()
    assert len(nodes) == gl.EXPECTED_NODES and len(edges) == gl.EXPECTED_EDGES
    assert len(service._edge_tiers) == gl.EXPECTED_EDGES
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


def test_connected_members_are_assigned_closer_rings():
    members = [f"n{i}" for i in range(10)]
    intra = {nid: 10 - i for i, nid in enumerate(members)}
    degree = dict(intra)
    radius = {nid: 8.0 for nid in members}
    rings = gl._connectivity_rings(members, intra, degree, radius)
    assert [rings[nid] for nid in members] == [1, 1, 2, 2, 2, 3, 3, 3, 3, 3]


def test_alternative_compositions_keep_ecosystems_apart():
    for composition in ("ring", "strata"):
        layout = gl.generate(DATASET, composition)
        coords, ext = layout["coordinates"], layout["domain_extents"]
        order = layout["domain_ring_order"]
        for i, a in enumerate(order):
            for b in order[i + 1:]:
                gap = math.dist((coords[a]["x"], coords[a]["y"]), (coords[b]["x"], coords[b]["y"]))
                assert gap >= ext[a] + ext[b] + gl.MACRO_GAP_PX - 0.05, (composition, a, b)
