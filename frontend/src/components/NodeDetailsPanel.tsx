import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { DetectionStatus, NeighborEdge, NodeDetail, RepoScan } from "../api/types";
import { nodeTypeLabel, relationshipPhrase } from "../graph/relationships";
import { safeHttpUrl } from "../util/safeUrl";

interface Props {
  slugOrId: string;
  onClose: () => void;
  onNavigate: (slugOrId: string) => void;
  // Repo X-Ray (Phase 1.5B): when a scan is active, show a "Found in this repository"
  // section for this node. nodeId is the canonical id used to look up detections.
  nodeId?: string | null;
  scan?: RepoScan | null;
}

/** Detail sidebar for a selected node. Loads rich data on demand (spec §6, §10). */
export function NodeDetailsPanel({ slugOrId, onClose, onNavigate, nodeId = null, scan = null }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLElement | null>(null);

  // UI-C focus management: move focus into the detail surface when it opens so keyboard
  // and screen-reader users land here (one navigational surface), and let Escape close it.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <aside className="details" aria-label="Node details" role="region" tabIndex={-1} ref={panelRef}>
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

          {detail.summary && (
            <section className="details-summary" aria-label="Wikipedia summary">
              {/* Rendered as plain text (React escapes it) — never as HTML. */}
              <p>{detail.summary.extract}</p>
              <p className="summary-attribution">
                Summary from{" "}
                {safeHttpUrl(detail.summary.source_url) ? (
                  <a
                    href={safeHttpUrl(detail.summary.source_url) as string}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Wikipedia
                  </a>
                ) : (
                  "Wikipedia"
                )}{" "}
                · {detail.summary.license}
              </p>
            </section>
          )}

          <div className="details-actions">
            {safeHttpUrl(detail.official_url) && (
              <a
                href={safeHttpUrl(detail.official_url) as string}
                target="_blank"
                rel="noreferrer noopener"
              >
                Official site
              </a>
            )}
            {safeHttpUrl(detail.documentation_url) && (
              <a
                href={safeHttpUrl(detail.documentation_url) as string}
                target="_blank"
                rel="noreferrer noopener"
              >
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

          <RepoEvidence detail={detail} nodeId={nodeId} scan={scan} />

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

          {detail.node_type === "technology" && (
            <p className="provenance">
              {detail.size_basis === "popularity" &&
              typeof detail.popularity === "number"
                ? `Sized by sourced popularity (adoption score ${detail.popularity.toFixed(
                    2,
                  )} of 1.00).`
                : "Sized by connectivity — no sourced popularity data for this technology yet, so its size reflects how connected it is in the graph, not adoption."}
            </p>
          )}
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


const STATUS_TEXT: Record<DetectionStatus, string> = {
  confirmed: "Confirmed in source",
  declared: "Declared dependency",
  inferred: "Inferred from evidence",
  related: "Related",
};

/** "Found in this repository" — evidence for the open node when a scan is active. */
function RepoEvidence({
  detail, nodeId, scan,
}: {
  detail: NodeDetail;
  nodeId: string | null;
  scan: RepoScan | null;
}) {
  if (!scan) return null;
  const id = nodeId ?? detail.id;
  const detection = scan.detections.find((d) => d.node_id === id);
  if (!detection) return null;
  const evidence = scan.evidence.filter((e) => detection.evidence_ids.includes(e.id));
  return (
    <section className="repo-evidence" aria-label="Found in this repository">
      <h3>Found in this repository</h3>
      <p className={`repo-evidence-status status-${detection.detection_status}`}>
        {STATUS_TEXT[detection.detection_status]}
        {detection.component_paths.length > 0 && (
          <span className="muted"> · {detection.component_paths.join(", ")}</span>
        )}
      </p>
      <ul className="repo-evidence-list">
        {evidence.map((e) => {
          const href = safeHttpUrl(e.source_url);
          return (
            <li key={e.id}>
              <span className="repo-evidence-desc">{e.description}</span>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer noopener" className="repo-evidence-file">
                  {e.file_path}
                </a>
              ) : (
                <span className="repo-evidence-file">{e.file_path}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
