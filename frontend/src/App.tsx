import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type { DomainSummary, GraphNode, GraphResponse } from "./api/types";
import { GraphCanvas } from "./components/GraphCanvas";
import { SearchCommand } from "./components/SearchCommand";
import { NodeDetailsPanel } from "./components/NodeDetailsPanel";
import { DomainLegend } from "./components/DomainLegend";
import { FilterPanel } from "./components/FilterPanel";
import { applyFilters, emptyFilter, isEmptyFilter, type FilterState } from "./graph/filters";
import { RepoXrayPanel } from "./components/RepoXrayPanel";
import { XrayLegend } from "./components/XrayLegend";
import { useRepoScan } from "./graph/useRepoScan";
import { buildOverlay } from "./graph/scanOverlay";
import { SCANNER_ENABLED } from "./api/scanner";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: GraphResponse; domains: DomainSummary[] };

// Deep-link helpers (spec §5.9): /technology/python, /concept/authentication, etc.
// Base-aware so they work under a GitHub Pages sub-path (e.g. /TechAtlas/).
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, ""); // "" or "/TechAtlas"

function slugFromPath(): string | null {
  let path = window.location.pathname;
  if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length);
  const m = path.match(/^\/(technology|concept|domain)\/([a-z0-9-]+)$/);
  return m ? m[2] : null;
}
function pathForNode(nodeType: string, slug: string): string {
  return `${BASE_PATH}/${nodeType}/${slug}`;
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(emptyFilter());
  const [xrayOpen, setXrayOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const { phase: scanPhase, analyze, reset: resetScan } = useRepoScan();

  // Initial data load.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.graph(controller.signal), api.domains(controller.signal)])
      .then(([graph, domains]) => {
        setState({ status: "ready", graph, domains });
        const deep = slugFromPath();
        if (deep) {
          const node = graph.nodes.find((n) => n.slug === deep);
          if (node) {
            setSelected(node.id);
            setFocus(node.id);
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setState({ status: "error", message: "Could not reach the graph API." });
        }
      });
    return () => controller.abort();
  }, []);

  // Resolve a slug-or-id to a node id, update selection, camera, and URL.
  const navigate = useCallback(
    (slugOrId: string) => {
      if (state.status !== "ready") return;
      const node =
        state.graph.nodes.find((n) => n.id === slugOrId) ??
        state.graph.nodes.find((n) => n.slug === slugOrId);
      if (!node) return;
      setSelected(node.id);
      setFocus(node.id);
      window.history.replaceState(null, "", pathForNode(node.node_type, node.slug));
    },
    [state],
  );

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSelected(null);
        window.history.replaceState(null, "", BASE_PATH ? `${BASE_PATH}/` : "/");
        return;
      }
      navigate(id);
    },
    [navigate],
  );

  // Compute visible node/edge sets from the active filter. null = no filter (show all),
  // so GraphCanvas skips hiding entirely. Memoized so we don't recompute per render.
  const graphData = state.status === "ready" ? state.graph : null;
  const visible = useMemo(() => {
    if (!graphData || isEmptyFilter(filter)) return null;
    return applyFilters(graphData, filter);
  }, [graphData, filter]);

  // The active scan (completed or partial) drives the graph overlay.
  const activeScan = scanPhase.kind === "done" ? scanPhase.scan : null;
  const overlay = useMemo(() => {
    if (!graphData || !activeScan) return null;
    return buildOverlay(activeScan, graphData);
  }, [graphData, activeScan]);

  // id -> node and id -> domain lookups for the summary panel.
  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    if (graphData) for (const n of graphData.nodes) m.set(n.id, n);
    return m;
  }, [graphData]);
  const domainsById = useMemo(() => {
    const m = new Map<string, DomainSummary>();
    if (state.status === "ready") for (const d of state.domains) m.set(d.id, d);
    return m;
  }, [state]);

  const exitXray = useCallback(() => {
    resetScan();
    setXrayOpen(false);
  }, [resetScan]);

  const focusStack = useCallback(() => setFitNonce((n) => n + 1), []);

  if (state.status === "loading") {
    return (
      <div className="app-loading" role="status">
        Loading the technology universe…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="app-error" role="alert">
        <h1>TechAtlas</h1>
        <p>{state.message}</p>
        <p className="muted">
          Start the backend (<code>uvicorn app.main:app</code> in <code>/backend</code>)
          and reload.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">TechAtlas</span>
          <span className="brand-sub">the technology knowledge graph</span>
        </div>
        <SearchCommand onPick={navigate} />
        {SCANNER_ENABLED && !xrayOpen && (
          <button
            type="button"
            className="xray-entry"
            onClick={() => setXrayOpen(true)}
          >
            Repo X-Ray
          </button>
        )}
        <div className="topbar-meta">
          <span>
            {state.graph.nodes.length} nodes · {state.graph.edges.length} edges
          </span>
        </div>
      </header>

      <main className="stage">
        <GraphCanvas
          data={state.graph}
          selectedId={selected}
          focusId={focus}
          onSelect={handleSelect}
          visibleNodes={visible ? visible.nodes : null}
          visibleEdges={visible ? visible.edges : null}
          scanStatusByNode={overlay ? overlay.statusByNode : null}
          scanHighlightEdges={overlay ? overlay.highlightEdges : null}
          fitSignal={
            overlay && fitNonce > 0
              ? { ids: [...overlay.detectedNodes], nonce: fitNonce }
              : null
          }
        />
        {xrayOpen ? (
          <RepoXrayPanel
            phase={scanPhase}
            onAnalyze={analyze}
            onExit={exitXray}
            onFocusStack={focusStack}
            onFocusNode={navigate}
            nodesById={nodesById}
            domainsById={domainsById}
          />
        ) : (
          <FilterPanel domains={state.domains} filter={filter} onChange={setFilter} />
        )}
        {overlay && <XrayLegend />}
        <DomainLegend domains={state.domains} onPick={navigate} />
        {selected && (
          <NodeDetailsPanel
            // Pass the node's canonical slug (resolved from the loaded graph) rather
            // than its id: static detail files are keyed by slug, and a node's id
            // suffix is not guaranteed to equal its slug (e.g. technology:tailwind /
            // slug tailwind-css). Fall back to the raw selection if not yet loaded.
            slugOrId={
              state.graph.nodes.find((n) => n.id === selected)?.slug ?? selected
            }
            nodeId={selected}
            scan={activeScan}
            onClose={() => handleSelect(null)}
            onNavigate={navigate}
          />
        )}
      </main>
    </div>
  );
}
