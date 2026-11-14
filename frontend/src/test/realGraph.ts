// Test helper: the committed dataset (data/graph.json + data/layout.json) shaped like the
// API's GraphResponse, so data-driven features can be tested against real content.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphResponse, NodeType } from "../api/types";

let cached: GraphResponse | null = null;

export function realGraph(): GraphResponse {
  if (cached) return cached;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const raw = JSON.parse(readFileSync(resolve(root, "data/graph.json"), "utf8")) as {
    version: string;
    nodes: { id: string; slug: string; name: string; node_type: NodeType; node_subtype?: string | null; primary_domain: string }[];
    edges: { source: string; target: string; relationship_type: string }[];
  };
  const layout = JSON.parse(readFileSync(resolve(root, "data/layout.json"), "utf8")) as {
    coordinates: Record<string, { x: number; y: number; radius: number; cluster?: string; ring?: number }>;
  };
  cached = {
    version: raw.version,
    layout_version: raw.version,
    nodes: raw.nodes.map((n) => {
      const c = layout.coordinates[n.id];
      return { id: n.id, slug: n.slug, label: n.name, node_type: n.node_type, node_subtype: n.node_subtype ?? null,
        primary_domain: n.primary_domain, x: c?.x ?? 0, y: c?.y ?? 0, cluster: c?.cluster ?? null, ring: c?.ring,
        size: c?.radius ?? 4, color: "#888888" };
    }),
    edges: raw.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, relationship_type: e.relationship_type, weight: null })),
  } as GraphResponse;
  return cached;
}
