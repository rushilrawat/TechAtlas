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

// ---- Repo X-Ray scanner (Phase 1.5B) ----
// Mirrors backend/app/scanner/models.py. Additive; existing types unchanged.

export type DetectionStatus = "confirmed" | "declared" | "inferred" | "related";
export type ScanStatus = "completed" | "partial" | "failed";

export interface ScanEvidence {
  id: string;
  node_id: string;
  type: string;
  file_path: string;
  description: string;
  detection_status: DetectionStatus;
  source_url: string;
  rule: string;
  scanner_version: string;
  line: number | null;
}

export interface ScanDetection {
  node_id: string;
  node_type: "technology" | "concept";
  role: string;
  detection_status: DetectionStatus;
  evidence_ids: string[];
  component_paths: string[];
}

export interface UnmappedPackage {
  name: string;
  ecosystem: string;
  detection_status: DetectionStatus;
  evidence_ids: string[];
}

export interface ScanRepository {
  owner: string;
  name: string;
  url: string;
  default_branch: string;
  commit_sha: string;
  description: string | null;
  primary_language: string | null;
  stars: number | null;
}

export interface ScanCoverage {
  files_listed: number;
  files_inspected: number;
  manifests_inspected: number;
  source_files_inspected: number;
  files_skipped_limit: number;
  tree_truncated: boolean;
  partial: boolean;
  notes: string[];
}

export interface ScanSummary {
  matched_technology_count: number;
  matched_concept_count: number;
  unmapped_package_count: number;
}

export interface RepoScan {
  scan_id: string;
  status: ScanStatus;
  scanner_version: string;
  mapping_version: string;
  repository: ScanRepository;
  summary: ScanSummary;
  coverage: ScanCoverage;
  detections: ScanDetection[];
  evidence: ScanEvidence[];
  unmapped: UnmappedPackage[];
}

export interface ScanErrorBody {
  error: string; // invalid_url | not_found | rate_limited | github_error | ...
  message: string;
  retry_after_seconds?: number | null;
}
