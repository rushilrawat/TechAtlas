// Pure overlay logic for Repo X-Ray (Phase 1.5B). Derives, from a scan result + the
// loaded graph, exactly which canonical nodes to emphasize (and with what status) and
// which EXISTING edges to highlight. Never invents nodes or edges; a detected pair is
// highlighted only if the base graph already has an edge between them (spec §5.6).

import type { DetectionStatus, GraphResponse, RepoScan } from "../api/types";

export interface ScanOverlay {
  // node id -> detection status, for nodes that exist in the graph.
  statusByNode: Map<string, DetectionStatus>;
  // ids of existing edges whose BOTH endpoints are detected (highlight these).
  highlightEdges: Set<string>;
  // ids of existing edges with EXACTLY ONE detected endpoint (contextual: a detected
  // node's link to the surrounding graph). Rendered fainter than verified edges so the
  // detected stack's immediate context is visible without a spiderweb (UI-A).
  contextualEdges: Set<string>;
  // detected node ids present in the graph (for camera fit + dimming).
  detectedNodes: Set<string>;
}

export function buildOverlay(scan: RepoScan, graph: GraphResponse): ScanOverlay {
  const graphNodeIds = new Set(graph.nodes.map((n) => n.id));
  const statusByNode = new Map<string, DetectionStatus>();
  const detectedNodes = new Set<string>();

  for (const d of scan.detections) {
    if (!graphNodeIds.has(d.node_id)) continue; // only canonical, existing nodes
    statusByNode.set(d.node_id, d.detection_status);
    detectedNodes.add(d.node_id);
  }

  // Classify EXISTING edges only (repository co-occurrence is NOT a relationship; we
  // never add edges): both endpoints detected -> verified highlight; exactly one
  // detected -> contextual; neither -> left as quiet background.
  const highlightEdges = new Set<string>();
  const contextualEdges = new Set<string>();
  for (const e of graph.edges) {
    const s = detectedNodes.has(e.source);
    const t = detectedNodes.has(e.target);
    if (s && t) highlightEdges.add(e.id);
    else if (s || t) contextualEdges.add(e.id);
  }

  return { statusByNode, highlightEdges, contextualEdges, detectedNodes };
}

// Bounding box of the detected nodes' precomputed coordinates, for camera fit.
export function detectedBounds(
  overlay: ScanOverlay,
  graph: GraphResponse,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const n of graph.nodes) {
    if (!overlay.detectedNodes.has(n.id)) continue;
    if (n.x == null || n.y == null) continue;
    any = true;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  return any ? { minX, minY, maxX, maxY } : null;
}
