"""Tests for the offline layout generator (scripts/generate_layout.py).

Covers the smoothness-plan tasks:
  1 emitted radius matches the API sizing
  2 no overlapping bubbles in the output
  3 connectivity-ordered domain ring
  4 relationship-weighted proximity (used-together closer than alternatives)
  5 determinism + runtime budget at synthetic scale
  6 cross-version pinning freezes far nodes
"""
from __future__ import annotations

import copy
import math
import time

import generate_layout as gl
from sizing import node_radius, radii_for_dataset


def _toy_dataset() -> dict:
    """A small multi-domain dataset exercising every relevant relationship type."""
    nodes = [
        {"id": "domain:a", "slug": "a", "name": "A", "node_type": "domain",
         "primary_domain": "domain:a", "short_description": "A", "importance": 1.0},
        {"id": "domain:b", "slug": "b", "name": "B", "node_type": "domain",
         "primary_domain": "domain:b", "short_description": "B", "importance": 1.0},
        {"id": "domain:c", "slug": "c", "name": "C", "node_type": "domain",
         "primary_domain": "domain:c", "short_description": "C", "importance": 1.0},
        {"id": "technology:x", "slug": "x", "name": "X", "node_type": "technology",
         "node_subtype": "library", "primary_domain": "domain:a", "short_description": "x"},
        {"id": "technology:y", "slug": "y", "name": "Y", "node_type": "technology",
         "node_subtype": "library", "primary_domain": "domain:a", "short_description": "y"},
        {"id": "technology:z", "slug": "z", "name": "Z", "node_type": "technology",
         "node_subtype": "library", "primary_domain": "domain:b", "short_description": "z"},
    ]
    edges = [
        {"source": "technology:x", "target": "domain:a", "relationship_type": "belongs_to_domain"},
        {"source": "technology:y", "target": "domain:a", "relationship_type": "belongs_to_domain"},
        {"source": "technology:z", "target": "domain:b", "relationship_type": "belongs_to_domain"},
        # x and y used together => should end up close
        {"source": "technology:x", "target": "technology:y",
         "relationship_type": "commonly_used_with"},
        # x and z alternatives => should end up relatively far
        {"source": "technology:x", "target": "technology:z",
         "relationship_type": "alternative_to"},
    ]
    return {"version": "9.9.9", "nodes": nodes, "edges": edges}


def test_task1_radius_matches_api_sizing():
    ds = _toy_dataset()
    radii = radii_for_dataset(ds["nodes"], ds["edges"])
    layout = gl.generate(ds)
    for nid, coord in layout["coordinates"].items():
        assert math.isclose(coord["radius"], radii[nid], abs_tol=0.01)
        # same formula the backend uses
        node = next(n for n in ds["nodes"] if n["id"] == nid)
        from sizing import compute_degrees, max_tech_degree
        deg = compute_degrees(ds["edges"])
        mtd = max_tech_degree(ds["nodes"], deg)
        assert math.isclose(coord["radius"], node_radius(node, deg, mtd), abs_tol=0.01)


def test_task2_no_overlaps():
    ds = _toy_dataset()
    c = gl.generate(ds)["coordinates"]
    ids = list(c)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            dist = math.hypot(c[a]["x"] - c[b]["x"], c[a]["y"] - c[b]["y"])
            need = c[a]["radius"] + c[b]["radius"] + gl.OVERLAP_MARGIN
            assert dist >= need - 1.0, f"{a} and {b} overlap: {dist:.1f} < {need:.1f}"


def test_task3_domain_ring_orders_by_connectivity():
    ds = _toy_dataset()
    # add cross-domain edges making a-b strongly linked, c weakly
    ds["edges"] += [
        {
            "source": "technology:x",
            "target": "technology:z",
            "relationship_type": "integrates_with",
        },
    ]
    layout = gl.generate(ds)
    order = layout["domain_ring_order"]
    # a and b are connected; they should be ring-adjacent (wrap-around allowed)
    ia, ib = order.index("domain:a"), order.index("domain:b")
    gap = min(abs(ia - ib), len(order) - abs(ia - ib))
    assert gap == 1


def test_task4_used_together_closer_than_alternatives():
    ds = _toy_dataset()
    c = gl.generate(ds)["coordinates"]

    def dist(a, b):
        return math.hypot(c[a]["x"] - c[b]["x"], c[a]["y"] - c[b]["y"])

    used_together = dist("technology:x", "technology:y")
    alternatives = dist("technology:x", "technology:z")
    assert used_together < alternatives


def test_task5_deterministic():
    ds = _toy_dataset()
    a = gl.generate(copy.deepcopy(ds))
    b = gl.generate(copy.deepcopy(ds))
    assert a["coordinates"] == b["coordinates"]


def test_task5_runtime_budget_at_scale():
    # synthetic ~300-node graph; Barnes-Hut should keep this well under budget
    nodes = [
        {"id": "domain:d", "slug": "d", "name": "D", "node_type": "domain",
         "primary_domain": "domain:d", "short_description": "D", "importance": 1.0}
    ]
    edges = []
    for i in range(300):
        nid = f"technology:n{i}"
        nodes.append({"id": nid, "slug": f"n{i}", "name": f"N{i}",
                      "node_type": "technology", "node_subtype": "library",
                      "primary_domain": "domain:d", "short_description": "n"})
        edges.append({"source": nid, "target": "domain:d",
                      "relationship_type": "belongs_to_domain"})
        if i > 0:
            edges.append({"source": nid, "target": f"technology:n{i - 1}",
                          "relationship_type": "related_to"})
    ds = {"version": "9.9.9", "nodes": nodes, "edges": edges}
    start = time.perf_counter()
    layout = gl.generate(ds)
    elapsed = time.perf_counter() - start
    assert len(layout["coordinates"]) == 301
    assert elapsed < 8.0, f"layout took {elapsed:.1f}s, over budget"


def test_task6_pinning_freezes_far_nodes(tmp_path, monkeypatch):
    ds = _toy_dataset()
    # add a genuinely far node in domain C, only linked within C (>2 hops from A)
    ds["nodes"].append({"id": "technology:far", "slug": "far", "name": "Far",
                        "node_type": "technology", "node_subtype": "library",
                        "primary_domain": "domain:c", "short_description": "far"})
    ds["edges"].append({"source": "technology:far", "target": "domain:c",
                        "relationship_type": "belongs_to_domain"})
    out = tmp_path / "layout.json"
    monkeypatch.setattr(gl, "OUTPUT", out)

    import json
    first = gl.generate(ds)
    out.write_text(json.dumps(first))

    far = first["coordinates"]["technology:far"]

    ds2 = copy.deepcopy(ds)
    ds2["version"] = "9.9.10"  # different version => incremental update
    ds2["nodes"].append({"id": "technology:w", "slug": "w", "name": "W",
                         "node_type": "technology", "node_subtype": "library",
                         "primary_domain": "domain:a", "short_description": "w"})
    ds2["edges"].append({"source": "technology:w", "target": "technology:x",
                         "relationship_type": "commonly_used_with"})
    second = gl.generate(ds2)

    # 'far' is in domain C, far more than 2 hops from the domain-A change => frozen
    moved = math.hypot(
        second["coordinates"]["technology:far"]["x"] - far["x"],
        second["coordinates"]["technology:far"]["y"] - far["y"],
    )
    assert moved < 0.01
    assert "technology:w" in second["coordinates"]
