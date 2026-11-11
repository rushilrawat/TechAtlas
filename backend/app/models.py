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
    ring: int = 0
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


class OverviewAggregateMarker(BaseModel):
    """A precomputed overview level-of-detail marker: a presentation stand-in for a group
    of member nodes within a domain sector (atlas-overview-collision-free). Graph-space
    centroid + covering radius; member_ids/count are the exact underlying canonical nodes.
    A marker is NOT a canonical node or relationship — it only drives the collision-free
    overview, and the frontend expands it to its members on zoom/focus."""

    id: str
    x: float
    y: float
    radius: float
    member_ids: list[str]
    count: int
    # direct_count = members whose OWN primary_domain is this domain (matches the sidebar
    # members-only count); `count` is the whole spatial territory incl. nested subdomains.
    direct_count: int


class OverviewAggregate(BaseModel):
    """All overview LOD markers for one top-level domain sector."""

    domain_id: str
    markers: list[OverviewAggregateMarker]


class GraphResponse(BaseModel):
    version: str
    layout_version: str | None = None
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # Additive overview LOD groupings (deterministic, from layout.json). Empty when the
    # layout predates aggregation. Never alters nodes/edges/canonical truth.
    overview_aggregates: list[OverviewAggregate] = Field(default_factory=list)
    edge_tiers: dict[str, str] = Field(default_factory=dict)


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
    # Parent domain id when this is a nested subdomain (via a non-root has_subdomain
    # edge); None for the 14 top-level domains. Lets the UI nest subdomains in the legend.
    parent_id: str | None = None
