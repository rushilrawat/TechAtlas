// Types mirroring the backend API responses (backend/app/models.py).
// Kept in one place so components share a single source of truth.

export type NodeType = "domain" | "concept" | "technology";

export interface GraphNode {
  id: string;
  slug: string;
  label: string;
  node_type: NodeType;
  node_subtype: string | null;
  primary_domain: string;
  x: number | null;
  y: number | null;
  cluster: string | null;
  size: number;
  color: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  weight: number | null;
}

export interface GraphResponse {
  version: string;
  layout_version: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type EdgeDirection = "in" | "out" | "undirected";

export interface NeighborEdge {
  relationship_type: string;
  direction: EdgeDirection;
  node: GraphNode;
}

export interface NodeSummary {
  extract: string;
  source_url: string;
  lang: string;
  fetched_at: string;
  license: string;
}

export interface NodeDetail {
  id: string;
  slug: string;
  name: string;
  node_type: NodeType;
  node_subtype: string | null;
  primary_domain: string;
  short_description: string;
  long_description: string | null;
  official_url: string | null;
  documentation_url: string | null;
  wikipedia_title: string | null;
  wikidata_id: string | null;
  lifecycle_status: string;
  aliases: string[];
  color: string;
  neighbors: NeighborEdge[];
  popularity?: number | null;
  size_basis?: string | null;
  summary?: NodeSummary | null;
}

export interface SearchResult {
  id: string;
  slug: string;
  name: string;
  node_type: NodeType;
  node_subtype: string | null;
  primary_domain: string;
  matched_on: string;
}

export interface DomainSummary {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  color: string;
  node_count: number;
}
