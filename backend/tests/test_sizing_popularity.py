"""Phase 1D sizing tests: popularity path vs connectivity fallback, bounds, and the
shared popularity loader (scripts/sizing.py)."""
from __future__ import annotations

import json

from sizing import (
    SIZE_TECH,
    load_popularity,
    node_radius,
    radii_for_dataset,
)

TECH = {"id": "technology:x", "node_type": "technology", "primary_domain": "domain:a"}


def test_popularity_path_overrides_connectivity():
    # With no edges, connectivity norm is 0 -> radius at the band floor.
    conn = node_radius(TECH, degree={}, max_tech_deg=1, popularity=None)
    assert conn == SIZE_TECH[0]
    # A high popularity score sizes near the band ceiling instead.
    pop = node_radius(TECH, degree={}, max_tech_deg=1, popularity=1.0)
    assert pop == SIZE_TECH[1]
    assert pop > conn


def test_popularity_is_bounded_and_sqrt_scaled():
    lo, hi = SIZE_TECH
    r0 = node_radius(TECH, {}, 1, popularity=0.0)
    r_mid = node_radius(TECH, {}, 1, popularity=0.25)
    r1 = node_radius(TECH, {}, 1, popularity=1.0)
    assert r0 == lo and r1 == hi
    # sqrt(0.25) = 0.5 -> exactly halfway up the band
    assert abs(r_mid - (lo + (hi - lo) * 0.5)) < 0.01


def test_popularity_clamped_out_of_range():
    lo, hi = SIZE_TECH
    assert node_radius(TECH, {}, 1, popularity=-5.0) == lo
    assert node_radius(TECH, {}, 1, popularity=5.0) == hi


def test_domain_and_concept_ignore_popularity():
    dom = {"id": "domain:a", "node_type": "domain", "importance": 1.0}
    con = {"id": "concept:a", "node_type": "concept", "importance": 0.5}
    # passing a popularity value must not change non-technology sizing
    assert node_radius(dom, {}, 1, popularity=1.0) == node_radius(dom, {}, 1, None)
    assert node_radius(con, {}, 1, popularity=1.0) == node_radius(con, {}, 1, None)


def test_radii_for_dataset_mixes_popularity_and_connectivity():
    nodes = [
        {"id": "technology:pop", "node_type": "technology", "primary_domain": "domain:a"},
        {"id": "technology:conn", "node_type": "technology", "primary_domain": "domain:a"},
        {"id": "technology:hub", "node_type": "technology", "primary_domain": "domain:a"},
        {"id": "domain:a", "node_type": "domain", "primary_domain": "domain:a", "importance": 1.0},
    ]
    # hub has the highest degree (3), conn has a low degree (1), so conn normalizes
    # below the ceiling. pop is scored, so it ignores connectivity entirely.
    edges = [
        {
            "source": "technology:conn", "target": "domain:a",
            "relationship_type": "belongs_to_domain",
        },
        {
            "source": "technology:hub", "target": "domain:a",
            "relationship_type": "belongs_to_domain",
        },
        {
            "source": "technology:hub", "target": "technology:conn",
            "relationship_type": "related_to",
        },
        {
            "source": "technology:hub", "target": "technology:pop",
            "relationship_type": "related_to",
        },
    ]
    radii = radii_for_dataset(nodes, edges, {"technology:pop": 1.0})
    # the scored tech sits at the ceiling; the unscored low-degree one is below it
    assert radii["technology:pop"] == SIZE_TECH[1]
    assert radii["technology:conn"] < SIZE_TECH[1]


def test_load_popularity_missing_file(tmp_path):
    assert load_popularity(tmp_path / "nope.json") == {}


def test_load_popularity_parses_scores(tmp_path):
    p = tmp_path / "popularity.json"
    p.write_text(
        json.dumps(
            {
                "scores": {
                    "technology:a": {"score": 0.9, "metrics": {}},
                    "technology:b": {"score": 0.1, "metrics": {}},
                    "technology:bad": {"metrics": {}},  # no score -> skipped
                }
            }
        )
    )
    loaded = load_popularity(p)
    assert loaded == {"technology:a": 0.9, "technology:b": 0.1}


# --- P3 item 13: served size must stay consistent with size_basis even when the
# committed layout was generated WITHOUT popularity data (stale layout radius) -----

def test_size_consistent_with_popularity_basis_over_stale_layout(tmp_path):
    import json
    import shutil
    from pathlib import Path

    from sizing import SIZE_TECH

    from app.graph_service import GraphService

    root = Path(__file__).resolve().parent.parent.parent
    shutil.copy(root / "data" / "graph.json", tmp_path / "graph.json")
    shutil.copy(root / "data" / "layout.json", tmp_path / "layout.json")
    # layout.json here is connectivity-based (no popularity). Add popularity scoring
    # react at 0.0 -> the served size MUST be the popularity radius (floor), not the
    # stale connectivity radius from the layout.
    (tmp_path / "popularity.json").write_text(
        json.dumps({"scores": {"technology:react": {"score": 0.0, "metrics": {}}}})
    )
    svc = GraphService(data_dir=tmp_path)
    nodes, _ = svc.graph()
    react = next(n for n in nodes if n.id == "technology:react")
    assert react.size_basis == "popularity"
    assert react.popularity == 0.0
    assert abs(react.size - SIZE_TECH[0]) < 0.01  # floor, consistent with score 0.0
