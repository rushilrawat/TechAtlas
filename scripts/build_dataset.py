#!/usr/bin/env python3
"""Compile the seed fragment files into a single graph.json dataset.

Reads data/seed/{domains,concepts,technologies,edges}.json, assembles them into
one { version, nodes, edges } document, and writes data/graph.json.

This does NOT invent data — it only concatenates hand-curated fragments. Run
validate_dataset.py afterwards to enforce the data-quality rules.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
OUTPUT = ROOT / "data" / "graph.json"
DATASET_VERSION = "0.1.0"


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


def main() -> None:
    dataset = build()
    OUTPUT.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Built {OUTPUT.relative_to(ROOT)} — version {dataset['version']}: "
        f"{len(dataset['nodes'])} nodes, {len(dataset['edges'])} edges"
    )


if __name__ == "__main__":
    main()
