"""Pydantic models for the TechAtlas API.

Two response shapes intentionally exist (spec §10):
  - GraphNode / GraphEdge: lightweight, used for the initial whole-graph payload.
  - NodeDetail: rich, loaded on demand when a single node is selected.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    """Lightweight node for the initial graph render."""

    id: str
    slug: str
    label: str
    node_type: str
    node_subtype: str | None = None
    primary_domain: str
    x: float | None = None
    y: float | None = None
    cluster: str | None = None
    size: float = Field(description="Render radius hint, bounded by the layout scale.")
    color: str
    # Phase 1D: optional popularity signals. `popularity` is a 0..1 sourced adoption
    # score (null when no sourced data). `size_basis` explains what `size` reflects.
    popularity: float | None = None
    size_basis: str | None = None


class GraphEdge(BaseModel):
    """Lightweight edge for the initial graph render."""

    id: str
    source: str
    target: str
    relationship_type: str
    weight: float | None = None


class GraphResponse(BaseModel):
    version: str
    layout_version: str | None = None
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class NeighborEdge(BaseModel):
    relationship_type: str
    direction: str  # "out" | "in" | "undirected"
    node: GraphNode


class NodeSummary(BaseModel):
    """Wikipedia-sourced summary for a node (Phase 1C). Optional and additive."""

    extract: str
    source_url: str
    lang: str
    fetched_at: str
    license: str


class NodeDetail(BaseModel):
    """Full detail for a selected node, loaded on demand."""

    id: str
    slug: str
    name: str
    node_type: str
    node_subtype: str | None = None
    primary_domain: str
    short_description: str
    long_description: str | None = None
    official_url: str | None = None
    documentation_url: str | None = None
    wikipedia_title: str | None = None
    wikidata_id: str | None = None
    lifecycle_status: str = "active"
    aliases: list[str] = []
    color: str
    neighbors: list[NeighborEdge] = []
    # Phase 1D: popularity signals for the detail panel's honesty note.
    popularity: float | None = None
    size_basis: str | None = None
    # Phase 1C: Wikipedia summary, populated on demand when a curated title exists.
    # Null when there is no title or the fetch failed (graceful degradation).
    summary: NodeSummary | None = None


class SearchResult(BaseModel):
    id: str
    slug: str
    name: str
    node_type: str
    node_subtype: str | None = None
    primary_domain: str
    matched_on: str  # "name" | "alias" | "substring"


class DomainSummary(BaseModel):
    id: str
    slug: str
    name: str
    short_description: str
    color: str
    node_count: int
