import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { NeighborEdge, NodeDetail } from "../api/types";
import { nodeTypeLabel, relationshipPhrase } from "../graph/relationships";

interface Props {
  slugOrId: string;
  onClose: () => void;
  onNavigate: (slugOrId: string) => void;
}

/** Detail sidebar for a selected node. Loads rich data on demand (spec §6, §10). */
export function NodeDetailsPanel({ slugOrId, onClose, onNavigate }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .node(slugOrId, controller.signal)
      .then((d) => setDetail(d))
      .catch((err) => {
        if (err.name !== "AbortError") setError("Could not load this node.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [slugOrId]);

  const grouped = groupNeighbors(detail?.neighbors ?? []);

  return (
    <aside className="details" aria-label="Node details">
      <button className="details-close" onClick={onClose} aria-label="Close details">
        ×
      </button>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {detail && !loading && (
        <>
          <header className="details-header">
            <span
              className="details-dot"
              style={{ background: detail.color }}
              aria-hidden
            />
            <h2>{detail.name}</h2>
            <p className="details-type">
              {nodeTypeLabel(detail.node_type, detail.node_subtype)}
            </p>
            {detail.lifecycle_status !== "active" && (
              <span className="lifecycle">{detail.lifecycle_status}</span>
            )}
          </header>

          <p className="details-desc">{detail.short_description}</p>

          <div className="details-actions">
            {detail.official_url && (
              <a href={detail.official_url} target="_blank" rel="noreferrer noopener">
                Official site
              </a>
            )}
            {detail.documentation_url && (
              <a href={detail.documentation_url} target="_blank" rel="noreferrer noopener">
                Documentation
              </a>
            )}
            {detail.wikipedia_title && (
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(
                  detail.wikipedia_title.replace(/ /g, "_"),
                )}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Wikipedia
              </a>
            )}
          </div>

          {detail.aliases.length > 0 && (
            <p className="details-aliases">
              Also known as: {detail.aliases.join(", ")}
            </p>
          )}

          <section aria-label="Relationships">
            <h3>Relationships ({detail.neighbors.length})</h3>
            {grouped.map(([phrase, items]) => (
              <div key={phrase} className="rel-group">
                <h4>{phrase}</h4>
                <ul>
                  {items.map((n) => (
                    <li key={`${phrase}-${n.node.id}`}>
                      <button
                        className="rel-link"
                        onClick={() => onNavigate(n.node.slug)}
                      >
                        <span
                          className="rel-dot"
                          style={{ background: n.node.color }}
                          aria-hidden
                        />
                        {n.node.label}
                        <span className="rel-kind">
                          {" "}
                          · {n.node.node_type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <p className="provenance">
            Popularity metrics are not yet available — the graph currently sizes
            technologies by connectivity, not adoption data.
          </p>
        </>
      )}
    </aside>
  );
}

function groupNeighbors(neighbors: NeighborEdge[]): [string, NeighborEdge[]][] {
  const map = new Map<string, NeighborEdge[]>();
  for (const n of neighbors) {
    const phrase = relationshipPhrase(n.relationship_type, n.direction);
    const list = map.get(phrase) ?? [];
    list.push(n);
    map.set(phrase, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
