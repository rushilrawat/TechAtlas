"""Report-card builder for the example scans (scripts/build_report_cards.py)."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("PIL")
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import build_report_cards as rc  # noqa: E402


def _node(nid, label, kind, domain, size):
    return {"id": nid, "slug": nid.split(":")[1], "label": label, "node_type": kind,
            "primary_domain": domain, "size": size}


def _domain(did, name, parent=None):
    return {"id": did, "name": name, "color": "#888", "parent_id": parent}


NODES = {n["id"]: n for n in [
    _node("technology:react", "React", "technology", "domain:frontend", 5),
    _node("concept:caching", "Caching", "concept", "domain:db-sub", 1),
]}
DOMAINS = {d["id"]: d for d in [
    _domain("domain:frontend", "Frontend"),
    _domain("domain:backend", "Backend"),
    _domain("domain:db-sub", "Sub", "domain:backend"),
]}
SCAN = {"repository": {"owner": "acme", "name": "shop"},
        "detections": [{"node_id": "technology:react"}, {"node_id": "concept:caching"},
                       {"node_id": "technology:react"}, {"node_id": "technology:gone"}]}


def test_report_groups_by_top_level_field():
    r = rc.build_report(SCAN, NODES, DOMAINS)
    assert r["repo"] == "acme/shop"
    assert (r["technologies"], r["concepts"]) == (1, 1)
    assert [f["id"] for f in r["fields"]] == ["domain:backend", "domain:frontend"]
    assert rc.headline(r) == "shop uses 1 technology across 2 fields"


def test_badge_and_card(tmp_path):
    assert "Mapped by TechAtlas: 16 technologies" in rc.badge_svg(16)
    out = tmp_path / "card.png"
    rc.card_png(rc.build_report(SCAN, NODES, DOMAINS), out)
    assert out.stat().st_size > 1000
