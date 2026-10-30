// Human-readable phrasing for relationship types, used in the detail panel.

import type { EdgeDirection } from "../api/types";

const PHRASES: Record<string, { out: string; in: string; undirected: string }> = {
  belongs_to_domain: { out: "belongs to", in: "contains", undirected: "related to" },
  has_subdomain: { out: "contains", in: "part of", undirected: "related to" },
  related_to: { out: "related to", in: "related to", undirected: "related to" },
  implements: { out: "implements", in: "implemented by", undirected: "related to" },
  used_for: { out: "used for", in: "uses", undirected: "related to" },
  written_in: { out: "written in", in: "used to build", undirected: "related to" },
  built_on: { out: "built on", in: "foundation for", undirected: "related to" },
  depends_on: { out: "depends on", in: "required by", undirected: "related to" },
  integrates_with: { out: "integrates with", in: "integrates with", undirected: "integrates with" },
  alternative_to: { out: "alternative to", in: "alternative to", undirected: "alternative to" },
  commonly_used_with: {
    out: "commonly used with",
    in: "commonly used with",
    undirected: "commonly used with",
  },
  supports: { out: "supports", in: "supported by", undirected: "related to" },
  part_of_ecosystem: { out: "part of ecosystem", in: "ecosystem includes", undirected: "related to" },
  enables: { out: "enables", in: "enabled by", undirected: "related to" },
};

export function relationshipPhrase(type: string, direction: EdgeDirection): string {
  const entry = PHRASES[type];
  if (!entry) return type.replace(/_/g, " ");
  return entry[direction];
}

// Node-type labels shown as text so classification never relies on color alone.
export function nodeTypeLabel(nodeType: string, subtype: string | null): string {
  const base = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
  if (!subtype) return base;
  const pretty = subtype.replace(/_/g, " ");
  return `${base} · ${pretty}`;
}
