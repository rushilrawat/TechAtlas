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
  onFocusStack: () => void;
  onFocusNode: (nodeId: string) => void;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
}

const STATUS_LABEL: Record<DetectionStatus, string> = {
  confirmed: "Confirmed in source",
  declared: "Declared dependency",
  inferred: "Inferred",
  related: "Related",
};

// Client-side URL check mirrors the server allowlist (server still re-validates).
const GH_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/?$/i;

function groupByDomain(scan: RepoScan, nodesById: Map<string, GraphNode>) {
  const groups = new Map<string, RepoScan["detections"]>();
  for (const d of scan.detections) {
    const node = nodesById.get(d.node_id);
    const key = node?.primary_domain ?? "domain:other";
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  return groups;
}

export function RepoXrayPanel({
  phase, onAnalyze, onExit, onFocusStack, onFocusNode, nodesById, domainsById,
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
    <section className="xray-panel" aria-label="Repo X-Ray">
      <div className="xray-header">
        <h2>Analyze a GitHub Repository</h2>
        {phase.kind !== "idle" && (
          <button type="button" className="xray-exit" onClick={onExit}>
            Back to Universe
          </button>
        )}
      </div>
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

function Results({
  scan, nodesById, domainsById, onFocusStack, onFocusNode,
}: {
  scan: RepoScan;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  onFocusStack: () => void;
  onFocusNode: (id: string) => void;
}) {
  const groups = groupByDomain(scan, nodesById);
  const repo = scan.repository;
  const noMatches = scan.detections.length === 0;

  return (
    <div className="xray-results">
      <div className="xray-repo">
        <div className="xray-repo-title">
          {safeHttpUrl(repo.url) ? (
            <a href={safeHttpUrl(repo.url) as string} target="_blank" rel="noreferrer noopener">
              {repo.owner}/{repo.name}
            </a>
          ) : (
            <span>{repo.owner}/{repo.name}</span>
          )}
        </div>
        {repo.description && <p className="xray-repo-desc">{repo.description}</p>}
        <p className="muted xray-commit">
          {repo.primary_language ? `${repo.primary_language} · ` : ""}
          commit {repo.commit_sha.slice(0, 7)} on {repo.default_branch}
        </p>
        <button type="button" className="xray-focus" onClick={onFocusStack}>
          Focus Stack
        </button>
      </div>

      {scan.status === "partial" && (
        <div className="xray-partial" role="status">
          Partial scan: some files were skipped (budgets or a truncated tree). Results
          may be incomplete.
        </div>
      )}

      {noMatches ? (
        <p className="xray-empty">
          No TechAtlas technologies matched this repository
          {scan.summary.unmapped_package_count > 0
            ? " (its dependencies aren't mapped in the graph yet)."
            : "."}
        </p>
      ) : (
        <div className="xray-groups">
          {[...groups.entries()].map(([domainId, dets]) => (
            <div key={domainId} className="xray-group">
              <h3>{domainsById.get(domainId)?.name ?? "Other"}</h3>
              <ul>
                {dets.map((d) => {
                  const node = nodesById.get(d.node_id);
                  return (
                    <li key={d.node_id}>
                      <button
                        type="button"
                        className={`xray-tech status-${d.detection_status}`}
                        onClick={() => onFocusNode(d.node_id)}
                        title={STATUS_LABEL[d.detection_status]}
                      >
                        <span className={`xray-dot status-${d.detection_status}`} aria-hidden />
                        {node?.label ?? d.node_id}
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
      )}

      {scan.unmapped.length > 0 && (
        <details className="xray-unmapped">
          <summary>
            Unmapped dependencies ({scan.unmapped.length})
          </summary>
          <ul>
            {scan.unmapped.slice(0, 50).map((u) => (
              <li key={`${u.ecosystem}:${u.name}`}>
                <code>{u.name}</code> <span className="muted">({u.ecosystem})</span>
              </li>
            ))}
          </ul>
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
