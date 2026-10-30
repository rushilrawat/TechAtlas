"""TechAtlas FastAPI application.

Versioned REST API (spec §10) serving the curated technology knowledge graph.
Lightweight whole-graph payload + on-demand node detail.
"""
from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .graph_service import get_graph_service
from .models import (
    DomainSummary,
    GraphResponse,
    NeighborEdge,
    NodeDetail,
    NodeSummary,
    SearchResult,
)
from .summary_service import SummaryService

app = FastAPI(
    title="TechAtlas API",
    version="0.1.0",
    description="Serves the TechAtlas technology knowledge graph.",
)

# CORS: allow the local Vite dev server by default; override via env in production.
_origins = os.environ.get(
    "TECHATLAS_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)

API = "/api/v1"


@lru_cache(maxsize=1)
def get_summary_service() -> SummaryService:
    """Singleton SummaryService keyed to the current dataset version (Phase 1C)."""
    svc = get_graph_service()
    lang = os.environ.get("TECHATLAS_WIKIPEDIA_LANG", "en")
    ttl_days = int(os.environ.get("TECHATLAS_SUMMARY_TTL_DAYS", "30"))
    return SummaryService(svc.version, lang=lang, ttl_days=ttl_days)


@app.get("/health")
def health() -> dict[str, str]:
    svc = get_graph_service()
    return {"status": "ok", "version": svc.version}


@app.get(f"{API}/graph", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    svc = get_graph_service()
    nodes, edges = svc.graph()
    return GraphResponse(
        version=svc.version,
        layout_version=svc.layout_version,
        nodes=nodes,
        edges=edges,
    )


@app.get(f"{API}/domains", response_model=list[DomainSummary])
def get_domains() -> list[DomainSummary]:
    return get_graph_service().domains()


@app.get(f"{API}/nodes/{{slug}}", response_model=NodeDetail)
def get_node(slug: str) -> NodeDetail:
    detail = get_graph_service().node_detail(slug)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Node '{slug}' not found")
    # Phase 1C: attach a Wikipedia summary when a curated title exists. Served from
    # cache where possible; failures degrade to None (the UI keeps the outbound link).
    summary = get_summary_service().get(detail.slug, detail.wikipedia_title)
    if summary is not None:
        detail.summary = NodeSummary(**summary.__dict__)
    return detail


@app.get(f"{API}/nodes/{{slug}}/neighbors", response_model=list[NeighborEdge])
def get_neighbors(slug: str) -> list[NeighborEdge]:
    result = get_graph_service().neighbors(slug)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Node '{slug}' not found")
    return result


@app.get(f"{API}/search", response_model=list[SearchResult])
def search(
    q: str = Query(..., min_length=1, description="Search term; matches names and aliases."),
    limit: int = Query(20, ge=1, le=100),
) -> list[SearchResult]:
    return get_graph_service().search(q, limit=limit)
