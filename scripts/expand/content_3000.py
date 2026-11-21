"""Content pass for the 3,000-node atlas: guided paths, roles and famous apps.

Appends content_3000_paths.PATHS to data/seed/journeys.json, content_3000_roles.ROLES to
data/seed/roles.json, and content_3000_apps (new apps plus additions to existing ones) to
data/seed/apps.json. Idempotent: entries already present (by title / id / tech) are left
alone. Checks every reference against data/graph.json first and refuses to write if a
path step lacks an edge to the next one, a slug is unknown, or an app names a non-technology.

Run from the repo root after build_dataset.py: python scripts/expand/content_3000.py [--check]
--check exits non-zero if anything would still change.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from accuracy_pass import load, save, save_apps  # noqa: E402
from content_3000_apps import APP_ADDITIONS, NEW_APPS  # noqa: E402
from content_3000_paths import PATHS  # noqa: E402
from content_3000_roles import ROLES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed"


def _graph():
    g = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
    by_slug = {n["slug"]: n for n in g["nodes"]}
    pairs = {frozenset((e["source"], e["target"])) for e in g["edges"]}
    return by_slug, pairs


def check() -> list[str]:
    by_slug, pairs = _graph()
    errors: list[str] = []
    titles = set()
    for title, steps in PATHS:
        if title in titles:
            errors.append(f"duplicate path title: {title}")
        titles.add(title)
        ids = []
        for slug, caption in steps:
            if slug not in by_slug:
                errors.append(f"path '{title}': unknown slug {slug}")
            elif not caption.strip():
                errors.append(f"path '{title}': {slug} has no caption")
            ids.append(by_slug.get(slug, {}).get("id"))
        if len(set(ids)) != len(ids):
            errors.append(f"path '{title}' repeats a step")
        for a, b in zip(ids, ids[1:]):
            if a and b and frozenset((a, b)) not in pairs:
                errors.append(f"path '{title}': no edge {a} - {b}")
    for role in ROLES:
        slugs = [s for st in role["stages"] for s in st["nodes"]]
        errors += [f"role {role['id']}: unknown slug {s}" for s in slugs if s not in by_slug]
        if len(set(slugs)) != len(slugs):
            errors.append(f"role {role['id']} repeats a node")
    tech = {s for s, n in by_slug.items() if n["node_type"] == "technology"}
    labels = {n["name"].lower() for n in by_slug.values()}
    for app in NEW_APPS:
        errors += [f"app {app['id']}: {e['tech']} is not a technology" for e in app["stack"] if e["tech"] not in tech]
        errors += [f"app {app['id']}: not_in_atlas '{x}' is an atlas node" for x in app["not_in_atlas"] if x.lower() in labels]
    for aid, extra in APP_ADDITIONS.items():
        errors += [f"app {aid}: {e['tech']} is not a technology" for e in extra if e["tech"] not in tech]
    return errors


def apply() -> bool:
    by_slug, _ = _graph()
    changed = False

    journeys = load("journeys.json")
    have = {j["title"] for j in journeys}
    for title, steps in PATHS:
        if title not in have:
            journeys.append({"title": title, "steps": [{"id": by_slug[s]["id"], "caption": c} for s, c in steps]})
            changed = True
    if changed:
        save("journeys.json", journeys)

    roles = load("roles.json")
    role_ids = {r["id"] for r in roles}
    new_roles = [r for r in ROLES if r["id"] not in role_ids]
    if new_roles:
        save_roles(roles + new_roles)
        changed = True

    apps = load("apps.json")
    apps_changed = False
    app_ids = {a["id"] for a in apps}
    for app in apps:
        for entry in APP_ADDITIONS.get(app["id"], []):
            if all(s["tech"] != entry["tech"] for s in app["stack"]):
                app["stack"].append(entry)
                apps_changed = True
    for app in NEW_APPS:
        if app["id"] not in app_ids:
            apps.append(app)
            apps_changed = True
    if apps_changed:
        save_apps(apps)
    return changed or apps_changed


def save_roles(roles: list[dict]) -> None:
    """roles.json keeps one line per stage, like the hand-written file."""
    def one(v):
        return json.dumps(v, ensure_ascii=False)
    blocks = []
    for r in roles:
        stages = ",\n".join(f"      {one(s)}" for s in r["stages"])
        head = ",\n".join(f"    {one(k)}: {one(v)}" for k, v in r.items() if k != "stages")
        blocks.append("  {\n" + head + ',\n    "stages": [\n' + stages + "\n    ]\n  }")
    (SEED / "roles.json").write_text("[\n" + ",\n".join(blocks) + "\n]\n", encoding="utf-8")


def main() -> None:
    errors = check()
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    if "--check" in sys.argv:
        before = {f: (SEED / f).read_text(encoding="utf-8") for f in ("journeys.json", "roles.json", "apps.json")}
        apply()
        after = {f: (SEED / f).read_text(encoding="utf-8") for f in before}
        for f, text in before.items():
            (SEED / f).write_text(text, encoding="utf-8")
        stale = [f for f in before if before[f] != after[f]]
        if stale:
            print("content_3000 has changes left to apply:", ", ".join(stale))
            sys.exit(1)
        print("content_3000: up to date")
        return
    print("content_3000:", "applied" if apply() else "nothing to do")


if __name__ == "__main__":
    main()
