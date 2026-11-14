"""Connectivity rules in validate_dataset and the README stats block in build_dataset."""
from __future__ import annotations

import build_dataset as bd
import validate_dataset as vd


def _node(nid: str, domain: str = "domain:d") -> dict:
    kind, slug = nid.split(":", 1)
    return {"id": nid, "slug": slug, "name": slug, "node_type": kind,
            "primary_domain": domain, "short_description": "x"}


def _dataset(edges: list[tuple[str, str, str]]) -> dict:
    ids = ["domain:d", "concept:a", "concept:b", "concept:c"]
    return {
        "version": "t",
        "nodes": [_node(i) for i in ids],
        "edges": [{"source": s, "target": t, "relationship_type": r} for s, r, t in edges],
    }


SPOKES = [(c, "belongs_to_domain", "domain:d") for c in ("concept:a", "concept:b", "concept:c")]
TRIANGLE = [("concept:a", "related_to", "concept:b"), ("concept:b", "related_to", "concept:c"),
            ("concept:a", "related_to", "concept:c")]


def test_triangle_with_spokes_is_valid():
    report = vd.validate(_dataset(SPOKES + TRIANGLE))
    assert report.errors == []


def test_single_typed_relationship_is_an_error():
    report = vd.validate(_dataset(SPOKES + TRIANGLE[:2]))
    assert any("only 1 typed relationship" in e and "concept:a" in e for e in report.errors)


def test_missing_domain_spoke_is_an_error():
    report = vd.validate(_dataset(SPOKES[1:] + TRIANGLE))
    assert any("no belongs_to_domain edge" in e and "concept:a" in e for e in report.errors)


def test_below_target_is_one_summary_warning():
    report = vd.validate(_dataset(SPOKES + TRIANGLE))
    thin = [w for w in report.warnings if "fewer than" in w]
    assert len(thin) == 1 and thin[0].startswith("3 node(s)")


def test_id_slug_mismatch_warns():
    ds = _dataset(SPOKES + TRIANGLE)
    ds["nodes"][1]["slug"] = "other"
    report = vd.validate(ds)
    assert any("differs from its slug" in w for w in report.warnings)


def test_stats_markdown_counts():
    md = bd.stats_markdown(_dataset(SPOKES + TRIANGLE), journeys=7)
    assert "dataset vt" in md
    assert "| Total nodes | **4** |" in md
    assert "| Concepts | **3** |" in md
    assert "| Typed relationships | **6** |" in md
    assert "| Curated guided paths | **7** |" in md
    assert "| Isolated nodes | **0** |" in md
