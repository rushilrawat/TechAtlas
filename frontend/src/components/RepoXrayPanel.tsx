// Repo X-Ray entry point + input + result summary (Phase 1.5B).
// Rendered only when the scanner is configured (VITE_SCANNER_API). Reuses the existing
// panel styling. Graph highlighting itself happens in GraphCanvas via the overlay; this
// panel drives the scan lifecycle and lets the user jump to detected nodes.

import { useCallback, useMemo, useState } from "react";
import { arrowNavGrid } from "../util/arrowNav";
import { StepNav, neighbours, useStepKeys } from "./StepNav";
import type {
  DetectionStatus,
  DomainSummary,
  GraphNode,
  RepoScan,
} from "../api/types";
import type { ScanPhase } from "../graph/useRepoScan";
import { safeHttpUrl } from "../util/safeUrl";
import { CONFIDENCE_ORDER, computeScanStats, scanSummaryMarkdown } from "../graph/scanStats";
import { EXAMPLE_SCANS, findExample, type ExampleScanMeta } from "../api/exampleScans";
import { ReportCard } from "./ReportCard";

interface Props {
  phase: ScanPhase;
  onAnalyze: (url: string) => void;
  onExit: () => void;
  onAnalyzeAnother: () => void;
  onFocusStack: () => void;
  onFocusNode: (nodeId: string) => void;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  learnNext?: { id: string; label: string; connections: number }[];
  view: "stack" | "universe";
  onViewChange: (v: "stack" | "universe") => void;
  /** Mobile bottom-sheet collapse state + toggle (ignored on desktop via CSS). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Open a pre-computed example scan. */
  onLoadExample?: (slug: string) => void;
  /** Whether a live scanner backend is configured. Without one, X-Ray shows examples only. */
  liveEnabled?: boolean;
  examples?: ExampleScanMeta[];
}

const STATUS_LABEL: Record<DetectionStatus, string> = {
  confirmed: "Found in code",
  declared: "Listed as a dependency",
  inferred: "Guessed from related files",
  related: "Related to the stack",
};

// Client-side URL check mirrors the server allowlist (server still re-validates).
const GH_RE = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/?$/i;

export function RepoXrayPanel({
  phase, onAnalyze, onExit, onAnalyzeAnother, onFocusStack, onFocusNode, nodesById,
  domainsById, learnNext = [], view, onViewChange, collapsed = false, onToggleCollapsed,
  onLoadExample, liveEnabled = true, examples = EXAMPLE_SCANS,
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
        <h2>{(phase.kind === "done" && collapsed) || !liveEnabled ? "Repo X-Ray" : "Analyze a GitHub Repository"}</h2>
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
        <button type="button" className="xray-exit" onClick={onExit} aria-label="Close Repo X-Ray and go back to the atlas">
          ← Back to atlas
        </button>
      </div>
      {phase.kind !== "done" && (
      <>
      <p className="xray-desc">
        See the technologies behind a GitHub project, mapped onto the atlas.
      </p>

      {liveEnabled && (
        <>
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

      {onLoadExample && examples.length > 0 && !analyzing && (
        <ExampleGallery
          examples={examples}
          onPick={onLoadExample}
          heading={liveEnabled ? "Or open an example (instant)" : "Pick a repository to X-ray"}
        />
      )}

      {!liveEnabled && !analyzing && (
        <p className="xray-note xray-live-note">
          These are real scans, made ahead of time. Scanning your own repository needs the
          TechAtlas scanner backend, which this site doesn&rsquo;t run.{" "}
          <a href="https://github.com/rushilrawat/TechAtlas/blob/main/docs/deployment-scanner.md"
            target="_blank" rel="noreferrer noopener">Run it yourself</a>.
        </p>
      )}
      </>
      )}

      {analyzing && (
        <div className="xray-status" role="status" aria-live="polite">
          <span className="xray-spinner" aria-hidden />
          {liveEnabled ? (
            <span>
              Connecting to the repository scanner and analyzing{" "}
              {phase.url.replace(/^https?:\/\/(www\.)?github\.com\//, "")}…
              <span className="xray-note"> The scanner may take up to a minute to wake up.</span>
            </span>
          ) : (
            <span>Loading {phase.url.replace(/^https?:\/\/(www\.)?github\.com\//, "")}…</span>
          )}
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
          example={phase.example}
          liveEnabled={liveEnabled}
          nodesById={nodesById}
          domainsById={domainsById}
          learnNext={learnNext}
          onFocusStack={onFocusStack}
          onFocusNode={onFocusNode}
          onAnalyzeAnother={() => { setUrl(""); setTouched(false); onAnalyzeAnother(); }}
          onExit={onExit}
          view={view}
          onViewChange={onViewChange}
          examples={examples}
          onLoadExample={onLoadExample}
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
    case "example": return "Example unavailable";
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
                    <span className="xray-tech-name">{node?.label ?? labelFromId(d.node_id)}</span>
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

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** A readable name for an id the atlas doesn't know (e.g. a renamed node): "technology:foo-bar" -> "Foo bar". */
export function labelFromId(id: string): string {
  const slug = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/** Thousands separators inside scanner notes ("22021 additional source files" -> "22,021 …"). */
export function formatCounts(text: string): string {
  return text.replace(/\b\d{4,}\b/g, (n) => Number(n).toLocaleString("en-US"));
}

/**
 * The scan's counts, computed once from the detections so the summary line, the report
 * card and the by-field bars can never disagree.
 */
export function scanCounts(scan: RepoScan, nodesById: Map<string, GraphNode>) {
  let technologies = 0, concepts = 0;
  const fields = new Set<string>();
  for (const d of scan.detections) {
    if (d.node_type === "concept") concepts++; else technologies++;
    const node = nodesById.get(d.node_id);
    if (node && d.node_type !== "concept") fields.add(node.primary_domain ?? "domain:other");
  }
  return { technologies, concepts, fields: fields.size };
}

/** Copy a markdown summary or download the scan as JSON (in the "More" menu). */
function CopyAndDownload({ scan, nodesById, domainsById }: {
  scan: RepoScan; nodesById: Map<string, GraphNode>; domainsById: Map<string, DomainSummary>;
}) {
  const [copied, setCopied] = useState<"" | "summary" | "json">("");
  const flash = (k: "summary" | "json") => { setCopied(k); window.setTimeout(() => setCopied(""), 1500); };
  const copySummary = () => {
    const stats = computeScanStats(scan, nodesById, domainsById);
    const text = scanSummaryMarkdown(scan, stats, nodesById, domainsById, window.location.href);
    void navigator.clipboard?.writeText(text).then(() => flash("summary"), () => undefined);
  };
  const downloadJson = () => {
    const stats = computeScanStats(scan, nodesById, domainsById);
    const blob = new Blob([JSON.stringify({ repository: scan.repository, scanner_version: scan.scanner_version,
      summary: scan.summary, stats, detections: scan.detections, unmapped: scan.unmapped }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${scan.repository.owner}-${scan.repository.name}-xray.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash("json");
  };
  return <>
    <button type="button" onClick={copySummary}>{copied === "summary" ? "Summary copied" : "Copy a text summary"}</button>
    <button type="button" onClick={downloadJson}>{copied === "json" ? "Downloaded" : "Download as JSON"}</button>
  </>;
}

function ExampleGallery({ examples, onPick, heading }: {
  examples: ExampleScanMeta[];
  onPick: (slug: string) => void;
  heading: string;
}) {
  return (
    <section className="xray-examples" aria-label="Example scans">
      <h3 className="xray-section-title">{heading}</h3>
      <ul data-arrow-nav onKeyDown={arrowNavGrid}>
        {examples.map((e) => (
          <li key={e.slug}>
            <button type="button" className="xray-example"
              onClick={() => onPick(e.slug)} aria-label={`X-ray ${e.repo}: ${e.tagline}`}>
              <span className="xray-example-repo">{e.repo}</span>
              <span className="xray-example-tag">{e.tagline}</span>
              <span className="xray-example-n">
                <span>{plural(e.technologies, "technology", "technologies")}</span>
                <span>{plural(e.concepts, "concept", "concepts")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Results({
  scan, example, liveEnabled, nodesById, domainsById, learnNext, onFocusStack, onFocusNode,
  onAnalyzeAnother, view, onViewChange, examples = [], onLoadExample,
}: {
  examples?: ExampleScanMeta[];
  onLoadExample?: (slug: string) => void;
  scan: RepoScan;
  /** Slug of the pre-computed example this result came from, if any. */
  example?: string;
  liveEnabled: boolean;
  nodesById: Map<string, GraphNode>;
  domainsById: Map<string, DomainSummary>;
  learnNext: { id: string; label: string; connections: number }[];
  onFocusStack: () => void;
  onFocusNode: (id: string) => void;
  onAnalyzeAnother: () => void;
  onExit: () => void;
  view: "stack" | "universe";
  onViewChange: (v: "stack" | "universe") => void;
}) {
  const repo = scan.repository;
  const noMatches = scan.detections.length === 0;
  // ?card=1 (from a /report/<slug>/ page) opens the report card straight away.
  const [cardOpen, setCardOpen] = useState(() => !!example && new URLSearchParams(window.location.search).get("card") === "1");
  const closeCard = useCallback(() => {
    setCardOpen(false);
    const p = new URLSearchParams(window.location.search);
    if (p.get("card") === "1") { p.delete("card"); window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`); }
  }, []);
  const nodeIds = useMemo(() => scan.detections.map((d) => d.node_id), [scan]);
  const exampleMeta = findExample(example);
  const { tools, concepts } = groupSplit(scan.detections, nodesById);
  const counts = useMemo(() => scanCounts(scan, nodesById), [scan, nodesById]);
  const repoUrl = safeHttpUrl(repo.url);
  const partial = scan.status === "partial";
  // ← / → (and [ / ]) step through the example scans when this result is one of them.
  const exIndex = example ? examples.findIndex((e) => e.slug === example) : -1;
  const around = onLoadExample ? neighbours(exIndex, examples.length) : null;
  const prevEx = around ? examples[around[0]] : null;
  const nextEx = around ? examples[around[1]] : null;
  const goPrev = useMemo(() => prevEx && onLoadExample ? () => onLoadExample(prevEx.slug) : null, [prevEx, onLoadExample]);
  const goNext = useMemo(() => nextEx && onLoadExample ? () => onLoadExample(nextEx.slug) : null, [nextEx, onLoadExample]);
  useStepKeys(!!around, goPrev, goNext);

  return (
    <div className="xray-results">
      {cardOpen && <ReportCard repo={`${repo.owner}/${repo.name}`} nodeIds={nodeIds} nodesById={nodesById} domainsById={domainsById}
        example={example} scannedOn={exampleMeta?.scanned_on} onPick={onFocusNode} onClose={closeCard} />}
      {around && <StepNav label="Step through example scans" position={`${exIndex + 1} / ${examples.length}`}
        prev={prevEx && goPrev ? { label: prevEx.repo, onGo: goPrev } : null}
        next={nextEx && goNext ? { label: nextEx.repo, onGo: goNext } : null} />}
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

      {example && (
        <p className="xray-example-badge" role="note">
          <strong>Example scan</strong> of commit {scan.repository.commit_sha.slice(0, 7)}
          {findExample(example)?.scanned_on ? `, made ${findExample(example)?.scanned_on}` : ""}.
          The repository may have changed since.
        </p>
      )}

      {/* Partial scans: one line that opens for the details, never pinned over the results. */}
      {partial && (
        <details className="xray-partial">
          <summary><strong>Partial scan:</strong> some files were skipped.</summary>
          <p>Not every technology in this repository was necessarily detected.</p>
          {scan.coverage.notes.length > 0 && (
            <ul className="xray-partial-notes">
              {scan.coverage.notes.map((n, i) => <li key={i}>{formatCounts(n)}</li>)}
            </ul>
          )}
        </details>
      )}

      {/* The one summary line; its numbers are the ones the report card and fields use too. */}
      <p className="xray-headline" aria-label="Scan summary">
        {noMatches ? "No atlas technologies found." : <>
          <strong>{plural(counts.technologies, "technology", "technologies")}</strong>
          {" "}across {plural(counts.fields, "field", "fields")}
          {counts.concepts > 0 ? <>, plus {plural(counts.concepts, "concept", "concepts")}</> : null}
          {scan.summary.unmapped_package_count > 0
            ? <span className="muted"> · {plural(scan.summary.unmapped_package_count, "package", "packages")} not in the atlas yet</span> : null}
        </>}
      </p>

      {/* One primary action (the shareable card), the map view switch, and a small menu. */}
      <div className="xray-actions">
        {!noMatches && <button type="button" className="xray-focus primary" onClick={() => setCardOpen(true)}>
          Open report card
        </button>}
        <div className="xray-viewswitch" role="group" aria-label="How to show the stack on the map">
          <button type="button" className={view === "universe" ? "active" : ""} aria-pressed={view === "universe"}
            onClick={() => onViewChange("universe")}>On the atlas</button>
          <button type="button" className={view === "stack" ? "active" : ""} aria-pressed={view === "stack"}
            onClick={() => onViewChange("stack")}>Grouped by field</button>
        </div>
        <details className="xray-more">
          <summary aria-label="More actions">More <span aria-hidden>▾</span></summary>
          {/* Choosing an item closes the menu so it never covers the results below. */}
          <div className="xray-more-menu" onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}>
            <button type="button" onClick={onFocusStack}>Re-centre the map on the stack</button>
            {repoUrl && <a href={repoUrl as string} target="_blank" rel="noreferrer noopener">Open on GitHub ↗</a>}
            <CopyAndDownload scan={scan} nodesById={nodesById} domainsById={domainsById} />
            <button type="button" onClick={onAnalyzeAnother}>{liveEnabled ? "Scan another repository" : "More example scans"}</button>
          </div>
        </details>
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

      {learnNext.length > 0 && <section className="xray-learn-next" aria-label="What to learn next">
        <h3>What to learn next</h3>
        <p>Technologies connected to your detected stack.</p>
        <ul>{learnNext.map((item) => <li key={item.id}><button type="button" onClick={() => onFocusNode(item.id)}>{item.label} <span>{item.connections} links</span></button></li>)}</ul>
      </section>}

      <ScanStatsPanel scan={scan} nodesById={nodesById} domainsById={domainsById} />

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
        {scan.coverage.manifests_inspected > 0
          ? ` · ${scan.coverage.manifests_inspected} manifest/config file(s)`
          : ""}
        {scan.coverage.all_important_inspected === false || scan.coverage.tree_truncated
          ? " · some manifests not seen (tree truncated)"
          : ""}
        .
        {typeof scan.coverage.source_files_skipped === "number" &&
          scan.coverage.source_files_skipped > 0 && (
            <> A representative subset of source files was analyzed; dependency detection
              relies on the fully-inspected manifests.</>
          )}
      </p>
    </div>
  );
}

function ScanStatsPanel({ scan, nodesById, domainsById }: {
  scan: RepoScan; nodesById: Map<string, GraphNode>; domainsById: Map<string, DomainSummary>;
}) {
  const stats = useMemo(() => computeScanStats(scan, nodesById, domainsById), [scan, nodesById, domainsById]);
  if (stats.detected === 0) return null;
  const max = Math.max(...stats.fields.map((f) => f.count), 1);
  return (
    <details className="xray-stats" aria-label="Scan statistics">
      <summary className="xray-section-title">How this stack breaks down</summary>
      <div className="xray-stat-grid">
        <div><strong>{stats.fieldsTouched}<small> of {stats.fieldsTotal}</small></strong><span>fields of the atlas</span></div>
        <div><strong>{stats.evidenceFiles.toLocaleString("en-US")}</strong><span>files it was found in</span></div>
      </div>

      <h4 className="xray-stat-h">How sure the scan is</h4>
      <div className="xray-conf-bar" role="img" aria-label={CONFIDENCE_ORDER.map((k) => `${stats.confidence[k]} ${STATUS_LABEL[k].toLowerCase()}`).join(", ")}>
        {CONFIDENCE_ORDER.filter((k) => stats.confidence[k]).map((k) =>
          <span key={k} className={`status-${k}`} style={{ flexGrow: stats.confidence[k] }} />)}
      </div>
      <ul className="xray-conf-legend">
        {CONFIDENCE_ORDER.filter((k) => stats.confidence[k]).map((k) =>
          <li key={k}><span className={`xray-dot status-${k}`} aria-hidden />{STATUS_LABEL[k]} <b>{stats.confidence[k]}</b></li>)}
      </ul>

      <h4 className="xray-stat-h">By field (technologies and concepts)</h4>
      <ul className="xray-field-bars">
        {stats.fields.map((f) => (
          <li key={f.id} title={`${f.technologies} technologies, ${f.concepts} concepts · ${f.count} of ${f.atlasTotal} in this field`}>
            <span className="xray-field-name">{f.name}</span>
            <span className="xray-field-track"><span style={{ width: `${(f.count / max) * 100}%`, background: f.color }} /></span>
            <span className="xray-field-n">{f.count}</span>
          </li>
        ))}
      </ul>

      {stats.ecosystems.length > 0 && <>
        <h4 className="xray-stat-h">Package ecosystems</h4>
        <p className="xray-eco">{stats.ecosystems.map((e) => <span key={e.name}>{e.name} <b>{e.count.toLocaleString("en-US")}</b></span>)}</p>
      </>}
      {(stats.direct > 0 || stats.transitive > 0) && (
        <p className="muted xray-deps">{stats.direct} direct · {stats.transitive} transitive dependencies</p>
      )}
    </details>
  );
}
