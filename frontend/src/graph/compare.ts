import type { GraphResponse } from "../api/types";

/** Shortest meaningful route, omitting membership spokes that would trivialize comparisons. */
export function connectionPath(graph: GraphResponse, start: string, end: string, maxHops = 5): string[] {
  if (start === end) return [start];
  const neighbors = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.relationship_type === "belongs_to_domain" || edge.relationship_type === "has_subdomain") continue;
    for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const list = neighbors.get(a) ?? []; list.push(b); neighbors.set(a, list);
    }
  }
  const queue: string[][] = [[start]];
  const seen = new Set([start]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i];
    if (path.length > maxHops) continue;
    for (const next of neighbors.get(path[path.length - 1]) ?? []) {
      if (next === end) return [...path, end];
      if (seen.has(next)) continue;
      seen.add(next); queue.push([...path, next]);
    }
  }
  return [];
}
