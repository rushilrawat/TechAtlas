import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DomainSummary, GraphNode } from "../api/types";
import { badgeMarkdown, buildReport, headline, recommendLink, reportLink } from "../report/reportCard";

interface Props {
  repo: string;
  nodeIds: string[];
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  /** Slug of the pre-computed example scan, which has a pre-built /report/<slug>/ page. */
  example?: string | null;
  scannedOn?: string | null;
  onPick?: (id: string) => void;
  onClose: () => void;
}

const CHIPS_PER_FIELD = 6;

/** Shareable one-screen summary of a repository scan. */
export function ReportCard({ repo, nodeIds, nodesById, domainsById, example, scannedOn, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<"link" | "badge" | null>(null);
  const report = useMemo(() => buildReport(repo, nodeIds, nodesById, domainsById), [repo, nodeIds, nodesById, domainsById]);
  const slugs = useMemo(() => new Map([...nodesById.values()].map((n) => [n.id, n.slug])), [nodesById]);
  const link = reportLink(report, slugs, example);
  const total = report.nodeIds.length || 1;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [onClose]);

  const copy = (kind: "link" | "badge") => {
    const text = kind === "link" ? link : badgeMarkdown(report, link, example);
    void navigator.clipboard?.writeText(text).then(() => { setCopied(kind); window.setTimeout(() => setCopied(null), 1500); }, () => undefined);
  };

  // Portal to <body>: the X-Ray panel creates a containing block that would trap a fixed overlay.
  return createPortal(
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="report-card" role="dialog" aria-modal="true" aria-label={`Report card for ${repo}`}
        tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="outline-close" onClick={onClose} aria-label="Close report card">×</button>
        <p className="report-kicker">Repo report card</p>
        <h2>{repo}</h2>
        <p className="report-headline">{headline(report)}{report.concepts > 0 && <span>, plus {report.concepts} {report.concepts === 1 ? "concept" : "concepts"}</span>}</p>
        <div className="report-bar" role="img" aria-label={report.fields.map((f) => `${f.name}: ${f.nodes.length}`).join(", ")}>
          {report.fields.map((f) => <span key={f.id} style={{ width: `${(f.nodes.length / total) * 100}%`, background: f.color }} title={`${f.name}: ${f.nodes.length}`} />)}
        </div>
        <ul className="report-fields">
          {report.fields.map((f) => (
            <li key={f.id}>
              <div className="report-field-head"><span className="report-dot" style={{ background: f.color }} />{f.name}<span className="report-n">{f.nodes.length}</span></div>
              <div className="report-chips">
                {f.nodes.slice(0, CHIPS_PER_FIELD).map((n) => onPick
                  ? <button key={n.id} type="button" onClick={() => { onPick(n.id); onClose(); }}>{n.label}</button>
                  : <span key={n.id}>{n.label}</span>)}
                {f.nodes.length > CHIPS_PER_FIELD && <span className="report-more">+{f.nodes.length - CHIPS_PER_FIELD}</span>}
              </div>
            </li>
          ))}
        </ul>
        <p className="report-foot muted">Mapped by TechAtlas{scannedOn ? ` · scanned ${scannedOn}` : ""}. Counts only what the scanner found in manifests and config.</p>
        <div className="compare-actions report-actions">
          <button type="button" className="stack-go" onClick={() => copy("link")}>{copied === "link" ? "Link copied" : "Copy share link"}</button>
          <button type="button" onClick={() => copy("badge")} title="Markdown for a README badge">{copied === "badge" ? "Copied" : "Copy README badge"}</button>
          <a className="report-link" href={recommendLink(report, slugs)}>What teams like this add next →</a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
