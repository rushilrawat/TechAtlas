#!/usr/bin/env python3
"""Render the TechAtlas API responses to STATIC JSON files for GitHub Pages.

GitHub Pages serves static files only — it cannot run the FastAPI backend. But the
whole API is a pure function of the committed dataset + layout (+ optional popularity),
so we can pre-render every endpoint's payload to files and have the frontend fetch those
in production. This reuses GraphService so the static output is byte-for-byte the same
shape the live API serves.

Output (under frontend/public/api/v1/ so Vite copies it into the build):
  graph.json                 -> GET /api/v1/graph
  domains.json               -> GET /api/v1/domains
  nodes/<slug>.json          -> GET /api/v1/nodes/<slug>   (one per node)
  search-index.json          -> all nodes, for client-side search

Wikipedia summaries are intentionally NOT baked in: they require a live fetch and are
cached per-visitor-less server. In static mode the detail panel simply shows the curated
fields + the outbound Wikipedia link (the same graceful-degradation path the backend uses
when a summary is unavailable). This keeps the static build reproducible and offline.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_APP = ROOT / "backend"
OUT = ROOT / "frontend" / "public" / "api" / "v1"

# Import the backend's GraphService so static output matches the live API exactly.
if str(BACKEND_APP) not in sys.path:
    sys.path.insert(0, str(BACKEND_APP))

from app.graph_service import GraphService  # noqa: E402


def _dump(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _model(obj):
    """Serialize a pydantic model (v2 or v1) to a plain dict."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return obj.dict()


def main() -> None:
    svc = GraphService()

    # /graph
    nodes, edges = svc.graph()
    graph_payload = {
        "version": svc.version,
        "layout_version": svc.layout_version,
        "nodes": [_model(n) for n in nodes],
        "edges": [_model(e) for e in edges],
    }
    _dump(OUT / "graph.json", graph_payload)

    # /domains
    _dump(OUT / "domains.json", [_model(d) for d in svc.domains()])

    # /nodes/<slug>  (one file per node; summary omitted in static mode)
    node_count = 0
    for raw in svc._raw_nodes.values():
        detail = svc.node_detail(raw["id"])
        if detail is None:
            continue
        _dump(OUT / "nodes" / f"{detail.slug}.json", _model(detail))
        node_count += 1

    # search-index: everything the client needs to search names + aliases offline
    search_index = [
        {
            "id": n["id"],
            "slug": n["slug"],
            "name": n["name"],
            "node_type": n["node_type"],
            "node_subtype": n.get("node_subtype"),
            "primary_domain": n["primary_domain"],
            "aliases": n.get("aliases", []),
        }
        for n in svc._raw_nodes.values()
    ]
    _dump(OUT / "search-index.json", search_index)

    print(
        f"[static-api] wrote {OUT.relative_to(ROOT)}: graph.json, domains.json, "
        f"{node_count} node files, search-index.json (version {svc.version})"
    )


if __name__ == "__main__":
    main()
