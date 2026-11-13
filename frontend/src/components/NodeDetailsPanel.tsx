import { useEffect, useRef, useState } from "react";
import { api, fetchWikipediaSummary } from "../api/client";
import type { DetectionStatus, NeighborEdge, NodeDetail, NodeSummary, RepoScan } from "../api/types";
import { nodeTypeLabel, relationshipPhrase } from "../graph/relationships";
import { safeHttpUrl } from "../util/safeUrl";
import { useLearningMap, type LearningStatus } from "../graph/learning";

interface Props {
  slugOrId: string;
  onClose: () => void;
  onNavigate: (slugOrId: string) => void;
  // Repo X-Ray (Phase 1.5B): when a scan is active, show a "Found in this repository"
  // section for this node. nodeId is the canonical id used to look up detections.
  nodeId?: string | null;
  scan?: RepoScan | null;
  // For a DOMAIN selection: its members-only count (sidebar / aggregate "direct" figure),
  // shown in the header so a single tap identifies the domain's name AND size. Null otherwise.
  memberCount?: number | null;
  onPreviewRelationship?: (neighbor: NeighborEdge | null) => void;
  /** Open Compare with this node and another technology. */
  onCompare?: (otherId: string) => void;
}

const LEARNING_OPTIONS: [LearningStatus, string][] = [["known", "Know it"], ["learning", "Learning"], ["goal", "Goal"]];

/** Detail sidebar for a selected node. Loads rich data on demand (spec §6, §10). */
export function NodeDetailsPanel({ slugOrId, onClose, onNavigate, nodeId = null, scan = null, memberCount = null, onPreviewRelationship, onCompare }: Props) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockedNeighbor, setLockedNeighbor] = useState<NeighborEdge | null>(null);
  const [wikiSummary, setWikiSummary] = useState<NodeSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [learning, setLearning] = useLearningMap();
  const panelRef = useRef<HTMLElement | null>(null);

  // Focus management (UI-C/UI-D req 1): capture the element that opened the panel (the
  // technology row or search option), move focus into the detail surface on open, let
  // Escape close it, and RESTORE focus to the opener on close/unmount — for all close
  // paths (Escape, close button, back-navigation deselect).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Restore focus only if the opener is still in the document and focusable.
      if (opener && document.contains(opener) && typeof opener.focus === "function") {
        opener.focus();
      }
    };
  }, [onClose]);

  useEffect(() => {
    setLockedNeighbor(null);
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

  // No server-side summary (static build, or the backend could not reach Wikipedia):
  // fetch it in the browser by the curated title.
  useEffect(() => {
    setWikiSummary(null);
    if (!detail || detail.summary || !detail.wikipedia_title) return;
    const controller = new AbortController();
    fetchWikipediaSummary(detail.wikipedia_title, controller.signal)
      .then(setWikiSummary)
      .catch(() => { /* degrade to the outbound link */ });
    return () => controller.abort();
  }, [detail]);

  const summary = detail?.summary ?? wikiSummary;
  const alternatives = (detail?.neighbors ?? []).filter((n) => n.relationship_type === "alternative_to");
  const status = detail ? learning[detail.id] : undefined;

  function copyLink() {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(window.location.href).then(done, () => {});
  }
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
              {detail.node_type === "domain" && memberCount != null && (
                <span className="details-count">
                  {" · "}{memberCount} {memberCount === 1 ? "member" : "members"}
                </span>
              )}
            </p>
            {detail.lifecycle_status !== "active" && (
              <span className="lifecycle">{detail.lifecycle_status}</span>
            )}
          </header>

          <p className="details-desc">{detail.short_description}</p>

          <div className="details-tools">
            {detail.node_type !== "domain" && (
              <div className="learning-toggle" role="group" aria-label="Add to my learning map">
                {LEARNING_OPTIONS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={status === value}
                    onClick={() => setLearning(detail.id, status === value ? null : value)}>{label}</button>
                ))}
              </div>
            )}
            <button type="button" className="copy-link" onClick={copyLink} aria-live="polite">
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>

          {alternatives.length > 0 && (
            <section className="details-alternatives" aria-label="Alternatives">
              <h3>Alternatives</h3>
              <ul>
                {alternatives.map((a) => (
                  <li key={a.node.id}>
                    <button type="button" className="rel-link" onClick={() => onNavigate(a.node.id)}>
                      <span className="rel-dot" style={{ background: a.node.color }} aria-hidden />
                      {a.node.label}
                    </button>
                    {onCompare && detail.node_type === "technology" && a.node.node_type === "technology" && (
                      <button type="button" className="alt-compare" onClick={() => onCompare(a.node.id)}
                        aria-label={`Compare ${detail.name} with ${a.node.label}`}>Compare</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary && (
            <section className="details-summary" aria-label="Wikipedia summary">
              {/* Rendered as plain text (React escapes it) — never as HTML. */}
              <p>{summary.extract}</p>
              <p className="summary-attribution">
                Summary from{" "}
                {safeHttpUrl(summary.source_url) ? (
                  <a
                    href={safeHttpUrl(summary.source_url) as string}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Wikipedia
                  </a>
                ) : (
                  "Wikipedia"
                )}{" "}
                · {summary.license}
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
                        onMouseEnter={() => onPreviewRelationship?.(n)}
                        onMouseLeave={() => onPreviewRelationship?.(lockedNeighbor)}
                        onFocus={() => onPreviewRelationship?.(n)}
                        onBlur={() => onPreviewRelationship?.(lockedNeighbor)}
                        onClick={() => {
                          const next = lockedNeighbor === n ? null : n;
                          setLockedNeighbor(next);
                          onPreviewRelationship?.(next);
                        }}
                        aria-label={`Show connection with ${n.node.label}`}
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
                      <button className="rel-open" onClick={() => onNavigate(n.node.slug)}
                        aria-label={`Open ${n.node.label}`}>Open ↗</button>
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
