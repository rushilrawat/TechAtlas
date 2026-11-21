"""The content pass for the 3,000-node atlas (scripts/expand/content_3000.py) is fully
applied and its references stay valid against the compiled graph."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed"
SCRIPT = ROOT / "scripts" / "expand" / "content_3000.py"


def _seed(name):
    return json.loads((SEED / name).read_text(encoding="utf-8"))


def test_content_pass_is_applied_and_valid():
    result = subprocess.run([sys.executable, str(SCRIPT), "--check"], cwd=ROOT,
                            capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stdout + result.stderr


def test_every_top_level_field_has_a_guided_path():
    graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in graph["nodes"]}
    domains = {n["id"] for n in graph["nodes"] if n["node_type"] == "domain"}
    covered = set()
    for path in _seed("journeys.json"):
        for step in path["steps"]:
            node = nodes[step["id"]]
            covered.add(node["id"] if node["node_type"] == "domain" else node.get("primary_domain"))
    assert sorted(domains - covered) == []


def test_role_ids_are_unique_and_every_role_has_four_stages():
    roles = _seed("roles.json")
    assert len({r["id"] for r in roles}) == len(roles)
    assert all(len(r["stages"]) == 4 for r in roles)
