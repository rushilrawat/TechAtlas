// Stack View layout (Repo X-Ray UX correction). PURE + deterministic: given the detected
// nodes (with domain + status + size) it computes TEMPORARY per-node render coordinates
// that group technologies into readable domain clusters, plus a heading anchor per cluster.
//
// It never mutates canonical coordinates — GraphCanvas applies these as a view-level
// projection and restores the originals on exit. No fabricated relationships: clustering is
// a VISUAL grouping by canonical primary_domain, distinct from verified graph edges.

export interface StackNodeInput {
  id: string;
  primaryDomain: string;      // canonical primary_domain
  nodeType: "domain" | "concept" | "technology";
  status: "confirmed" | "declared" | "inferred" | "related";
  size: number;               // canonical render size (popularity proxy)
  prominence: number;         // higher = more important (framework/lang/db > concept/format)
}

export interface StackCluster {
  domainId: string;
  heading: { x: number; y: number };
  nodeIds: string[];
}

export interface StackLayout {
  // node id -> temporary render position (graph-space, same units as canonical coords).
  positions: Map<string, { x: number; y: number }>;
  clusters: StackCluster[];
  // bounding box of the whole stack (for camera fit).
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

// Deterministic ordering of domains so cluster placement is stable across renders.
function domainOrder(domainIds: string[]): string[] {
  return [...domainIds].sort();
}

/**
 * Lay detected nodes into a grid of domain clusters. Deterministic: same input -> same
 * output. Clusters are arranged in a grid; within a cluster, nodes are packed in rows,
 * highest-prominence first (so primary frameworks/languages sit at the cluster's top-left).
 */
export function computeStackLayout(
  nodes: StackNodeInput[],
  opts: {
    clusterGapX?: number;   // horizontal gap between cluster centers
    clusterGapY?: number;   // vertical gap between cluster centers
    nodeGap?: number;       // gap between nodes within a cluster
    cols?: number;          // cluster grid columns
    nodeCols?: number;      // node columns within a cluster
  } = {},
): StackLayout {
  // Gaps are in canonical graph-coordinate units (the universe spans ~2300x2300), so
  // clusters and nodes get real separation instead of collapsing into a central blob.
  const clusterGapX = opts.clusterGapX ?? 1500;
  const clusterGapY = opts.clusterGapY ?? 1100;
  const nodeGap = opts.nodeGap ?? 300;
  const nodeCols = opts.nodeCols ?? 3;

  // group by domain
  const byDomain = new Map<string, StackNodeInput[]>();
  for (const n of nodes) {
    const list = byDomain.get(n.primaryDomain) ?? [];
    list.push(n);
    byDomain.set(n.primaryDomain, list);
  }
  const domains = domainOrder([...byDomain.keys()]);
  const cols = opts.cols ?? Math.min(3, Math.max(1, Math.ceil(Math.sqrt(domains.length))));

  const positions = new Map<string, { x: number; y: number }>();
  const clusters: StackCluster[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  domains.forEach((domainId, ci) => {
    const members = byDomain.get(domainId)!;
    // within-cluster order: prominence desc, then size desc, then id asc (deterministic)
    members.sort((a, b) =>
      b.prominence - a.prominence || b.size - a.size || (a.id < b.id ? -1 : 1),
    );
    const gx = (ci % cols) * clusterGapX;
    const gy = Math.floor(ci / cols) * clusterGapY;
    // heading sits above the cluster's node block
    const heading = { x: gx, y: gy - 60 };
    clusters.push({ domainId, heading, nodeIds: members.map((m) => m.id) });

    members.forEach((m, i) => {
      const r = Math.floor(i / nodeCols);
      const c = i % nodeCols;
      const x = gx + (c - (nodeCols - 1) / 2) * nodeGap;
      const y = gy + r * nodeGap;
      positions.set(m.id, { x, y });
      minX = Math.min(minX, x); minY = Math.min(minY, y - 60);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  // Re-center the whole layout on the origin so the camera frames it symmetrically and it
  // sits where the universe used to, avoiding an off-center jump.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (const [id, pos] of positions) positions.set(id, { x: pos.x - cx, y: pos.y - cy });
  for (const c of clusters) c.heading = { x: c.heading.x - cx, y: c.heading.y - cy };
  return {
    positions, clusters,
    bounds: { minX: minX - cx, minY: minY - cy, maxX: maxX - cx, maxY: maxY - cy },
  };
}

// Prominence ranking (spec SS7): primary frameworks/languages/databases/ML/infra above
// supporting tools, with generic concepts/data formats last. Derived from node_type +
// node_subtype so it is canonical-metadata-driven, not hardcoded per technology.
const _SUBTYPE_PROMINENCE: Record<string, number> = {
  framework: 9, programming_language: 9, database: 8, engine: 8, runtime: 7,
  library: 7, platform: 6, cloud_service: 6, sdk: 5, operating_system: 5,
  developer_tool: 4, protocol: 3, standard: 3, architecture: 6,
  technique: 2, methodology: 2,
};

export function prominenceOf(nodeType: string, nodeSubtype: string | null | undefined): number {
  if (nodeType === "concept") return 1;        // generic concepts/data formats last
  if (nodeType === "domain") return 10;
  return _SUBTYPE_PROMINENCE[nodeSubtype ?? ""] ?? 3;
}
