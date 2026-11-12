import type { GraphEdge, GraphResponse } from "../api/types";

type Point = { x: number; y: number };
type Path = { edge: GraphEdge; points: Point[] };

function curve(a: Point, b: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const control = { x: (a.x + b.x) / 2 + dy * 0.04, y: (a.y + b.y) / 2 - dx * 0.04 };
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
  });
}

function segmentDistance(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return x * y < 0 && z * w < 0;
}

export function pathsConflict(a: Path, b: Path, clearance = 70): boolean {
  const shared = [a.edge.source, a.edge.target].filter((id) => id === b.edge.source || id === b.edge.target);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    // Lines may meet at their shared node; compare beyond its immediate halo.
    if (shared.length && ((i < 2 && a.edge.source === shared[0]) || (i > 9 && a.edge.target === shared[0])) &&
      ((j < 2 && b.edge.source === shared[0]) || (j > 9 && b.edge.target === shared[0]))) continue;
    const p = a.points[i], q = a.points[i + 1], r = b.points[j], s = b.points[j + 1];
    if (intersects(p, q, r, s) || Math.min(segmentDistance(p, q, r), segmentDistance(p, q, s),
      segmentDistance(r, s, p), segmentDistance(r, s, q)) < clearance) return true;
  }
  return false;
}

/** A deterministic subset of short, genuine edges with no overlapping curve paths. */
export function selectClearEdges(data: GraphResponse, maxPerDomain = 2, limit = 28, includeDetail = false, clearance = 70): Set<string> {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const candidates = data.edges.filter((edge) => {
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    return source && target && source.x != null && target.x != null &&
      edge.source !== "domain:software-engineering" && edge.target !== "domain:software-engineering";
  }).map((edge) => {
    const a = nodes.get(edge.source)!, b = nodes.get(edge.target)!;
    const cross = a.primary_domain !== b.primary_domain &&
      edge.relationship_type !== "belongs_to_domain" && edge.relationship_type !== "has_subdomain";
    const domain = a.node_type === "domain" && a.ring === 0 ? a.id
      : b.node_type === "domain" && b.ring === 0 ? b.id : a.primary_domain;
    return { edge, domain, cross,
      pair: [a.primary_domain, b.primary_domain].sort().join("|"),
      tier: data.edge_tiers?.[edge.id] ?? "TierD",
      length: Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)),
      points: curve({ x: a.x ?? 0, y: a.y ?? 0 }, { x: b.x ?? 0, y: b.y ?? 0 }) };
  }).filter((item) => includeDetail || item.tier !== "TierD" || (item.cross && item.length < 2200))
    .sort((a, b) => (a.tier === "TierC" ? 0 : a.cross ? 1 : a.tier === "TierA" ? 2 : 3) -
      (b.tier === "TierC" ? 0 : b.cross ? 1 : b.tier === "TierA" ? 2 : 3) ||
      a.length - b.length || a.edge.id.localeCompare(b.edge.id));
  const accepted: typeof candidates = [], counts = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const candidate of candidates) {
    if (accepted.length >= limit) break;
    if ((counts.get(candidate.domain) ?? 0) >= maxPerDomain) continue;
    if (candidate.cross && (pairs.get(candidate.pair) ?? 0) >= 2) continue;
    if (accepted.some((other) => pathsConflict(candidate, other, clearance))) continue;
    accepted.push(candidate);
    counts.set(candidate.domain, (counts.get(candidate.domain) ?? 0) + 1);
    if (candidate.cross) pairs.set(candidate.pair, (pairs.get(candidate.pair) ?? 0) + 1);
  }
  return new Set(accepted.map((item) => item.edge.id));
}
