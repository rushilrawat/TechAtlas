"""Runner for the 3,000-node push (dataset 0.9.0): merges atlas_3000_*.py into the seed.

Reuses the 2,000-node runner's builder, so the same DSL, endpoint downgrades and checks
apply. Run from the repo root after atlas_2000.py: python scripts/expand/atlas_3000.py [--check]
"""
from __future__ import annotations

import json
import re
import sys

from _apply import SEED, apply_batch
import atlas_2000
import atlas_3000_a
import atlas_3000_b
import atlas_3000_c

PARTS = [atlas_3000_a, atlas_3000_b, atlas_3000_c]

# not_in_atlas labels that are atlas nodes from 0.9.0 on: (label, tech, layer, note).
APP_MOVES = {
    "stripe": [("Sorbet", "sorbet", "backend", "Type checker for its Ruby codebase (built at Stripe)")],
    "lyft": [("Amundsen", "amundsen", "data", "Data discovery (built at Lyft)")],
}


def update_apps() -> None:
    from accuracy_pass import load, save_apps
    apps = load("apps.json")
    for app in apps:
        for label, tech, layer, note in APP_MOVES.get(app["id"], []):
            if label in app["not_in_atlas"]:
                app["not_in_atlas"].remove(label)
            if all(s["tech"] != tech for s in app["stack"]):
                app["stack"].append({"tech": tech, "layer": layer, "note": note})
    save_apps(apps)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def name_clashes(nodes):
    """New nodes whose name or alias matches an existing node's name or alias."""
    existing = {}
    for f in ("concepts.json", "technologies.json"):
        for n in json.loads((SEED / f).read_text(encoding="utf-8")):
            for a in [n["name"], *n.get("aliases", [])]:
                existing.setdefault(_norm(a), n["id"])
    out = []
    for n in nodes:
        for a in [n["name"], *n.get("aliases", [])]:
            hit = existing.get(_norm(a))
            if hit and hit != n["id"]:
                out.append(f"name '{a}' of {n['id']} already used by {hit}")
    return out


def main() -> None:
    check = "--check" in sys.argv
    nodes, extra = [], []
    for part in PARTS:
        nodes.extend(part.NODES)
        extra.extend(getattr(part, "EXTRA", []))
    concepts, techs, edges, problems = atlas_2000.build(nodes, extra)
    new = concepts + techs
    problems += name_clashes(new)
    problems += atlas_2000.typed_degree_problems({n["id"] for n in new}, edges)
    print(f"authored {len(nodes)} nodes; new: {len(concepts)} concepts, {len(techs)} "
          f"technologies, {len(edges)} edges")
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  " + p)
        if not check:
            raise SystemExit(1)
        return
    if not check:
        apply_batch("atlas-3000", concepts=concepts, technologies=techs, edges=edges)
        update_apps()


if __name__ == "__main__":
    main()
