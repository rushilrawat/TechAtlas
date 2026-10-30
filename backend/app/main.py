"""TechAtlas FastAPI application.

Versioned REST API (spec §10) serving the curated technology knowledge graph.
Lightweight whole-graph payload + on-demand node detail.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .graph_service import get_graph_service
from .models import (
    DomainSummary,
    GraphResponse,
    NeighborEdge,
    NodeDetail,
    SearchResult,
)

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
