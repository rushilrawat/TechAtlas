#!/usr/bin/env python3
"""Compile the seed fragment files into a single graph.json dataset.

Reads data/seed/{domains,concepts,technologies,edges}.json, assembles them into
one { version, nodes, edges } document, and writes data/graph.json.

This does NOT invent data — it only concatenates hand-curated fragments. Run
validate_dataset.py afterwards to enforce the data-quality rules.

It also rewrites the stats block in README.md (between the graph-stats markers) so
the published counts can never drift from the data.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
OUTPUT = ROOT / "data" / "graph.json"
README = ROOT / "README.md"
DATASET_VERSION = "0.7.0"
STATS_START = "<!-- graph-stats:start (written by scripts/build_dataset.py) -->"
STATS_END = "<!-- graph-stats:end -->"


def _load(name: str) -> list:
    path = SEED_DIR / name
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise SystemExit(f"{name} must contain a JSON array")
    return data


def build() -> dict:
    nodes = _load("domains.json") + _load("concepts.json") + _load("technologies.json")
    edges = _load("edges.json")
    return {"version": DATASET_VERSION, "nodes": nodes, "edges": edges}


def _label(rel: str) -> str:
    return rel.replace("_", " ")


def stats_markdown(dataset: dict, journeys: int) -> str:
    """The README stats block for a compiled dataset (pure, for testing)."""
    kinds = Counter(n["node_type"] for n in dataset["nodes"])
    rels = Counter(e["relationship_type"] for e in dataset["edges"])
    touched = {x for e in dataset["edges"] for x in (e["source"], e["target"])}
    isolated = sum(1 for n in dataset["nodes"] if n["id"] not in touched)
    top = ", ".join(f"**{_label(r)} ({c:,})**" for r, c in rels.most_common(4))
    rows = [
        ("Total nodes", len(dataset["nodes"])),
        ("Domains", kinds["domain"]),
        ("Technologies", kinds["technology"]),
        ("Concepts", kinds["concept"]),
        ("Typed relationships", len(dataset["edges"])),
        ("Relationship types", len(rels)),
        ("Curated guided paths", journeys),
        ("Isolated nodes", isolated),
    ]
    table = "\n".join(f"| {k} | **{v:,}** |" for k, v in rows)
    return (
        f"## 📊 The graph (dataset v{dataset['version']})\n\n"
        f"| | |\n|---|---:|\n{table}\n\n"
        f"The largest relationship groups are {top}. Counts come from the checked-in\n"
        "[`data/graph.json`](data/graph.json) and "
        "[`data/seed/journeys.json`](data/seed/journeys.json)\n"
        "and are rewritten by `scripts/build_dataset.py` on every `make data`; “isolated” means\n"
        "a node with no incident edge."
    )


def update_readme(dataset: dict) -> bool:
    """Replace the README stats block. Returns True if the file changed."""
    if not README.exists():
        return False
    journeys_path = SEED_DIR / "journeys.json"
    journeys = 0
    if journeys_path.exists():
        journeys = len(json.loads(journeys_path.read_text(encoding="utf-8")))
    text = README.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(STATS_START) + r".*?" + re.escape(STATS_END), re.S)
    if not pattern.search(text):
        return False
    block = f"{STATS_START}\n{stats_markdown(dataset, journeys)}\n{STATS_END}"
    new = pattern.sub(lambda _: block, text, count=1)
    if new != text:
        README.write_text(new, encoding="utf-8")
    return new != text


def main() -> None:
    dataset = build()
    OUTPUT.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Built {OUTPUT.relative_to(ROOT)} — version {dataset['version']}: "
        f"{len(dataset['nodes'])} nodes, {len(dataset['edges'])} edges"
    )
    if update_readme(dataset):
        print("Updated the stats block in README.md")


if __name__ == "__main__":
    main()
