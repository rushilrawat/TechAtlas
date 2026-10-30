"""Phase 1.5C matcher/dataset-expansion tests (design Properties 1, 6, 7, 8, 19)."""
from __future__ import annotations

import json
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from app.graph_service import GraphService
from app.scanner.technology_matcher import TechnologyMatcher

_ROOT = Path(__file__).resolve().parents[2]


def _matcher():
    return TechnologyMatcher(GraphService().all_nodes())


def test_cargo_ecosystem_normalizes_to_crates():
    g = json.loads((_ROOT / "data" / "graph.json").read_text())
    crate = next((n for n in g["nodes"]
                  if isinstance(n.get("package"), dict)
                  and n["package"]["ecosystem"] == "crates"), None)
    assert crate is not None, "need at least one crates node to test normalization"
    m = _matcher()
    assert m.match_package("cargo", crate["package"]["name"]) == crate["id"]


def test_python_import_alias_resolves():
    m = _matcher()
    # sklearn -> scikit-learn distribution, which has a canonical node.
    assert m.match_package("pypi", "sklearn") == "technology:scikit-learn"


def test_unknown_import_stays_unmapped_not_fabricated():
    m = _matcher()
    assert m.match_package("pypi", "this-package-does-not-exist-xyz-123") is None
    assert m.match_package("cargo", "nonexistent-crate-xyz-123") is None
    assert m.match_package("go", "example.com/nobody/nothing") is None


def test_no_loose_substring_match():
    m = _matcher()
    # A name that merely CONTAINS 'react' must not resolve to React.
    assert m.match_package("npm", "react-is-not-this-package-xyzzy") != "technology:react"


def test_mapping_version_bumped_to_0_3_0():
    g = json.loads((_ROOT / "data" / "graph.json").read_text())
    assert g["version"] == "0.3.0"


def test_import_aliases_file_is_valid_json_and_expanded():
    aliases = json.loads((_ROOT / "backend" / "app" / "scanner"
                          / "import_aliases.json").read_text())
    assert "sklearn" in aliases["pypi"] and "dateutil" in aliases["pypi"]


# ---- property: every resolved node id is a real canonical node (Property 1/6) ----

@settings(max_examples=150)
@given(
    eco=st.sampled_from(["npm", "pypi", "cargo", "go", "maven"]),
    name=st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789-._/", min_size=1, max_size=20),
)
def test_property_resolution_is_always_a_real_node_or_none(eco, name):
    m = _matcher()
    hit = m.match_package(eco, name)
    assert hit is None or m.has(hit)
