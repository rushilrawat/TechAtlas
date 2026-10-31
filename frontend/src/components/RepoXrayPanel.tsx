// Repo X-Ray entry point + input + result summary (Phase 1.5B).
// Rendered only when the scanner is configured (VITE_SCANNER_API). Reuses the existing
// panel styling. Graph highlighting itself happens in GraphCanvas via the overlay; this
// panel drives the scan lifecycle and lets the user jump to detected nodes.

import { useState } from "react";
import type {
  DetectionStatus,
  DomainSummary,
  GraphNode,
  RepoScan,
} from "../api/types";
import type { ScanPhase } from "../graph/useRepoScan";
import { safeHttpUrl } from "../util/safeUrl";

interface Props {
  phase: ScanPhase;
  onAnalyze: (url: string) => void;
  onExit: () => void;
  onAnalyzeAnother: () => void;
  onFocusStack: () => void;
  onFocusNode: (nodeId: string) => void;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  view: "stack" | "universe";
  onViewChange: (v: "stack" | "universe") => void;
  /** Mobile bottom-sheet collapse state + toggle (ignored on desktop via CSS). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const STATUS_LABEL: Record<DetectionStatus, string> = {
  confirmed: "Confirmed in source",
  declared: "Declared dependency",
  inferred: "Inferred",
  related: "Related",
};

// Client-side URL check mirrors the server allowlist (server still re-validates).
const GH_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/?$/i;

export function RepoXrayPanel({
  phase, onAnalyze, onExit, onAnalyzeAnother, onFocusStack, onFocusNode, nodesById,
  domainsById, view, onViewChange, collapsed = false, onToggleCollapsed,
}: Props) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = GH_RE.test(url.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (valid) onAnalyze(url.trim());
  }

  const analyzing = phase.kind === "analyzing";

  return (
    <section
      className={collapsed ? "xray-panel collapsed" : "xray-panel"}
      aria-label="Repo X-Ray"
    >
      <div className="xray-header">
        <h2>{phase.kind === "done" && collapsed ? "Repo X-Ray" : "Analyze a GitHub Repository"}</h2>
        <button
          type="button"
          className="xray-collapse"
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? phase.kind === "done" ? "View scan results" : "Expand repository panel"
              : "Minimize panel to explore the graph"
          }
          title={
            collapsed
              ? phase.kind === "done" ? "View the full scan results" : "Expand panel"
              : "Minimize panel to explore the graph"
          }
          onClick={onToggleCollapsed}
        >
          {collapsed
            ? phase.kind === "done" ? "▴ View scan results" : "▴ Expand"
            : "▾ Minimize"}
        </button>
        {phase.kind !== "idle" && phase.kind !== "done" && (
          <button type="button" className="xray-exit" onClick={onExit}>
            Back to Universe
          </button>
        )}
      </div>
      {phase.kind !== "done" && (
      <>
      <p className="xray-desc">
        Discover the technologies powering any public GitHub project.
      </p>

      <form className="xray-form" onSubmit={submit}>
        <input
          type="url"
          className="xray-input"
          placeholder="https://github.com/owner/repository"
          aria-label="GitHub repository URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={analyzing}
          autoComplete="off"
        />
        <button type="submit" className="xray-analyze" disabled={analyzing || !url.trim()}>
          {analyzing ? "Analyzing…" : "Analyze Repository"}
        </button>
      </form>
      {touched && url.trim() && !valid && (
        <p className="xray-invalid" role="alert">
          Enter a valid public GitHub repository URL (https://github.com/owner/repo).
        </p>
      )}
      <p className="xray-note">Public repositories only. No GitHub login required.</p>
      </>
      )}

      {analyzing && (
        <div className="xray-status" role="status" aria-live="polite">
          <span className="xray-spinner" aria-hidden />
          <span>
            Connecting to the repository scanner and analyzing{" "}
            {phase.url.replace(/^https?:\/\/(www\.)?github\.com\//, "")}…
            <span className="xray-note"> The scanner may take up to a minute to wake up.</span>
          </span>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="xray-error" role="alert">
          <strong>{errorTitle(phase.code)}</strong>
          <p>{phase.message}</p>
          {phase.retryAfter != null && (
            <p className="muted">Try again in about {phase.retryAfter}s.</p>
          )}
        </div>
      )}

      {phase.kind === "done" && (
        <Results
          scan={phase.scan}
          nodesById={nodesById}
          domainsById={domainsById}
          onFocusStack={onFocusStack}
          onFocusNode={onFocusNode}
          onAnalyzeAnother={() => { setUrl(""); setTouched(false); onAnalyzeAnother(); }}
          onExit={onExit}
          view={view}
          onViewChange={onViewChange}
        />
      )}
    </section>
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case "invalid_url": return "Invalid URL";
    case "not_found": return "Repository not found";
    case "rate_limited": return "GitHub rate limit";
    case "timeout": return "Scanner timed out";
    case "busy": return "Scanner busy";
    default: return "Scan failed";
  }
}

function groupSplit(
  dets: RepoScan["detections"],
  nodesById: Map<string, GraphNode>,
) {
  // Presentation-only split (never alters scanner truth): technologies (tools) vs concepts,
  // each grouped by primary_domain. Every detection appears exactly once.
  const tools = new Map<string, RepoScan["detections"]>();
  const concepts = new Map<string, RepoScan["detections"]>();
  for (const d of dets) {
    const node = nodesById.get(d.node_id);
    const key = node?.primary_domain ?? "domain:other";
    const bucket = d.node_type === "concept" ? concepts : tools;
    const list = bucket.get(key) ?? [];
    list.push(d);
    bucket.set(key, list);
  }
  return { tools, concepts };
}

function DetectionGroups({
  groups, nodesById, domainsById, onFocusNode,
}: {
  groups: Map<string, RepoScan["detections"]>;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  onFocusNode: (id: string) => void;
}) {
  return (
    <div className="xray-groups">
      {[...groups.entries()].map(([domainId, dets]) => (
        <div key={domainId} className="xray-group">
          <h4 className="xray-group-title">
            {domainsById.get(domainId)?.name ?? "Other"}
          </h4>
          <ul>
            {dets.map((d) => {
              const node = nodesById.get(d.node_id);
              const cls = d.dependency_classification;
              return (
                <li key={d.node_id}>
                  <button
                    type="button"
                    className={`xray-tech status-${d.detection_status}`}
                    onClick={() => onFocusNode(d.node_id)}
                    title={`${STATUS_LABEL[d.detection_status]} — open details`}
                  >
                    <span className={`xray-dot status-${d.detection_status}`} aria-hidden />
                    <span className="xray-tech-name">{node?.label ?? d.node_id}</span>
                    {cls ? <span className={`xray-class class-${cls}`}>{cls}</span> : null}
                    <span className="xray-tech-status">
                      {STATUS_LABEL[d.detection_status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const UNMAPPED_CAP = 50;

function Results({
  scan, nodesById, domainsById, onFocusStack, onFocusNode, onAnalyzeAnother, onExit,
  view, onViewChange,
}: {
  scan: RepoScan;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  onFocusStack: () => void;
  onFocusNode: (id: string) => void;
  onAnalyzeAnother: () => void;
  onExit: () => void;
  view: "stack" | "universe";
  onViewChange: (v: "stack" | "universe") => void;
}) {
  const repo = scan.repository;
  const noMatches = scan.detections.length === 0;
  const { tools, concepts } = groupSplit(scan.detections, nodesById);
  const repoUrl = safeHttpUrl(repo.url);
  const partial = scan.status === "partial";

  return (
    <div className="xray-results">
      {/* Section B: repository identity */}
      <div className="xray-repo">
        <div className="xray-repo-title">
          {repoUrl ? (
            <a href={repoUrl as string} target="_blank" rel="noreferrer noopener">
              {repo.owner}/{repo.name}
            </a>
          ) : (
            <span>{repo.owner}/{repo.name}</span>
          )}
        </div>
        {repo.description && (
          <p className="xray-repo-desc" title={repo.description}>{repo.description}</p>
        )}
        <p className="muted xray-commit">
          {repo.primary_language ? `${repo.primary_language} · ` : ""}
          commit {repo.commit_sha.slice(0, 7)} on {repo.default_branch}
        </p>
      </div>

      {/* Section G (surfaced high): always-visible partial-scan warning */}
      {partial && (
        <div className="xray-partial" role="status">
          <strong>Partial scan.</strong> Some files were not inspected, so not every
          technology in this repository was necessarily detected.
          {scan.coverage.notes.length > 0 && (
            <ul className="xray-partial-notes">
              {scan.coverage.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Section C: compact source-backed summary metrics */}
      <div className="xray-metrics" aria-label="Scan summary">
        <div className="xray-metric">
          <span className="xray-metric-n">{scan.summary.matched_technology_count}</span>
          <span className="xray-metric-l">technologies</span>
        </div>
        <div className="xray-metric">
          <span className="xray-metric-n">{scan.summary.matched_concept_count}</span>
          <span className="xray-metric-l">concepts</span>
        </div>
        <div className="xray-metric">
          <span className="xray-metric-n">{scan.summary.unmapped_package_count}</span>
          <span className="xray-metric-l">unmapped</span>
        </div>
      </div>

      {/* Section D: primary actions (Focus on Stack primary; others secondary) */}
      <div className="xray-actions">
        <button type="button" className="xray-focus primary" onClick={onFocusStack}>
          Focus on Stack
        </button>
        <div className="xray-actions-secondary">
          {repoUrl && (
            <a className="xray-action-btn" href={repoUrl as string}
               target="_blank" rel="noreferrer noopener">Open GitHub</a>
          )}
          <button type="button" className="xray-action-btn" onClick={onAnalyzeAnother}>
            Analyze Another
          </button>
          <button type="button" className="xray-action-btn" onClick={onExit}>
            Back to Universe
          </button>
        </div>
      </div>

      {/* Stack View / Universe View switch (X-Ray UX correction). Both views share the
          same scan, evidence, and selection; switching never rescans. */}
      <div className="xray-viewswitch" role="group" aria-label="Repo X-Ray view">
        <button
          type="button"
          className={view === "stack" ? "active" : ""}
          aria-pressed={view === "stack"}
          onClick={() => onViewChange("stack")}
        >
          Stack View
        </button>
        <button
          type="button"
          className={view === "universe" ? "active" : ""}
          aria-pressed={view === "universe"}
          onClick={() => onViewChange("universe")}
        >
          Universe View
        </button>
      </div>

      {/* Section E/F: detected stack — tools (technologies) first, then concepts */}
      {noMatches ? (
        <p className="xray-empty">
          No TechAtlas technologies matched this repository
          {scan.summary.unmapped_package_count > 0
            ? " (its dependencies aren't mapped in the graph yet)."
            : "."}
        </p>
      ) : (
        <>
          {tools.size > 0 && (
            <section className="xray-section" aria-label="Technologies and tools">
              <h3 className="xray-section-title">Technologies &amp; tools</h3>
              <DetectionGroups groups={tools} nodesById={nodesById}
                domainsById={domainsById} onFocusNode={onFocusNode} />
            </section>
          )}
          {concepts.size > 0 && (
            <section className="xray-section" aria-label="Engineering concepts">
              <h3 className="xray-section-title">Engineering concepts</h3>
              <DetectionGroups groups={concepts} nodesById={nodesById}
                domainsById={domainsById} onFocusNode={onFocusNode} />
            </section>
          )}
        </>
      )}

      {/* Section F: unmapped dependencies — collapsed, capped display, full list retained */}
      {scan.unmapped.length > 0 && (
        <details className="xray-unmapped">
          <summary>Unmapped dependencies ({scan.unmapped.length})</summary>
          <ul>
            {scan.unmapped.slice(0, UNMAPPED_CAP).map((u) => (
              <li key={`${u.ecosystem}:${u.name}`}>
                <code>{u.name}</code> <span className="muted">({u.ecosystem})</span>
              </li>
            ))}
          </ul>
          {scan.unmapped.length > UNMAPPED_CAP && (
            <p className="muted">
              Showing {UNMAPPED_CAP} of {scan.unmapped.length}. The full list is retained as
              scan evidence; none are discarded.
            </p>
          )}
          <p className="muted">
            These packages were found but have no matching TechAtlas node yet.
          </p>
        </details>
      )}

      <p className="muted xray-coverage">
        Inspected {scan.coverage.files_inspected} file(s)
        {scan.coverage.tree_truncated ? " · tree truncated" : ""}.
      </p>
    </div>
  );
}
