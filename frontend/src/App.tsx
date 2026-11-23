import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import type { DomainSummary, GraphNode, GraphResponse, NeighborEdge, SearchResult } from "./api/types";
import { GraphCanvas } from "./components/GraphCanvas";
import { SearchCommand } from "./components/SearchCommand";
import { NodeDetailsPanel } from "./components/NodeDetailsPanel";
import { EdgeDetailsPanel } from "./components/EdgeDetailsPanel";
import { RelationshipLegend } from "./components/RelationshipLegend";
import { DomainLegend } from "./components/DomainLegend";
import { applyFilters, emptyFilter, isEmptyFilter, type FilterState } from "./graph/filters";
import { XrayLegend } from "./components/XrayLegend";
import { useRepoScan } from "./graph/useRepoScan";
import { buildOverlay } from "./graph/scanOverlay";
import { computeStackLayout, prominenceOf } from "./graph/stackLayout";
import type { StackNodeInput } from "./graph/stackLayout";
import { SCANNER_ENABLED, warmScanner } from "./api/scanner";
import { readExampleParam, writeExampleParam } from "./api/exampleScans";
import { Icon } from "./components/Icon";
import { journeys } from "./graph/journeys";
import { content, loadContent } from "./content/content";
import { readFilter, writeFilter, readCamera, writeCamera, readView, writeView } from "./graph/shareView";
import { OutlineView, supportsWebGL } from "./components/OutlineView";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { ReportCard } from "./components/ReportCard";
import { readCardParam, writeCardParam } from "./report/reportCard";
import { LearningPanel } from "./components/LearningPanel";
import { connectionPath } from "./graph/compare";
import { StackPanel } from "./components/StackPanel";
import { readStack, writeStack, type StackParams } from "./recommend/stackLink";
import { RolePanel } from "./components/RolePanel";
import { readRole, readRolesOpen, writeRole } from "./graph/roles";
import { AppsPanel } from "./components/AppsPanel";
import { ScrollRow } from "./components/ScrollRow";
import { useStepKeys } from "./components/StepNav";
import { arrowNav } from "./util/arrowNav";
import { readApp, readAppsOpen, writeApp } from "./graph/apps";
import { PathsLibrary } from "./components/PathsLibrary";
import {
  buildPathEntries, featuredPaths, readDonePaths, readPathProgress, suggestNextPath,
  writeDonePaths, writePathProgress,
} from "./graph/pathsLibrary";

// Repo X-Ray is a secondary mode, so keep it out of the main bundle.
const RepoXrayPanel = lazy(() => import("./components/RepoXrayPanel").then((m) => ({ default: m.RepoXrayPanel })));

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; graph: GraphResponse; domains: DomainSummary[] };

// Deep-link helpers (spec §5.9): /technology/python, /concept/authentication, etc.
// Base-aware so they work under a GitHub Pages sub-path (e.g. /TechAtlas/).
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, ""); // "" or "/TechAtlas"

function isAboutPath(): boolean {
  const path = BASE_PATH && window.location.pathname.startsWith(BASE_PATH) ? window.location.pathname.slice(BASE_PATH.length) : window.location.pathname;
  return /^\/about\/?$/.test(path);
}

function slugFromPath(): string | null {
  let path = window.location.pathname;
  if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length);
  const m = path.match(/^\/(technology|concept|domain)\/([a-z0-9-]+)$/);
  return m ? m[2] : null;
}
function pathForNode(nodeType: string, slug: string): string {
  return `${BASE_PATH}/${nodeType}/${slug}${window.location.search}`;
}

// Measure the actual on-screen width of the open right-edge panel (detail panel if it
// overlays, else the X-Ray summary). Returns 0 when nothing is open, so the camera fit
// uses true available canvas and never double-counts a fixed sidebar width (UI-C).
function measureRightPanelWidth(): number {
  if (typeof document === "undefined") return 0;
  const detail = document.querySelector(".details") as HTMLElement | null;
  const xray = document.querySelector(".xray-panel") as HTMLElement | null;
  const el = detail ?? xray;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Math.round(rect.width + 14); // include the 14px gutter
}

/** Counts in the UI always get thousands separators: 3,122 not 3122. */
const fmt = (n: number) => n.toLocaleString("en-US");

import { usePanelFocus } from "./util/usePanelFocus";

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [initialCamera] = useState(() => readCamera(window.location.search));
  // Read before any effect rewrites the query string.
  const [initialExample] = useState(() => readExampleParam(window.location.search));
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [previewEdge, setPreviewEdge] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>(() => readFilter(window.location.search));
  const [xrayOpen, setXrayOpen] = useState(false);
  useEffect(() => {
    const query = writeFilter(window.location.search, filter);
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [filter]);
  const [fitNonce, setFitNonce] = useState(0);
  // Bumped to re-fit the default Explore atlas camera when returning from Repo X-Ray.
  const [exploreNonce, setExploreNonce] = useState(0);
  // UI-C: domain legend auto-minimizes during Repo X-Ray to free canvas space;
  // the user can reopen it any time (it stays mounted as a reopen control).
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  // UI-E req 1: on mobile the filter sheet is closed by default (graph-first);
  // an accessible Filters control opens/closes it. Ignored on desktop (CSS).
  const [theme, setTheme] = useState<"dark" | "light">(() => window.localStorage.getItem("techatlas-theme") === "light" ? "light" : "dark");
  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem("techatlas-theme", theme); }, [theme]);
  const [aboutOpen, setAboutOpen] = useState(isAboutPath);
  const [aboutReturn, setAboutReturn] = useState(`${BASE_PATH || ""}/`);
  useEffect(() => {
    const sync = () => setAboutOpen(isAboutPath());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const openAbout = () => {
    setAboutReturn(`${window.location.pathname}${window.location.search}`);
    window.history.pushState(null, "", `${BASE_PATH}/about`);
    setAboutOpen(true);
    setHeroVisible(false);
  };
  const closeAbout = () => {
    window.history.replaceState(null, "", aboutReturn);
    setAboutOpen(false);
  };
  const [compareMode, setCompareMode] = useState(false);
  const [compareFirst, setCompareFirst] = useState<string | null>(null);
  const [compareSecond, setCompareSecond] = useState<string | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const [journeyIndex, setJourneyIndex] = useState<number | null>(null);
  // Stack recommender (Phase 2): its inputs live in the URL so a copied link reopens it.
  const [stackParams, setStackParams] = useState<StackParams>(() => readStack(window.location.search));
  const [stackHighlight, setStackHighlight] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });
  const onStackHighlight = useCallback((nodes: string[], edges: string[]) => setStackHighlight({ nodes, edges }), []);
  const openStack = useCallback((open: boolean) => setStackParams((p) => ({ ...p, open })), []);
  useEffect(() => {
    const query = writeStack(window.location.search, stackParams);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [stackParams]);
  // Role / career lens: ?role=<id> reopens a role's path.
  const [roleOpen, setRoleOpen] = useState(() => readRolesOpen(window.location.search));
  const [roleId, setRoleId] = useState<string | null>(() => readRole(window.location.search));
  const [roleHighlight, setRoleHighlight] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });
  const onRoleHighlight = useCallback((nodes: string[], edges: string[]) => setRoleHighlight({ nodes, edges }), []);
  useEffect(() => {
    const query = writeRole(window.location.search, roleOpen ? roleId : null, roleOpen);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [roleOpen, roleId]);
  // Famous apps: ?app=<id> reopens an app's stack (?app= alone opens the list).
  const [appsOpen, setAppsOpen] = useState(() => readAppsOpen(window.location.search));
  const [appId, setAppId] = useState<string | null>(() => readApp(window.location.search));
  const [appHighlight, setAppHighlight] = useState<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });
  const onAppHighlight = useCallback((nodes: string[], edges: string[]) => setAppHighlight({ nodes, edges }), []);
  useEffect(() => {
    const query = writeApp(window.location.search, appsOpen, appId);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [appsOpen, appId]);
  const [journeyStep, setJourneyStep] = useState(0);
  const [desktopRail, setDesktopRail] = useState<"domains" | "filters" | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // A shared report card for any scanned repo: ?card=<owner/name>~<slugs>, rendered from the atlas alone.
  const [sharedCard, setSharedCard] = useState(() => readCardParam(window.location.search));
  const closeSharedCard = useCallback(() => {
    setSharedCard(null);
    const query = writeCardParam(window.location.search, null);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);
  const [webgl] = useState(supportsWebGL);
  const [donePaths, setDonePaths] = useState<Set<string>>(readDonePaths);
  const [pathProgress, setPathProgress] = useState<Record<string, number>>(readPathProgress);
  const [pathsOpen, setPathsOpen] = useState(false);
  // Opening the paths library closes the other atlas modes, so a path never starts under them.
  const openPaths = useCallback(() => {
    setCompareMode(false);
    openStack(false);
    setRoleOpen(false);
    setAppsOpen(false);
    setPathsOpen(true);
  }, [openStack]);
  const [pathCopied, setPathCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreAt, setMoreAt] = useState<{ top: number; right: number }>({ top: 56, right: 8 });
  useEffect(() => {
    if (!moreOpen) return;
    // Esc or a click anywhere else closes the More menu.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    const onDown = (e: MouseEvent) => { if (!(e.target as Element).closest(".tools-more, .tools-more-toggle")) setMoreOpen(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [moreOpen]);
  // Opening a tool's panel moves focus into it; closing it returns focus to the tool.
  usePanelFocus(roleOpen, ".role-panel");
  usePanelFocus(appsOpen, ".apps-panel");
  usePanelFocus(stackParams.open, ".stack-panel:not(.role-panel):not(.apps-panel)");
  usePanelFocus(pathsOpen, ".paths-library");
  usePanelFocus(learningOpen, ".learning-panel");
  usePanelFocus(compareMode, ".compare-panel:not(.learning-panel)");
  const [announcement, setAnnouncement] = useState("");
  // Tablet/phone breakpoint, tracked so resizing across it re-renders the legend state.
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setCompact(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // X-Ray opens on the full atlas with detections highlighted. Stack is the
  // optional clustered reprojection of the same scan.
  const [xrayView, setXrayView] = useState<"stack" | "universe">("universe");
  // Track narrow (mobile) viewports so Stack View can lay clusters in a single column
  // that fits the portrait band above the bottom sheet.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // Mobile bottom-sheet collapse: lets users minimize the panel to a thin bar and
  // explore the full-height visualization. Reframes the camera when toggled.
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  // First-load story: a one-line hero that fades on the first interaction with the atlas.
  const [heroVisible, setHeroVisible] = useState(() => !slugFromPath() && !isAboutPath());
  useEffect(() => {
    if (!heroVisible) return;
    const hide = () => setHeroVisible(false);
    const events = ["wheel", "keydown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, hide, { once: true, passive: true });
    const canvas = () => document.querySelector(".graph-canvas");
    const onDown = (e: PointerEvent) => { if (canvas()?.contains(e.target as Node)) hide(); };
    window.addEventListener("pointerdown", onDown);
    return () => {
      for (const e of events) window.removeEventListener(e, hide);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [heroVisible]);
  useEffect(() => { if (selected || xrayOpen || compareMode || journeyIndex !== null || stackParams.open || roleOpen || appsOpen) setHeroVisible(false); }, [selected, xrayOpen, compareMode, journeyIndex, stackParams.open, roleOpen, appsOpen]);
  useEffect(() => { if (selected || xrayOpen || compareMode || journeyIndex !== null || pathsOpen) setHeroVisible(false); }, [selected, xrayOpen, compareMode, journeyIndex, pathsOpen]);
  // Keep the hero mounted briefly after dismissal so it can fade out instead of vanishing.
  // Fullscreen: the browser Fullscreen API where available, plus an immersive layout that
  // hides the chrome so the atlas fills the screen (also the fallback on iPhone Safari).
  const [immersive, setImmersive] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const root = document.documentElement;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (immersive) { setImmersive(false); return; }
    setImmersive(true);
    if (root.requestFullscreen) root.requestFullscreen().catch(() => { /* immersive layout still applies */ });
  }, [immersive]);
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "f" || event.key === "F") { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === "?") { event.preventDefault(); setHelpOpen((v) => !v); }
      else if (event.key === "o" || event.key === "O") { event.preventDefault(); setOutlineOpen((v) => !v); }
      else if (event.key === "m" || event.key === "M") { event.preventDefault(); setLearningOpen((v) => !v); }
      else if (event.key === "p" || event.key === "P") { event.preventDefault(); if (pathsOpen) setPathsOpen(false); else openPaths(); }
      else if (event.key === "Escape" && immersive && !document.fullscreenElement) setImmersive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, immersive, pathsOpen, openPaths]);
  // The canvas changes size when the chrome hides or shows; re-frame the atlas after it.
  const firstImmersive = useRef(true);
  useEffect(() => {
    if (firstImmersive.current) { firstImmersive.current = false; return; }
    if (immersive) setHeroVisible(false);
    const t = window.setTimeout(() => { window.dispatchEvent(new Event("resize")); setExploreNonce((n) => n + 1); }, 180);
    return () => window.clearTimeout(t);
  }, [immersive]);
  const [heroRendered, setHeroRendered] = useState(heroVisible);
  useEffect(() => {
    if (heroVisible) { setHeroRendered(true); return; }
    const t = window.setTimeout(() => setHeroRendered(false), 220);
    return () => window.clearTimeout(t);
  }, [heroVisible]);
  const { phase: scanPhase, analyze, loadExample, reset: resetScan } = useRepoScan();
  // X-Ray is always reachable: with no scanner backend it offers pre-computed example
  // scans, and with one it offers both (examples load instantly while the backend wakes).
  const openXray = useCallback(() => { void warmScanner(); setXrayOpen(true); }, []);
  // Keep the open example in the URL (?xray=<slug>) so an example result can be shared.
  const exampleSlug = xrayOpen && scanPhase.kind === "done" ? scanPhase.example ?? null : null;
  useEffect(() => {
    const query = writeExampleParam(window.location.search, exampleSlug);
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [exampleSlug]);

  // Auto-minimize the domain legend on entering X-Ray; restore on leaving.
  // Auto-minimize the domain legend when entering X-Ray OR on narrow (mobile/tablet)
  // viewports, so the graph is not buried; the user can still reopen it. Re-evaluates on
  // resize so rotating or resizing updates the default.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setLegendCollapsed(xrayOpen || mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [xrayOpen]);

  // UI-C refinement 1: while a node detail overlays the X-Ray summary, make the
  // underlying summary inert so there are never two simultaneously-interactive
  // overlapping panels (one navigational surface). Restored when the detail closes.
  useEffect(() => {
    const xray = document.querySelector(".xray-panel") as HTMLElement | null;
    if (!xray) return;
    if (selected && xrayOpen) {
      xray.setAttribute("inert", "");
      xray.setAttribute("aria-hidden", "true");
    } else {
      xray.removeAttribute("inert");
      xray.removeAttribute("aria-hidden");
    }
    return () => {
      xray.removeAttribute("inert");
      xray.removeAttribute("aria-hidden");
    };
  }, [selected, xrayOpen]);

  // Initial data load.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.graph(controller.signal), api.domains(controller.signal),
      // A missing content chunk should not stop the atlas from drawing; paths, roles and apps stay empty.
      loadContent().catch(() => content())])
      .then(([graph, domains, { journeys: paths }]) => {
        setState({ status: "ready", graph, domains });
        const shared = readView(window.location.search, paths.map((j) => j.title));
        const ids = new Set(graph.nodes.map((n) => n.id));
        if (shared.path !== null) {
          const steps = paths[shared.path].steps;
          const step = Math.min(shared.step, steps.length - 1);
          setJourneyIndex(shared.path);
          setJourneyStep(step);
          setSelected(steps[step].id);
          setFocus(steps[step].id);
        } else if (shared.compare && ids.has(shared.compare[0])) {
          setCompareMode(true);
          setCompareFirst(shared.compare[0]);
          setCompareSecond(shared.compare[1] && ids.has(shared.compare[1]) ? shared.compare[1] : null);
          const second = shared.compare[1] && ids.has(shared.compare[1]) ? shared.compare[1] : null;
          setCompareSecond(second);
          setSelected(second ?? shared.compare[0]);
          setFocus(second ?? shared.compare[0]);
        }
        if (initialExample) { setXrayOpen(true); loadExample(initialExample); }
        const deep = shared.path === null ? slugFromPath() : null;
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
    (slugOrId: string, keepCompare = false) => {
      if (state.status !== "ready") return;
      const node =
        state.graph.nodes.find((n) => n.id === slugOrId) ??
        state.graph.nodes.find((n) => n.slug === slugOrId);
      if (!node) return;
      if (compareMode && !keepCompare && node.node_type === "technology") {
        if (!compareFirst || compareSecond) { setCompareFirst(node.id); setCompareSecond(null); }
        else if (node.id !== compareFirst) setCompareSecond(node.id);
      }
      setSelectedEdge(null);
      setPreviewEdge(null);
      setSelected(node.id);
      setFocus(node.id);
      // Each newly opened node is its own history entry, so the browser's Back button
      // returns to the previous node (selection history); re-opening the same one doesn't.
      const target = pathForNode(node.node_type, node.slug);
      if (`${window.location.pathname}${window.location.search}` === target) window.history.replaceState(null, "", target);
      else window.history.pushState(null, "", target);
    },
    [state, compareMode, compareFirst, compareSecond],
  );

  useEffect(() => {
    if (state.status !== "ready") return;
    const onPop = () => {
      if (isAboutPath()) return;
      const slug = slugFromPath();
      const node = slug ? state.graph.nodes.find((n) => n.slug === slug) : null;
      setSelectedEdge(null);
      setPreviewEdge(null);
      setSelected(node ? node.id : null);
      setFocus(node ? node.id : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [state]);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedEdge(null);
      setPreviewEdge(null);
      if (id === null) {
        setSelected(null);
        setFocus(null);
        // Closing a node is a step too: Back reopens it.
        const home = `${BASE_PATH || ""}/${window.location.search}`;
        if (slugFromPath()) window.history.pushState(null, "", home); else window.history.replaceState(null, "", home);
        return;
      }
      navigate(id);
    },
    [navigate],
  );

  const handleSelectEdge = useCallback((id: string) => {
    if (state.status !== "ready" || !state.graph.edges.some((edge) => edge.id === id)) return;
    setSelected(null);
    setFocus(null);
    setSelectedEdge(id);
  }, [state]);

  const previewRelationship = useCallback((neighbor: NeighborEdge | null) => {
    if (!neighbor || !selected || state.status !== "ready") { setPreviewEdge(null); return; }
    const edge = state.graph.edges.find((item) => item.relationship_type === neighbor.relationship_type &&
      (neighbor.direction === "out" ? item.source === selected && item.target === neighbor.node.id
        : neighbor.direction === "in" ? item.target === selected && item.source === neighbor.node.id
          : (item.source === selected && item.target === neighbor.node.id) ||
            (item.target === selected && item.source === neighbor.node.id)));
    setPreviewEdge(edge?.id ?? null);
  }, [selected, state]);

  // Keep guided-path and compare state in the URL so a copied link restores the view.
  useEffect(() => {
    if (state.status !== "ready") return;
    const query = writeView(window.location.search, {
      path: journeyIndex,
      step: journeyStep,
      compare: compareMode && compareFirst ? [compareFirst, compareSecond] : null,
    }, journeys().map((j) => j.title));
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [state.status, journeyIndex, journeyStep, compareMode, compareFirst, compareSecond]);



  // Screen-reader announcement for every selection made on the canvas, by keyboard or search.
  useEffect(() => {
    if (state.status !== "ready" || !selected) return;
    const node = state.graph.nodes.find((n) => n.id === selected);
    if (!node) return;
    const links = state.graph.edges.filter((e) => e.source === selected || e.target === selected).length;
    const domain = state.domains.find((d) => d.id === node.primary_domain);
    const kind = node.node_type === "domain" ? "domain" : `${node.node_type}${domain ? ` in ${domain.name}` : ""}`;
    setAnnouncement(`Selected ${node.label}, ${kind}, ${links} connection${links === 1 ? "" : "s"}.`);
  }, [selected, state]);

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

  // Show detections on the full atlas when a new scan completes.
  useEffect(() => {
    if (activeScan) {
      setXrayView("universe");
      // Graph-first on narrow mobile: default the results sheet to MINIMIZED after a
      // scan so the Stack View is immediately visible and not covered. The obvious
      // "View scan results" control expands it. Desktop has no sheet, so keep it open.
      setSheetCollapsed(narrow);
    }
  }, [activeScan, narrow]);

  // Temporary Stack-View projection: cluster detected nodes by canonical primary_domain.
  // Pure + deterministic; never mutates canonical coordinates (GraphCanvas restores them).
  const learnNext = useMemo(() => {
    if (!overlay || !graphData) return [];
    const scores = new Map<string, number>();
    for (const edge of graphData.edges) {
      if (edge.relationship_type === "belongs_to_domain") continue;
      const sourceDetected = overlay.detectedNodes.has(edge.source);
      const targetDetected = overlay.detectedNodes.has(edge.target);
      if (sourceDetected === targetDetected) continue;
      const candidate = sourceDetected ? edge.target : edge.source;
      if (graphData.nodes.find((node) => node.id === candidate)?.node_type !== "technology") continue;
      scores.set(candidate, (scores.get(candidate) ?? 0) + 1);
    }
    return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
      .map(([id, connections]) => ({ id, label: graphData.nodes.find((node) => node.id === id)?.label ?? id, connections }));
  }, [overlay, graphData]);

  const stackView = useMemo(() => {
    if (!overlay || !graphData || xrayView !== "stack") return null;
    const byId = new Map(graphData.nodes.map((n) => [n.id, n]));
    const inputs: StackNodeInput[] = [];
    for (const [id, status] of overlay.statusByNode) {
      const node = byId.get(id);
      if (!node) continue;
      inputs.push({
        id,
        primaryDomain: node.primary_domain,
        nodeType: node.node_type,
        status,
        size: node.size,
        prominence: prominenceOf(node.node_type, node.node_subtype),
      });
    }
    if (inputs.length === 0) return null;
    // Narrow screens: single column of clusters (tall, portrait-friendly) so the
    // camera can frame them in the band above the bottom sheet.
    return computeStackLayout(inputs, narrow ? { cols: 1, nodeCols: 2 } : {});
  }, [overlay, graphData, xrayView, narrow]);

  const stackPositions = stackView?.positions ?? null;

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

  const searchLookup = useCallback((id: string): SearchResult | null => {
    const n = nodesById.get(id);
    return n ? { id: n.id, slug: n.slug, name: n.label, node_type: n.node_type, node_subtype: n.node_subtype ?? null, primary_domain: n.primary_domain, matched_on: "recent" } : null;
  }, [nodesById]);

  // Domain cluster headings (name + color from canonical domain metadata) for the overlay.
  const stackHeadings = useMemo(() => {
    if (!stackView) return null;
    return stackView.clusters.map((c) => {
      const dom = domainsById.get(c.domainId);
      return {
        domainId: c.domainId,
        label: dom?.name ?? "Other",
        color: dom?.color ?? "#8a93ab",
        x: c.heading.x,
        y: c.heading.y,
      };
    });
  }, [stackView, domainsById]);

  // Return to the Explore homepage: fully EXIT Repo X-Ray and restore the default experience
  // (no scan overlay, no scan-specific selection/filtering, no leftover Stack View positions,
  // default atlas camera). No page reload; pure app-state reset + a camera reframe.
  const exitXray = useCallback(() => {
    resetScan();                       // clear scan phase/overlay (removes scanner colours,
                                       // highlighted/hidden edges, detection rings)
    setXrayOpen(false);                // close the results panel / X-Ray interface
    setCompareMode(false);
    setJourneyIndex(null);
    openStack(false);
    setRoleOpen(false);
    setAppsOpen(false);
    setSheetCollapsed(false);          // reset the mobile sheet state
    setXrayView("universe");           // reset the X-Ray view mode for next time
    setSelected(null);                 // drop scan-specific selection
    setSelectedEdge(null);
    setFocus(null);
    setFilter(emptyFilter());          // clear any active filtering
    setExploreNonce((n) => n + 1);     // re-fit the default atlas camera (clears Stack bbox)
  }, [resetScan, openStack]);

  const focusStack = useCallback(() => setFitNonce((n) => n + 1), []);
  const journey = journeyIndex === null ? null : journeys()[journeyIndex];
  const journeyNodeIds = useMemo(() => journey?.steps.map((step) => step.id) ?? [], [journey]);
  const journeyEdgeIds = useMemo(() => {
    if (!journey || !graphData) return [];
    return journey.steps.slice(1).map((step, i) => graphData.edges.find((edge) =>
      (edge.source === journey.steps[i].id && edge.target === step.id) ||
      (edge.target === journey.steps[i].id && edge.source === step.id))?.id).filter((id): id is string => !!id);
  }, [journey, graphData]);
  // The highlighted set the camera frames inside the visible area: a followed path's stops,
  // or the nodes a stack, role or app lights up. The key changes when the set does.
  const frameSet = useMemo(() => {
    const pick = (mode: string, ids: string[]) => ids.length ? { ids, key: `${mode}:${ids.length}:${ids[0]}:${ids[ids.length - 1]}` } : null;
    if (journey && journeyIndex !== null) return { ids: journeyNodeIds, key: `path:${journeyIndex}:${journeyStep}` };
    if (stackParams.open) return pick("stack", stackHighlight.nodes);
    if (roleOpen) return pick(`role-${roleId}`, roleHighlight.nodes);
    if (appsOpen) return pick(`app-${appId}`, appHighlight.nodes);
    return null;
  }, [journey, journeyIndex, journeyStep, journeyNodeIds, stackParams.open, stackHighlight, roleOpen, roleId, roleHighlight, appsOpen, appId, appHighlight]);
  // Every guided path with its field, step labels and search text, for the library.
  const pathEntries = useMemo(() => buildPathEntries(journeys(), nodesById, domainsById), [nodesById, domainsById]);
  // Remember how far each guided path got, and finished paths (reaching the last step counts).
  useEffect(() => {
    if (journeyIndex === null) return;
    const j = journeys()[journeyIndex];
    const slug = pathEntries[journeyIndex]?.slug;
    if (slug && journeyStep > (pathProgress[slug] ?? 0)) {
      const next = { ...pathProgress, [slug]: journeyStep };
      setPathProgress(next);
      writePathProgress(next);
    }
    if (journeyStep !== j.steps.length - 1 || donePaths.has(j.title)) return;
    const next = new Set(donePaths).add(j.title);
    setDonePaths(next);
    writeDonePaths(next);
  }, [journeyIndex, journeyStep, donePaths, pathProgress, pathEntries]);
  const startPath = useCallback((index: number, step = 0) => {
    setCompareMode(false);
    openStack(false);
    setRoleOpen(false);
    setAppsOpen(false);
    setPathsOpen(false);
    setJourneyIndex(index);
    setJourneyStep(step);
    navigate(journeys()[index].steps[step].id);
  }, [navigate, openStack]);
  // [ / ] and the ← Previous / Next → buttons step through the guided path being followed.
  const journeyPrev = useMemo(() => journeyIndex === null || journeyStep === 0 ? null : () => {
    setJourneyStep(journeyStep - 1); navigate(journeys()[journeyIndex].steps[journeyStep - 1].id);
  }, [journeyIndex, journeyStep, navigate]);
  const journeyNext = useMemo(() => journeyIndex === null || journeyStep >= journeys()[journeyIndex].steps.length - 1 ? null : () => {
    setJourneyStep(journeyStep + 1); navigate(journeys()[journeyIndex].steps[journeyStep + 1].id);
  }, [journeyIndex, journeyStep, navigate]);
  useStepKeys(journeyIndex !== null && !xrayOpen && !pathsOpen && !roleOpen && !appsOpen, journeyPrev, journeyNext);
  const nextPath = useMemo(() => journeyIndex === null || journeyStep !== journeys()[journeyIndex].steps.length - 1
    ? null : suggestNextPath(pathEntries, journeys(), journeyIndex, donePaths), [pathEntries, journeyIndex, journeyStep, donePaths]);
  // A returning visitor with an unfinished path is offered to pick it up from the hero.
  const resumePath = useMemo(() => {
    const started = pathEntries.filter((e) => !donePaths.has(e.title) && (pathProgress[e.slug] ?? 0) > 0);
    return started.length ? started[started.length - 1] : null;
  }, [pathEntries, donePaths, pathProgress]);
  const heroPaths = useMemo(() => featuredPaths(pathEntries).slice(0, 3), [pathEntries]);

  const comparison = useMemo(() => {
    if (!graphData || !compareFirst || !compareSecond) return null;
    const neighbors = (id: string) => new Set(graphData.edges.filter((edge) => edge.source === id || edge.target === id)
      .map((edge) => edge.source === id ? edge.target : edge.source));
    const first = neighbors(compareFirst), second = neighbors(compareSecond);
    return {
      shared: [...first].filter((id) => second.has(id)).filter((id) => nodesById.get(id)?.node_type !== "domain"),
      direct: graphData.edges.find((edge) => (edge.source === compareFirst && edge.target === compareSecond) ||
        (edge.target === compareFirst && edge.source === compareSecond))?.relationship_type ?? null,
      path: connectionPath(graphData, compareFirst, compareSecond),
      alternatives: [compareFirst, compareSecond].map((id) => graphData.edges.filter((edge) =>
        edge.relationship_type === "alternative_to" && (edge.source === id || edge.target === id))
        .map((edge) => edge.source === id ? edge.target : edge.source)),
    };
  }, [graphData, compareFirst, compareSecond, nodesById]);
  const edgeDetail = graphData?.edges.find((edge) => edge.id === selectedEdge) ?? null;

  if (state.status === "loading") {
    return (
      <div className="app-loading" role="status">
        Loading the atlas…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="app-error" role="alert">
        <h1>TechAtlas</h1>
        <p>{state.message}</p>
        {import.meta.env.VITE_STATIC_API !== "true" && <p className="muted">
          Start the backend (<code>uvicorn app.main:app</code> in <code>/backend</code>)
          and reload.
        </p>}
      </div>
    );
  }

  return (
    <div className={`app${immersive ? " is-immersive" : ""}`}>
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={aboutOpen ? closeAbout : exitXray}
          aria-label="TechAtlas: back to the atlas"
          title="Back to the atlas"
        >
          <svg className="brand-mark" viewBox="0 0 64 64" width="22" height="22" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#0b0e14" />
            <circle cx="32" cy="32" r="20" fill="none" stroke="#7aa2f7" strokeWidth="3" />
            <circle cx="32" cy="32" r="5" fill="#7aa2f7" />
            <circle cx="32" cy="12" r="4.5" fill="#bb9af7" />
            <circle cx="49.3" cy="42" r="4.5" fill="#9ece6a" />
            <circle cx="14.7" cy="42" r="4.5" fill="#e0af68" />
          </svg>
          <span className="brand-name">TechAtlas</span>
          <span className="brand-sub">the technology knowledge graph</span>
        </button>
        <SearchCommand onPick={navigate} domainsById={domainsById} lookup={searchLookup} />
        {/* One fixed label in every state: the pressed style shows X-Ray is open, and the
            panel's own "Back to atlas" closes it (no label swap that shifts the toolbar). */}
        {(
          <button
            type="button"
            className="xray-entry"
            aria-label="Repo X-Ray"
            aria-pressed={xrayOpen}
            title={xrayOpen ? "Close Repo X-Ray" : SCANNER_ENABLED ? "Scan a GitHub repository" : "See the stack behind famous repositories"}
            onClick={xrayOpen ? exitXray : openXray}
            onPointerEnter={() => { void warmScanner(); }}
            onFocus={() => { void warmScanner(); }}
          >
            <Icon name="scan" /><span>Repo X-Ray</span>
          </button>
        )}
        {/* Atlas tools: one quiet, uniform group. Labels collapse to icons on phones;
            each keeps its full accessible name. */}
        <ScrollRow className="topbar-tools-row" label="atlas modes">
        <nav className="topbar-tools" aria-label="Atlas modes" data-arrow-nav onKeyDown={arrowNav}>
          <button type="button" className="tool" aria-label="Compare"
            aria-pressed={compareMode} title="Compare two technologies" onClick={() => {
              setCompareMode((open) => !open); setJourneyIndex(null); openStack(false); setRoleOpen(false); setAppsOpen(false); setCompareFirst(selected && nodesById.get(selected)?.node_type === "technology" ? selected : null); setCompareSecond(null);
            }}><Icon name="compare" /><span>Compare</span></button>
          <button type="button" className="tool" aria-label="Stack recommender"
            aria-pressed={stackParams.open} title="Get a stack for your project, with reasons" onClick={() => {
              if (!stackParams.open) { setCompareMode(false); setJourneyIndex(null); setLearningOpen(false); setRoleOpen(false); setAppsOpen(false); }
              openStack(!stackParams.open);
            }}><Icon name="stack" /><span>Stack</span></button>
          <button type="button" className="tool" aria-label="Role paths"
            aria-pressed={roleOpen} title="What does a role need to know?" onClick={() => {
              if (!roleOpen) { setCompareMode(false); setJourneyIndex(null); setLearningOpen(false); openStack(false); setAppsOpen(false); }
              setRoleOpen(!roleOpen);
            }}><Icon name="role" /><span>Roles</span></button>
          <button type="button" className="tool" aria-label="Famous apps"
            aria-pressed={appsOpen} title="What are famous apps built with?" onClick={() => {
              if (!appsOpen) { setCompareMode(false); setJourneyIndex(null); setLearningOpen(false); openStack(false); setRoleOpen(false); }
              setAppsOpen(!appsOpen);
            }}><Icon name="apps" /><span>Apps</span></button>
          <button type="button" className="tool" aria-label="Guided paths" aria-haspopup="dialog"
            aria-pressed={pathsOpen || journeyIndex !== null} title="Browse guided paths (P)"
            onClick={openPaths}><Icon name="paths" /><span>Guided paths</span></button>
          {/* Tablets and small laptops: the five main tools keep their labels and the
              utilities move under one "More" button, instead of eleven unlabeled icons. */}
          <button type="button" className="tool tools-more-toggle" aria-label="More tools" aria-expanded={moreOpen}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMoreAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }); setMoreOpen((v) => !v); }}>
            <span aria-hidden>⋯</span><span>More</span></button>
          <div className={`tools-more${moreOpen ? " is-open" : ""}`} style={moreOpen ? moreAt : undefined} onClick={() => setMoreOpen(false)}>
            <button type="button" className="tool" aria-label="About the data" aria-pressed={aboutOpen}
              title="About the data" onClick={aboutOpen ? closeAbout : openAbout}>
              <Icon name="info" /><span>About</span></button>
            <button type="button" className="tool tool-icon" aria-label="Atlas outline" aria-pressed={outlineOpen}
              title="Atlas outline: every node as a list (O)" onClick={() => setOutlineOpen((v) => !v)}><Icon name="outline" /></button>
            <button type="button" className="tool tool-icon" aria-label="My learning map" aria-pressed={learningOpen}
              title="My learning map (M)" onClick={() => setLearningOpen((v) => !v)}><Icon name="bookmark" /></button>
            <button type="button" className="tool tool-icon tool-help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
              onClick={() => setHelpOpen(true)}><Icon name="help" /></button>
            <button type="button" className="tool tool-icon" aria-label="Enter fullscreen" title="Fullscreen (F)"
              onClick={toggleFullscreen}><Icon name="expand" /></button>
            <button type="button" className="tool tool-icon" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
          </div>
        </nav>
        </ScrollRow>
        <div className="topbar-meta">
          <span>
            {fmt(state.graph.nodes.length)} nodes · {fmt(state.graph.edges.length)} edges
          </span>
        </div>
      </header>

      {aboutOpen && <main className="about-page">
        <article className="about-panel" aria-label="About the data">
          <button type="button" className="about-back" onClick={closeAbout}>← Back to atlas</button>
          <h2>About the data</h2>
          <p>TechAtlas maps {fmt(state.graph.nodes.length)} fields, concepts, and technologies through {fmt(state.graph.edges.length)} typed relationships. Dataset version {state.graph.version}.</p>
          <h3>Sources</h3>
          <p>Names, descriptions, and relationships come from the curated <a href="https://github.com/rushilrawat/TechAtlas/tree/main/data">TechAtlas dataset</a>. Wikipedia summaries are shown with attribution in technology details. Optional popularity scores use GitHub activity and npm, PyPI, or crates.io downloads.</p>
          <h3>Where each feature gets its data</h3>
          <p><strong>Guided paths</strong> are hand-written step lists in <a href="https://github.com/rushilrawat/TechAtlas/blob/main/data/seed/journeys.json">journeys.json</a>. Each step is an atlas node, and the line drawn between steps follows a real relationship in the graph.</p>
          <p><strong>Roles</strong> are curated learning stages in <a href="https://github.com/rushilrawat/TechAtlas/blob/main/data/seed/roles.json">roles.json</a>. They describe a common path into the job, not a hiring requirement.</p>
          <p><strong>Apps</strong> lists come from each company's own engineering blog or talks, linked under every app in <a href="https://github.com/rushilrawat/TechAtlas/blob/main/data/seed/apps.json">apps.json</a>. They show what was publicly documented at the time, so a company may have changed tools since.</p>
          <p><strong>Stack</strong> picks are computed in your browser. A curated list says which technologies compete for each job, and the graph's relationships to what you already use, plus popularity, decide the order. The optional written explanation is generated by Claude, an AI model, when the server is configured, and can be wrong.</p>
          <p><strong>Compare</strong> reads the graph only: the direct relationship between the two, their listed alternatives, and the neighbors they share.</p>
          <p><strong>Repo X-Ray</strong> reads a public repository's manifest files (such as package.json, requirements.txt, go.mod, or Gradle files) through the GitHub API and maps package names to atlas technologies with a reviewed lookup table. It reports what a project declares, not what every file does, and is tested against a set of real repositories. Example scans are captured ahead of time from the same scanner.</p>
          <p><strong>Report cards</strong> group a scan's detections by field. They contain nothing beyond the scan itself.</p>
          <h3>How links are chosen</h3>
          <p>Relationships use explicit types such as belongs to domain, integrates with, and alternative to. Dataset validation checks endpoints and allowed types. Discovery imports add a verified identity and domain; richer links require review.</p>
          <h3>Freshness</h3>
          <p>This graph snapshot was built on {__DATA_BUILD_DATE__} (UTC). Individual source summaries and popularity snapshots can have different dates; see their attribution in the detail panel. <a href="https://github.com/rushilrawat/TechAtlas/commits/main/data">View graph history</a>.</p>
        </article>
      </main>}
      <main aria-hidden={aboutOpen} style={aboutOpen ? { visibility: "hidden" } : undefined} className={`stage${desktopRail ? ` rail-${desktopRail}` : ""}`}>
        {/* The hero comes first in the DOM so Tab reaches "Explore the atlas" before the
            rail, the canvas and the 23 field names (it is absolutely positioned, so this
            does not move it on screen). */}
        {!heroRendered && <h1 className="visually-hidden">TechAtlas: every technology, and how it connects</h1>}
        {heroRendered && (
          <section className={`hero${heroVisible ? "" : " is-leaving"}`} aria-label="Welcome"
            aria-hidden={!heroVisible}>
            <h1 className="hero-title">
              Every technology, and how it connects. <span>{fmt(state.graph.nodes.length)} of them.</span>
            </h1>
            <div className="hero-actions" data-arrow-nav onKeyDown={arrowNav}>
              <button type="button" className="hero-primary" onClick={() => setHeroVisible(false)}>
                Explore the atlas
              </button>
              <button type="button" className="hero-secondary" onClick={openPaths}>
                Follow a path
              </button>
              <button type="button" className="hero-secondary" onPointerEnter={() => { void warmScanner(); }} onClick={openXray}>
                X-ray a repo
              </button>
            </div>
            <p className="hero-paths" data-arrow-nav onKeyDown={arrowNav}>
              {resumePath ? <>
                <span>Welcome back.</span>{" "}
                <button type="button" onClick={() => startPath(resumePath.index, Math.min(pathProgress[resumePath.slug] ?? 0, resumePath.stepCount - 1))}>
                  Continue &ldquo;{resumePath.title}&rdquo;
                </button>
              </> : <>
                <span>Start here:</span>
                {heroPaths.map((p) => <button key={p.slug} type="button" onClick={() => startPath(p.index)}>{p.title}</button>)}
              </>}
            </p>
          </section>
        )}
        {immersive && (
          <button type="button" className="fullscreen-exit" onClick={toggleFullscreen}
            aria-label="Exit fullscreen" title="Exit fullscreen (F or Esc)"><Icon name="collapse" /><span>Exit</span></button>
        )}
        {!xrayOpen && <nav className="atlas-rail" aria-label="Atlas tools">
          <button type="button" aria-label="Fields" title="Fields and filters" aria-pressed={desktopRail === "domains"} onClick={() => { setLegendCollapsed(false); setDesktopRail(desktopRail === "domains" ? null : "domains"); }}><Icon name="domains" /></button>
        </nav>}
        {!webgl && <OutlineView nodes={state.graph.nodes} domains={state.domains} onPick={navigate} fallback />}
        {webgl && <GraphCanvas
          data={state.graph}
          theme={theme}
          journeyNodeIds={journey ? journeyNodeIds : stackParams.open ? stackHighlight.nodes : roleOpen ? roleHighlight.nodes : appsOpen ? appHighlight.nodes : journeyNodeIds}
          journeyEdgeIds={journey ? journeyEdgeIds : stackParams.open ? stackHighlight.edges : roleOpen ? roleHighlight.edges : appsOpen ? appHighlight.edges : journeyEdgeIds}
          initialCamera={initialCamera}
          onCameraChange={(camera) => {
            if (xrayOpen) return;
            const query = writeCamera(window.location.search, camera);
            window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
          }}
          selectedId={selected}
          selectedEdgeId={selectedEdge}
          previewEdgeId={previewEdge}
          focusId={focus}
          onSelect={handleSelect}
          onSelectEdge={handleSelectEdge}
          visibleNodes={visible ? visible.nodes : null}
          visibleEdges={visible ? visible.edges : null}
          scanStatusByNode={overlay ? overlay.statusByNode : null}
          scanHighlightEdges={overlay ? overlay.highlightEdges : null}
          scanContextEdges={overlay ? overlay.contextualEdges : null}
          stackPositions={stackPositions}
          stackHeadings={stackHeadings}
          exploreNonce={exploreNonce}
          frameSet={xrayOpen ? null : frameSet}
          domains={state.domains}
          fitSignal={
            overlay && fitNonce > 0
              ? {
                  ids: [...overlay.detectedNodes],
                  nonce: fitNonce,
                  // Measured, not assumed: real rendered width of the open right panel
                  // (detail overlays the X-Ray summary on the same surface). 0 if none.
                  // Avoids double-counting a fixed sidebar width (UI-C refinement 3).
                  sidebarWidthPx: measureRightPanelWidth(),
                }
              : null
          }
        />}
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
        {webgl && outlineOpen && <OutlineView nodes={state.graph.nodes} domains={state.domains}
          onPick={(id) => { navigate(id); if (compact) setOutlineOpen(false); }} onClose={() => setOutlineOpen(false)} />}
        {stackParams.open && !xrayOpen && <StackPanel graph={state.graph} params={stackParams} onParamsChange={setStackParams}
          currentLabel={stackParams.repo} onPick={navigate} onHighlight={onStackHighlight} onClose={() => openStack(false)} />}
        {roleOpen && !stackParams.open && !xrayOpen && <RolePanel graph={state.graph} roleId={roleId} onRoleChange={setRoleId}
          onPick={navigate} onHighlight={onRoleHighlight} onClose={() => setRoleOpen(false)} />}
        {appsOpen && !roleOpen && !stackParams.open && !xrayOpen && <AppsPanel graph={state.graph} appId={appId} onAppChange={setAppId}
          onPick={navigate} onHighlight={onAppHighlight} onClose={() => setAppsOpen(false)} />}
        {learningOpen && !compareMode && journeyIndex === null && !stackParams.open && !roleOpen && !appsOpen && <LearningPanel graph={state.graph} onPick={navigate} onClose={() => setLearningOpen(false)}
          onPickRole={() => { setLearningOpen(false); setCompareMode(false); setJourneyIndex(null); openStack(false); setAppsOpen(false); setRoleOpen(true); }}
          onOpenPaths={() => { setLearningOpen(false); openPaths(); }} />}
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
        {sharedCard && <ReportCard repo={sharedCard.repo} nodesById={nodesById} domainsById={domainsById}
          nodeIds={sharedCard.slugs.map((slug) => state.graph.nodes.find((n) => n.slug === slug)?.id).filter((id): id is string => !!id)}
          onPick={navigate} onClose={closeSharedCard} />}
        {compareMode && !xrayOpen && <section className="compare-panel" aria-label="Compare technologies">
          <h2>Compare technologies</h2>
          <p className="compare-pair">{compareFirst ? <button type="button" onClick={() => navigate(compareFirst, true)}>{nodesById.get(compareFirst)?.label}</button> : "Select the first technology on the atlas or in search."} <span aria-hidden>↔</span> {compareSecond ? <button type="button" onClick={() => navigate(compareSecond, true)}>{nodesById.get(compareSecond)?.label}</button> : "Select a second technology"}</p>
          {comparison && <>
            <div className="compare-actions">
              <button type="button" onClick={() => { setCompareFirst(compareSecond); setCompareSecond(compareFirst); }}>Swap</button>
              <button type="button" onClick={() => { setCompareFirst(null); setCompareSecond(null); }}>Clear</button>
              <button type="button" onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(() => { setCompareCopied(true); window.setTimeout(() => setCompareCopied(false), 1500); }, () => undefined);
              }}>{compareCopied ? "Link copied" : "Copy link"}</button>
            </div>
            <p>{comparison.direct ? `Direct relationship: ${comparison.direct.replaceAll("_", " ")}` : "No direct relationship in the graph."}</p>
            <h3>Connection path</h3>
            <p>{comparison.path.length ? comparison.path.map((id) => nodesById.get(id)?.label ?? id).join(" → ") : "No relationship path within five steps."}</p>
            {comparison.alternatives.some((list) => list.length) && <><h3>Alternatives</h3>
              {comparison.alternatives.map((list, index) => {
                const own = index === 0 ? compareFirst! : compareSecond!;
                const other = index === 0 ? compareSecond! : compareFirst!;
                const options = list.filter((id) => id !== other);
                return <p key={own} className="compare-alts"><span>{nodesById.get(own)?.label}:</span> {options.length ? options.map((id) =>
                  <button key={id} type="button" title={`Compare ${nodesById.get(own)?.label} with ${nodesById.get(id)?.label}`}
                    onClick={() => { setCompareFirst(own); setCompareSecond(id); navigate(id, true); }}>{nodesById.get(id)?.label ?? id}</button>)
                  : <em>{list.length ? "only each other" : "none listed"}</em>}</p>;
              })}</>}
            <h3>Shared connections · {comparison.shared.length}</h3>
            <ul>{comparison.shared.slice(0, 12).map((id) => <li key={id}><button type="button" onClick={() => navigate(id, true)}>{nodesById.get(id)?.label}</button></li>)}</ul>
          </>}
        </section>}
        {journey && journeyIndex !== null && !xrayOpen && <section className="journey-panel" aria-label="Guided path">
          <div className="journey-top">
            <span className="journey-field">
              <span className="path-dot" style={{ background: pathEntries[journeyIndex]?.color }} aria-hidden />
              {pathEntries[journeyIndex]?.fieldName}
            </span>
            <button type="button" className="journey-link" onClick={openPaths}>All paths</button>
            <button type="button" className="journey-close" aria-label="Exit path" title="Exit path"
              onClick={() => { setJourneyIndex(null); handleSelect(null); }}>×</button>
          </div>
          <h2 className="journey-title">{journey.title}</h2>
          <ol className="journey-dots" aria-label={`Step ${journeyStep + 1} of ${journey.steps.length}`} data-arrow-nav onKeyDown={arrowNav}>
            {journey.steps.map((step, i) => (
              <li key={step.id}>
                <button type="button" aria-current={i === journeyStep ? "step" : undefined}
                  className={i < journeyStep ? "is-past" : i === journeyStep ? "is-current" : ""}
                  title={`Step ${i + 1}: ${nodesById.get(step.id)?.label ?? step.id}`}
                  aria-label={`Step ${i + 1}: ${nodesById.get(step.id)?.label ?? step.id}`}
                  onClick={() => { setJourneyStep(i); navigate(step.id); }} />
              </li>
            ))}
          </ol>
          <p className="journey-progress">Step {journeyStep + 1} of {journey.steps.length}</p>
          <h3 className="journey-step">{nodesById.get(journey.steps[journeyStep].id)?.label}</h3>
          <p>{journey.steps[journeyStep].caption}</p>
          {journeyStep === journey.steps.length - 1 && (
            <div className="journey-done" role="status">
              <strong>Path complete.</strong>
              {nextPath && <> Up next:{" "}
                <button type="button" className="journey-link" onClick={() => startPath(nextPath.index)}>{nextPath.title}</button></>}
            </div>
          )}
          <div className="journey-actions">
            <button type="button" className="journey-prev" disabled={journeyStep === 0} title="Previous step ( [ )" onClick={journeyPrev ?? undefined}><span aria-hidden>←</span> Previous</button>
            <button type="button" className="journey-share" onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(() => { setPathCopied(true); window.setTimeout(() => setPathCopied(false), 1500); }, () => undefined);
            }}>{pathCopied ? "Link copied" : "Copy link"}</button>
            <button type="button" className="journey-next" disabled={journeyStep === journey.steps.length - 1} title="Next step ( ] )" onClick={journeyNext ?? undefined}>Next <span aria-hidden>→</span></button>
          </div>
        </section>}
        {pathsOpen && <PathsLibrary entries={pathEntries} done={donePaths} progress={pathProgress}
          activeIndex={journeyIndex} onStart={(i) => startPath(i)} onClose={() => setPathsOpen(false)} />}
        {xrayOpen ? (
          <Suspense fallback={<div className="xray-status" role="status">Loading Repo X-Ray…</div>}>
          <RepoXrayPanel
            phase={scanPhase}
            onAnalyze={analyze}
            onLoadExample={loadExample}
            liveEnabled={SCANNER_ENABLED}
            onExit={exitXray}
            onAnalyzeAnother={resetScan}
            onFocusStack={focusStack}
            onFocusNode={navigate}
            nodesById={nodesById}
            domainsById={domainsById}
            learnNext={learnNext}
            view={xrayView}
            onViewChange={setXrayView}
            collapsed={sheetCollapsed}
            onToggleCollapsed={() => {
              setSheetCollapsed((v) => !v);
              // Reframe after the sheet height transition so clusters use the new area.
              window.setTimeout(() => setFitNonce((n) => n + 1), 260);
            }}
          />
          </Suspense>
        ) : (
          <>
            {/* Filters now live in the Fields panel below. */}
          </>
        )}
        {overlay && <XrayLegend />}
        {!xrayOpen && <RelationshipLegend />}
        <DomainLegend
          domains={state.domains}
          selectedId={selected}
          onPick={(id) => {
            // On narrow screens the legend is a sheet over the atlas: close it so the
            // focused ecosystem is visible above the details sheet.
            if (compact) setLegendCollapsed(true);
            navigate(id);
          }}
          collapsed={compact ? legendCollapsed : desktopRail !== "domains" || legendCollapsed}
          filter={filter}
          onFilterChange={setFilter}
          onToggle={() => { setLegendCollapsed((v) => !v); setDesktopRail(null); }}
        />
        {selected && !compareMode && (
          <NodeDetailsPanel
            // Pass the node's canonical slug (resolved from the loaded graph) rather
            // than its id: static detail files are keyed by slug, and a node's id
            // suffix is not guaranteed to equal its slug (e.g. technology:tailwind /
            // slug tailwind-css). Fall back to the raw selection if not yet loaded.
            slugOrId={
              state.graph.nodes.find((n) => n.id === selected)?.slug ?? selected
            }
            nodeId={selected}
            onPreviewRelationship={previewRelationship}
            scan={activeScan}
            // When a DOMAIN is selected, pass its members-only count (same figure as the
            // sidebar / aggregate "direct" count) so the panel shows name AND count — key
            // for mobile, where a single tap is the primary way to identify a domain.
            memberCount={domainsById.get(selected)?.node_count ?? null}
            onClose={() => handleSelect(null)}
            onNavigate={navigate}
            onOpenApp={(id) => {
              setCompareMode(false); setJourneyIndex(null); setLearningOpen(false); openStack(false); setRoleOpen(false);
              setAppId(id); setAppsOpen(true);
            }}
            onCompare={(other) => {
              setJourneyIndex(null);
              setLearningOpen(false);
              setCompareMode(true);
              setCompareFirst(selected);
              setCompareSecond(other);
              setSelected(other);
              setFocus(other);
            }}
          />
        )}
        {edgeDetail && nodesById.get(edgeDetail.source) && nodesById.get(edgeDetail.target) && (
          <EdgeDetailsPanel
            edge={edgeDetail}
            source={nodesById.get(edgeDetail.source)!}
            target={nodesById.get(edgeDetail.target)!}
            onClose={() => setSelectedEdge(null)}
            onNavigate={navigate}
          />
        )}
      </main>
    </div>
  );
}
