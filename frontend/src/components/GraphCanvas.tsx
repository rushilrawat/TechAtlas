import { useEffect, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import type { DetectionStatus, GraphResponse } from "../api/types";
import { buildGraph, domainMemberIds } from "../graph/buildGraph";
import { bandOf, labelVisibleAtRatio, selectPersistentLabels } from "../graph/semanticZoom";
import type { LabelContext } from "../graph/semanticZoom";
import { isOverviewEdgeHidden, placeLabels, sectorIsAggregatedAtOverview } from "../graph/overviewLod";
import type { Box, KeyedBox, LabelCandidate } from "../graph/overviewLod";
import { computeFit } from "../graph/cameraFit";

interface Props {
  data: GraphResponse;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  // Phase 1B filtering (requirements 1.6–1.10). null means "no filter: show all".
  // When present, only ids in these sets are shown; coordinates are never recomputed.
  visibleNodes?: Set<string> | null;
  visibleEdges?: Set<string> | null;
  // Phase 1.5B Repo X-Ray overlay. null = no active scan (normal appearance). When set,
  // detected nodes get a status ring (domain color/size preserved) and the rest dim.
  scanStatusByNode?: Map<string, DetectionStatus> | null;
  scanHighlightEdges?: Set<string> | null;
  // Contextual edges (exactly one detected endpoint) — rendered faintly (UI-A).
  scanContextEdges?: Set<string> | null;
  // "Focus Stack": a bounds + nonce to frame the detected region. Bumping the nonce
  // re-triggers the fit (so the button works repeatedly).
  fitSignal?: { ids: string[]; nonce: number; sidebarWidthPx?: number } | null;
  // Stack View (X-Ray UX correction): temporary per-node render positions that reproject
  // detected nodes into domain clusters. null = Universe View (canonical coordinates).
  // Applied as a VIEW-LEVEL projection; canonical x/y are saved and restored on exit and
  // are never mutated in the dataset.
  stackPositions?: Map<string, { x: number; y: number }> | null;
  // Stack View domain cluster headings (a handful): graph-space anchor + label + color.
  // Rendered as a small DOM overlay projected to screen coords (not per-node WebGL labels).
  stackHeadings?: { domainId: string; label: string; color: string; x: number; y: number }[] | null;
  // Explore "Home" reframe: bump this nonce to smoothly re-fit the default atlas camera
  // (used when returning from Repo X-Ray so the homepage camera is fully restored).
  exploreNonce?: number;
  // Top-level domain metadata (id/name/color) for the Explore sector backplates + legend
  // sync. Only used to DRAW the atmospheric overlay — never alters graph data.
  domains?: { id: string; name: string; color: string; node_count: number }[] | null;
}

// Explore state: the selected node's neighborhood is prominent; everything else recedes.
const DIM_NODE = "rgba(120,130,150,0.12)";
const DIM_EDGE = "rgba(120,130,150,0.035)";           // <=0.05 non-touching (UI-A R2.2)
const REST_EDGE = "rgba(130,140,160,0.03)";            // Explore at-rest cross-node edges (barely-there; map-first)
const ACTIVE_EDGE = "rgba(150,180,255,0.55)";          // 0.50-0.60 touching (UI-A R2.1)

// Repo X-Ray detection-status ring colors (spec §5: a SEPARATE visual channel from the
// node's domain color). confirmed=green, declared=blue, inferred=amber, related=neutral.
const STATUS_RING: Record<DetectionStatus, string> = {
  confirmed: "#4ade80",
  declared: "#60a5fa",
  inferred: "#fbbf24",
  related: "#c0caf5",
};
// Repo X-Ray state: detected nodes at full opacity; unrelated nodes fade to 0.10-0.20;
// verified edges (both endpoints detected) prominent; contextual (one endpoint) faint;
// unrelated edges nearly invisible so the detected stack reads in seconds (UI-A R3).
const SCAN_DIM_NODE = "rgba(110,120,140,0.11)";        // 0.10-0.20 unrelated node (low end)
const SCAN_HILITE_EDGE = "rgba(190,205,255,0.7)";      // 0.60-0.80 verified-between
const SCAN_CONTEXT_EDGE = "rgba(150,165,205,0.20)";    // 0.15-0.30 contextual
// Unrelated edges are the overwhelming majority (hundreds); even a tiny alpha accumulates
// into a visible web where they overlap, so they are effectively hidden (UI-A R3.3).
const SCAN_DIM_EDGE = "rgba(120,130,150,0.0)";

/**
 * The primary WebGL visualization. Owns the Sigma instance imperatively; React only
 * drives it through props. Sigma is kept out of React's render loop so interactions
 * never recreate the renderer (spec §15).
 *
 * Performance (smoothness plan, Tasks 7-9):
 *  - the active node's neighbor set is computed ONCE per hover/selection change, not
 *    per-node per-frame, avoiding O(n^2) work in the reducers;
 *  - enter/leave events coalesce into a single requestAnimationFrame refresh;
 *  - label/edge visibility follows the camera ratio (semantic zoom);
 *  - camera animations cancel any in-flight animation before starting a new one.
 */
// Frame the Stack View on its clustered nodes by handing Sigma a CUSTOM BOUNDING BOX in
// graph-coordinate space and resetting the camera to fit it. All math stays in graph units;
// Sigma converts to camera space internally, so there is no coordinate-system mixing and no
// hardcoded pixel offsets. Framing is correct at any screen size. The right side of the box
// is padded by the sidebar's *fraction of the viewport* so the clusters sit in the visible
// area left of the open panel. Caller clears the custom bbox (setCustomBBox(null)) on exit.
function fitStack(
  renderer: Sigma,
  positions: { x: number; y: number }[],
  prefersReduced: boolean,
): void {
  if (positions.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const gw = Math.max(maxX - minX, 1);
  const gh = Math.max(maxY - minY, 1);

  // Label-safe margin in graph units (headings sit above; labels extend sideways). Scale
  // the margin to the stack size so small stacks are not over-zoomed into a few huge dots.
  const marginX = Math.max(gw * 0.16, 220);
  const marginYtop = Math.max(gh * 0.16, 200);
  const marginYbot = Math.max(gh * 0.12, 140);
  let bMinX = minX - marginX;
  let bMaxX = maxX + marginX;
  let bMinY = minY - marginYtop;
  let bMaxY = maxY + marginYbot;

  const el = renderer.getContainer();
  const vw = el.clientWidth || window.innerWidth;
  const vh = el.clientHeight || window.innerHeight;
  const narrow = vw < 820;

  // Enforce a MINIMUM framed span (canonical units) on wide screens so a tiny stack is not
  // magnified until a few nodes fill the screen and the gaps look vast. Skipped on narrow
  // (mobile) viewports where the usable band is small.
  if (!narrow) {
    const MIN_W = 1700, MIN_H = 1300;
    const cxB = (bMinX + bMaxX) / 2, cyB = (bMinY + bMaxY) / 2;
    if (bMaxX - bMinX < MIN_W) { bMinX = cxB - MIN_W / 2; bMaxX = cxB + MIN_W / 2; }
    if (bMaxY - bMinY < MIN_H) { bMinY = cyB - MIN_H / 2; bMaxY = cyB + MIN_H / 2; }
  }

  // Compute the USABLE viewport rectangle (pixels) = the container minus the OPEN panel.
  // The panel is a right rail on wide screens but a full-width BOTTOM SHEET on mobile. We
  // frame the content into this rectangle directly (measure + nudge), rather than padding
  // the bbox asymmetrically, so it is correct in both orientations at any size.
  const panel = document.querySelector(".details, .xray-panel") as HTMLElement | null;
  const prect = panel ? panel.getBoundingClientRect() : null;
  const crect = el.getBoundingClientRect();
  const uLeft = 0, uTop = 0;
  let uRight = vw, uBottom = vh;
  if (prect && prect.width > 0 && prect.height > 0) {
    const isBottomSheet = prect.width >= vw * 0.85;
    if (isBottomSheet) {
      // sheet occupies the bottom; usable band is above its top edge.
      uBottom = Math.max(uTop + 120, prect.top - crect.top - 12);
    } else {
      // right rail; usable band is left of its left edge.
      uRight = Math.max(uLeft + 160, prect.left - crect.left - 12);
    }
  }
  const usableW = Math.max(120, uRight - uLeft);
  const usableH = Math.max(120, uBottom - uTop);

  // Construct an EXTENDED bbox that, when Sigma maps it to the full container, places the
  // content bounds exactly onto the usable rectangle. Sigma fits a custom bbox to the
  // container by the CONSTRAINING axis (letterboxing the other), so we use a single uniform
  // graph-units-per-pixel for both axes, then expand the content bounds outward by the
  // margins between the usable rect and the container edges. No camera-space math, no
  // hardcoded offsets — purely graph-space, correct for right-rail and bottom-sheet alike.
  const gpx = Math.max(
    (bMaxX - bMinX) / usableW,
    (bMaxY - bMinY) / usableH,
  );
  // Re-center content so the uniform gpx keeps it centered in the usable rect first.
  const contentCX = (bMinX + bMaxX) / 2;
  const contentCY = (bMinY + bMaxY) / 2;
  const halfUsableWg = (usableW / 2) * gpx;
  const halfUsableHg = (usableH / 2) * gpx;
  // Usable-rect edges in graph units (content centered in the usable rect):
  const uMinXg = contentCX - halfUsableWg;
  const uMaxXg = contentCX + halfUsableWg;
  // NOTE: viewport Y grows downward; graph Y grows upward. Top of usable rect = max graph Y.
  const uMinYg = contentCY - halfUsableHg; // bottom of usable rect (graph)
  const uMaxYg = contentCY + halfUsableHg; // top of usable rect (graph)

  // Extend to the full container: add the px margins (container edge to usable edge) * gpx.
  const fullMinX = uMinXg - uLeft * gpx;
  const fullMaxX = uMaxXg + (vw - uRight) * gpx;
  // top margin (uTop px) is above the usable rect -> larger graph Y; bottom margin below.
  const fullMaxY = uMaxYg + uTop * gpx;
  const fullMinY = uMinYg - (vh - uBottom) * gpx;

  renderer.setCustomBBox({ x: [fullMinX, fullMaxX], y: [fullMinY, fullMaxY] });
  renderer.refresh();
  // animatedReset frames the (extended) bbox: content lands on the usable rectangle.
  void renderer.getCamera().animatedReset({ duration: prefersReduced ? 0 : 650 });
}
// Sidebar-aware Explore framing: optically centre the FULL atlas in the usable canvas
// (viewport minus the left legend + right filter side-rails on wide screens; symmetric on
// mobile where panels are bottom sheets). Pure geometry, deterministic, no hardcoded offsets.
function fitExplore(renderer: Sigma, prefersReduced: boolean): void {
  const graph = renderer.getGraph();
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity, any = false;
  // At the collision-free overview the visible content is the 14 aggregate MARKERS (on the
  // domain ring), not the 607 hidden members that sprawl far into the sector shells. Frame to
  // the MARKER extent when markers exist, so the ring fills the canvas instead of floating
  // small in the centre (fixes the "too empty" overview). Fall back to all nodes otherwise
  // (e.g. a layout with no aggregates), preserving the prior behaviour.
  let hasMarkers = false;
  graph.forEachNode((_n, a) => {
    if (a.isAggregate !== true) return;
    const x = a.x as number, y = a.y as number;
    if (typeof x !== "number" || typeof y !== "number") return;
    hasMarkers = true; any = true;
    mnX = Math.min(mnX, x); mnY = Math.min(mnY, y);
    mxX = Math.max(mxX, x); mxY = Math.max(mxY, y);
  });
  if (!hasMarkers) {
    graph.forEachNode((_n, a) => {
      const x = a.x as number, y = a.y as number;
      if (typeof x !== "number" || typeof y !== "number") return;
      any = true;
      mnX = Math.min(mnX, x); mnY = Math.min(mnY, y);
      mxX = Math.max(mxX, x); mxY = Math.max(mxY, y);
    });
  }
  if (!any) return;
  const el = renderer.getContainer();
  const vw = el.clientWidth || window.innerWidth;
  // Narrow screens get extra padding so domain labels near the rim are not clipped by the
  // viewport edge (labels extend well beyond their node); wide screens use a tight frame.
  // At the collision-free overview only the 14 sector markers show (not 607 nodes), so the
  // ring can fill more of a narrow viewport — less padding keeps the compressed ring's
  // markers well separated on mobile while still leaving room for rim labels.
  const padFrac = vw < 641 ? 0.1 : 0.06;
  const padX = (mxX - mnX) * padFrac + 40;
  const padY = (mxY - mnY) * padFrac + 40;
  mnX -= padX; mxX += padX; mnY -= padY; mxY += padY;
  const vh = el.clientHeight || window.innerHeight;
  const cr = el.getBoundingClientRect();
  const gpx = Math.max((mxX - mnX) / Math.max(vw, 1), (mxY - mnY) / Math.max(vh, 1));
  let leftW = 0, rightW = 0;
  if (vw >= 641) {
    const q = (sel: string) => {
      const n = document.querySelector(sel) as HTMLElement | null;
      const r = n ? n.getBoundingClientRect() : null;
      return r && r.width > 0 && r.width < vw * 0.6 ? r : null;  // ignore bottom sheets
    };
    const left = q(".legend");
    const right = q("#graph-filters, .filter-panel");
    leftW = left ? Math.max(0, left.right - cr.left) : 0;
    rightW = right ? Math.max(0, cr.right - right.left) : 0;
  }
  const bMinX = mnX - leftW * gpx;
  const bMaxX = mxX + rightW * gpx;
  renderer.setCustomBBox({ x: [bMinX, bMaxX], y: [mnY, mxY] });
  if (prefersReduced) {
    renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    renderer.refresh();
  } else {
    void renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 500 });
  }
}

export function GraphCanvas({
  data,
  selectedId,
  focusId,
  onSelect,
  visibleNodes = null,
  visibleEdges = null,
  scanStatusByNode = null,
  scanHighlightEdges = null,
  scanContextEdges = null,
  fitSignal = null,
  stackPositions = null,
  stackHeadings = null,
  exploreNonce = 0,
  domains = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  // Precomputed highlight set for the current active node (Task 7).
  const activeRef = useRef<string | null>(null);
  const neighborSetRef = useRef<Set<string> | null>(null);
  // Live filter visibility sets, read inside the reducers (Phase 1B).
  const visibleNodesRef = useRef<Set<string> | null>(visibleNodes);
  const visibleEdgesRef = useRef<Set<string> | null>(visibleEdges);
  // Repo X-Ray overlay sets, read inside the reducers (Phase 1.5B).
  const scanStatusRef = useRef<Map<string, DetectionStatus> | null>(scanStatusByNode);
  const scanEdgesRef = useRef<Set<string> | null>(scanHighlightEdges);
  const scanContextRef = useRef<Set<string> | null>(scanContextEdges);
  // Persistent detected-node labels (UI-A): recomputed only when the overlay changes.
  const persistentLabelsRef = useRef<Set<string> | null>(null);
  // Saved canonical coordinates while Stack View is active (restored on exit).
  const savedCoordsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const stackAnimRef = useRef<number | null>(null);
  const stackActiveRef = useRef<boolean>(false);
  const framedStackRef = useRef<number | null>(null);
  const stackPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const stackHeadingsRef = useRef<{ x: number; y: number }[] | null>(null);
  // rAF coalescing for refreshes (Task 7).
  const rafRef = useRef<number | null>(null);
  // Exposes the build-effect's coalesced refresh to the selection/filter effects,
  // so a selection change from search/legend/deep-link/panel recomputes the highlight
  // set (not just a bare renderer.refresh()).
  const scheduleRefreshRef = useRef<(() => void) | null>(null);
  const ratioRef = useRef<number>(1);
  // Overview LOD (atlas-overview-collision-free): aggregate marker ids per domain, member ->
  // its domain, and all marker ids. Computed once per dataset. Drives the collision-free
  // overview where aggregate markers REPLACE their member nodes until the user zooms/selects.
  const sectorMarkerIdsRef = useRef<Map<string, string[]>>(new Map());
  const memberToDomainRef = useRef<Map<string, string>>(new Map());
  const aggregateIdsRef = useRef<Set<string>>(new Set());
  const aggregateLabelRef = useRef<Map<string, string>>(new Map());
  // Ids of overview labels SUPPRESSED by the screen-space placement pass (Layer 3).
  const suppressedLabelsRef = useRef<Set<string>>(new Set());
  const labelSettleRef = useRef<number | null>(null);
  const recomputeLabelsRef = useRef<(() => void) | null>(null);
  // The domain id of the active selection (if a domain or one of its members is selected),
  // so that sector expands to individuals while the rest stay aggregated.
  const activeDomainRef = useRef<string | null>(null);
  // Projected screen positions for Stack View domain headings (DOM overlay).
  const [headingScreens, setHeadingScreens] = useState<
    { domainId: string; label: string; color: string; left: number; top: number; visible: boolean }[]
  >([]);

  // Explore atlas overlay: soft domain-sector backplates + the centre identity, projected
  // to screen coords and kept in sync with the camera. Purely decorative (pointer-events
  // none); never touches graph data. Each sector is drawn at its members' projected centroid
  // with a radius covering the cluster — so it reads as the domain's "territory".
  const [backdrop, setBackdrop] = useState<{
    sectors: { id: string; color: string; cx: number; cy: number; r: number }[];
    center: { cx: number; cy: number; r: number } | null;
  }>({ sectors: [], center: null });
  const domainGeomRef = useRef<Map<string, { gx: number; gy: number; gr: number }> | null>(null);
  const domainsRef = useRef(domains);
  domainsRef.current = domains;

  // Build the Sigma instance once per dataset.
  useEffect(() => {
    if (!containerRef.current) return;
    const graph = buildGraph(data);
    graphRef.current = graph;

    // ---- Overview LOD precompute (once per dataset) ----
    // Catalog aggregate markers, map each aggregated member to its domain, and compose each
    // marker's label ("<Domain> · <count>") from the domains prop. The actual decision to
    // show a marker vs its members is made RESPONSIVELY in the node reducer below.
    {
      const sectorMarkers = new Map<string, string[]>();
      const memberToDomain = new Map<string, string>();
      const aggIds = new Set<string>();
      const aggLabel = new Map<string, string>();
      const nameByDomain = new Map<string, string>(
        (domainsRef.current ?? []).map((d) => [d.id, d.name]),
      );
      graph.forEachNode((id, a) => {
        if (a.isAggregate !== true) return;
        const dom = a.domainId as string;
        aggIds.add(id);
        const arr = sectorMarkers.get(dom);
        if (arr) arr.push(id);
        else sectorMarkers.set(dom, [id]);
        for (const m of (a.memberIds as string[] | undefined) ?? []) {
          memberToDomain.set(m, dom);
        }
        const nm = nameByDomain.get(dom) ?? dom.replace(/^domain:/, "");
        // Label shows DIRECT members (matches the sidebar members-only count). When the
        // spatial territory also holds nested-subdomain members, append the extra as "(+N)"
        // so the two populations are clearly distinguished (both from canonical membership).
        const direct = (a.directCount as number | undefined) ?? (a.count as number);
        const total = a.count as number;
        aggLabel.set(id, total > direct ? `${nm} · ${direct} (+${total - direct})` : `${nm} · ${direct}`);
      });
      sectorMarkerIdsRef.current = sectorMarkers;
      memberToDomainRef.current = memberToDomain;
      aggregateIdsRef.current = aggIds;
      aggregateLabelRef.current = aggLabel;
    }

    const renderer = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: "line",
      labelColor: { color: "#c8d0e8" },
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 12,
      // UI-C: reduce Universe label collisions. Larger grid cells + lower density mean
      // fewer labels compete per screen region; the rendered-size threshold suppresses
      // labels for small nodes until the user zooms in (semantic zoom still applies on top).
      // On NARROW (mobile) viewports collisions are worse, so use larger cells + lower
      // density: Sigma then renders fewer labels per region and picks the LARGEST node in
      // each cell, which is the domain anchor — so top-level domain labels win and small
      // colliding labels are dropped (redesign §3). More labels return on zoom.
      labelDensity: (typeof window !== "undefined" && window.innerWidth < 641) ? 0.3 : 0.5,
      labelGridCellSize: (typeof window !== "undefined" && window.innerWidth < 641) ? 260 : 110,
      zIndex: true,
      minCameraRatio: 0.08,
      maxCameraRatio: 2.5,
      // "bordered" node type = fill (domain color) + an outer ring (detection status).
      // The default "circle" program is kept for normal (non-scan) rendering.
      nodeProgramClasses: {
        bordered: createNodeBorderProgram({
          borders: [
            { size: { attribute: "borderSize", defaultValue: 0 },
              color: { attribute: "borderColor", defaultValue: "#000000" } },
            { size: { fill: true }, color: { attribute: "color" } },
          ],
        }),
      },
    });
    sigmaRef.current = renderer;

    // Sidebar-aware INITIAL framing (Explore redesign §11): optically centre the atlas in
    // the USABLE canvas (viewport minus the left legend + right filter panels), not the raw
    // viewport, so no domain sector hides behind a panel. Done once on mount by framing a
    // custom bbox whose L/R margins mirror the measured panel widths. Pure geometry, no
    // hardcoded offsets; skipped when a scan (Stack View) owns the camera.
    requestAnimationFrame(() => {
      if (stackActiveRef.current) return;
      fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    });

    // Test-only renderer handle, compiled in ONLY when VITE_TEST_HOOKS is set at build
    // time (the e2e harness build). It is tree-shaken out of the production deploy build,
    // so no internal renderer reference is ever exposed to shipped users.
    if (import.meta.env.VITE_TEST_HOOKS === "true" && typeof window !== "undefined") {
      (window as unknown as { __ta_sigma?: unknown }).__ta_sigma = renderer;
    }

    // Compute the highlight set once whenever the active node changes.
    const recomputeActive = () => {
      let active = selectedRef.current ?? hoveredRef.current;
      // If a filter currently hides the active node, don't treat it as active —
      // otherwise every visible node outside its neighbor set gets dimmed and the
      // graph looks blanked (requirement: handle selection hidden by filtering).
      const vis = visibleNodesRef.current;
      if (active && vis && !vis.has(active)) active = null;
      if (active === activeRef.current) return;
      activeRef.current = active;
      if (!active || !graph.hasNode(active)) {
        neighborSetRef.current = null;
        activeDomainRef.current = null;
        return;
      }
      const set = new Set<string>([active]);
      const nodeType = graph.getNodeAttribute(active, "nodeType");
      if (graph.getNodeAttribute(active, "isAggregate") === true) {
        // Selecting an aggregate MARKER expands its sector: resolve to the domain and
        // highlight that domain's members (the marker stands in for them at overview).
        const dom = graph.getNodeAttribute(active, "domainId") as string;
        activeDomainRef.current = dom;
        if (graph.hasNode(dom)) set.add(dom);
        for (const id of domainMemberIds(graph, dom)) set.add(id);
      } else if (nodeType === "domain") {
        // Selecting a DOMAIN highlights ALL its members (shared helper = same definition as
        // the sidebar count) so the highlight set matches the count exactly, not just the few
        // nodes joined to the anchor by an edge (count/highlight correctness §13/§26/§36).
        activeDomainRef.current = active;
        for (const id of domainMemberIds(graph, active)) set.add(id);
      } else {
        // A member node selected -> expand its own sector so it is visible as an individual.
        activeDomainRef.current =
          memberToDomainRef.current.get(active) ??
          (graph.getNodeAttribute(active, "primaryDomain") as string | undefined) ??
          null;
        graph.forEachNeighbor(active, (nb) => set.add(nb));
      }
      neighborSetRef.current = set;
    };

    // Overview priority-label placement (atlas-overview-collision-free Layer 3). Measures
    // each shown overview marker's label box in SCREEN space (canvas measureText at the real
    // label font) and keeps it only if it does not overlap another kept label, a visible node
    // circle, a side-panel rect, or the viewport edge — dropping the lower-priority label on
    // conflict. Populates suppressedLabelsRef, consulted by the node reducer. Runs on camera
    // settle / selection change (NOT per frame). Only relevant at the aggregated overview.
    const labelCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const labelCtx = labelCanvas ? labelCanvas.getContext("2d") : null;
    const recomputeOverviewLabels = () => {
      const sup = new Set<string>();
      if (!labelCtx || scanStatusRef.current != null || activeRef.current) {
        suppressedLabelsRef.current = sup; // no overview labels to place
        return;
      }
      const el = containerRef.current;
      if (!el) { suppressedLabelsRef.current = sup; return; }
      const vwp = el.clientWidth || window.innerWidth;
      const vhp = el.clientHeight || window.innerHeight;
      const cr = el.getBoundingClientRect();
      if (vwp < 641) {
        // Phone overview: the compressed ring has no room for labels without grazing a
        // neighbour; suppress all marker labels (markers remain tappable; names live in the
        // legend/filter panels). Consistent with the existing mobile minimal-label rule.
        const all = new Set<string>();
        for (const [, ids] of sectorMarkerIdsRef.current) for (const id of ids) all.add(id);
        suppressedLabelsRef.current = all;
        return;
      }
      labelCtx.font = "12px Inter, system-ui, sans-serif";
      const LABEL_H = 14;
      // Visible node circle boxes (markers shown at overview) for label/node overlap tests.
      const nodeBoxes: KeyedBox[] = [];
      const candidates: LabelCandidate[] = [];
      let prio = 1000;
      for (const [dom, ids] of sectorMarkerIdsRef.current) {
        const aggregated = sectorIsAggregatedAtOverview({
          ratio: ratioRef.current,
          activeId: activeRef.current,
          activeDomainId: activeDomainRef.current,
          domainId: dom,
          inScan: false,
        });
        if (!aggregated) continue;
        for (const id of ids) {
          if (!graph.hasNode(id)) continue;
          const dd = renderer.getNodeDisplayData(id);
          if (!dd) continue;
          const vp = renderer.graphToViewport({
            x: graph.getNodeAttribute(id, "x") as number,
            y: graph.getNodeAttribute(id, "y") as number,
          });
          const r = renderer.scaleSize(dd.size);
          // Inflate the box used for label/node overlap tests by a margin so the placement
          // pass is strictly stricter than the measured collision check (no marginal graze).
          const MARGIN = (containerRef.current?.clientWidth ?? 1200) < 900 ? 12 : 6;
          nodeBoxes.push({
            key: id,
            x: vp.x - r - MARGIN,
            y: vp.y - r - MARGIN,
            w: (r + MARGIN) * 2,
            h: (r + MARGIN) * 2,
          });
          const text = aggregateLabelRef.current.get(id) ?? "";
          const PAD = 4; // breathing room; keeps the pass stricter than the measure
          // Use the LARGER of the measured width and a conservative per-character estimate.
          // Headless/first-paint runs may measure before the Inter web font loads (narrower
          // metrics); the estimate keeps the pass's box >= the finally-rendered label, so
          // panel/label/node suppression never under-fires due to font-load timing.
          const w =
            Math.max(labelCtx.measureText(text).width, text.length * 7.2) + PAD * 2;
          candidates.push({
            id,
            priority: prio--, // larger sectors first (markers iterated in sector order)
            box: { x: vp.x + r + 2 - PAD, y: vp.y - LABEL_H / 2 - PAD, w, h: LABEL_H + PAD * 2 },
            ownerKey: id,
          });
        }
      }
      // Side panels in container-local coordinates.
      const panels: Box[] = [];
      // Inflate each panel rect by a margin so a label is suppressed BEFORE it visibly grazes
      // the panel edge (absorbs sub-pixel camera drift between this pass and the final frame).
      const PANEL_MARGIN = 10;
      for (const sel of [".legend", "#graph-filters", ".filter-panel"]) {
        const n = document.querySelector(sel) as HTMLElement | null;
        if (!n) continue;
        const rr = n.getBoundingClientRect();
        if (rr.width <= 0 || rr.height <= 0 || rr.width > vwp * 0.6) continue; // ignore bottom sheets
        panels.push({
          x: rr.left - cr.left - PANEL_MARGIN,
          y: rr.top - cr.top - PANEL_MARGIN,
          w: rr.width + PANEL_MARGIN * 2,
          h: rr.height + PANEL_MARGIN * 2,
        });
      }
      suppressedLabelsRef.current = placeLabels({
        candidates,
        nodeBoxes,
        panels,
        viewport: { w: vwp, h: vhp },
      });
    };

    // Coalesced refresh: at most one per animation frame (Task 7).
    const scheduleRefresh = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        recomputeActive();
        recomputeOverviewLabels();
        renderer.refresh();
      });
    };
    scheduleRefreshRef.current = scheduleRefresh;
    recomputeLabelsRef.current = () => { recomputeOverviewLabels(); renderer.refresh(); };

    // Which nodes may show labels at the current zoom (Task 8) — pure logic imported
    // from semanticZoom.ts and fed the live camera ratio. On NARROW (mobile) viewports the
    // overview band shows ONLY top-level domain labels (redesign §3): even the large hubs
    // are suppressed until the user zooms in, so domain names never fight each other for
    // space. Sigma's enlarged collision grid then drops any domain labels that still touch.
    const labelVisible = (nodeType: string, size: number): boolean => {
      const narrowView =
        (containerRef.current?.clientWidth ?? window.innerWidth) < 641;
      // The Explore custom-bbox fit frames the whole atlas at camera ratio ~1 (band 1),
      // so treat bands 0 AND 1 as "overview" on narrow screens: domain labels only.
      if (narrowView && bandOf(ratioRef.current) <= 1) return nodeType === "domain";
      return labelVisibleAtRatio(nodeType as never, size, ratioRef.current);
    };

    renderer.setSetting("nodeReducer", (node, dataIn) => {
      const active = activeRef.current;
      const res: Record<string, unknown> = { ...dataIn };

      // Phase 1B filter: hide nodes outside the visible set. This composes with
      // semantic zoom by logical AND — a node shows only if the filter allows it
      // AND the zoom level would show it. Coordinates are untouched.
      const vis = visibleNodesRef.current;
      if (vis && !vis.has(node)) {
        res.hidden = true;
        return res;
      }

      // ---- Overview LOD (atlas-overview-collision-free) ----
      // At the overview band with nothing selected (and not in Repo X-Ray), dense sectors
      // collapse: their member nodes are HIDDEN and a single aggregate MARKER stands in for
      // each shell. This is what makes the default atlas collision-free. The marker REPLACES
      // its members (never alongside). Selecting a domain/marker, or zooming into the detail
      // band, expands that sector back to individuals (progressive disclosure). Markers are
      // decided per-sector responsively via the pure helper (live camera band + selection).
      const inScan = scanStatusRef.current != null;
      const isAgg = dataIn.isAggregate === true;
      if (!inScan) {
        if (isAgg) {
          const dom = dataIn.domainId as string;
          const show = sectorIsAggregatedAtOverview({
            ratio: ratioRef.current,
            activeId: active,
            activeDomainId: activeDomainRef.current,
            domainId: dom,
            inScan,
          });
          if (!show) {
            res.hidden = true;
            return res;
          }
          // Marker is shown: label it (domain name + count). The ACTIVE or HOVERED marker
          // ALWAYS shows its label (so a single tap/hover identifies the domain on every
          // viewport — including phones where at-rest labels are suppressed). Otherwise the
          // label shows unless the screen-space placement pass suppressed it to avoid a
          // collision / panel occlusion (Layer 3).
          res.hidden = false;
          const isFocusedMarker = node === active || node === hoveredRef.current;
          if (isFocusedMarker || !suppressedLabelsRef.current.has(node)) {
            res.label = aggregateLabelRef.current.get(node) ?? "";
            res.forceLabel = true;
            if (isFocusedMarker) res.zIndex = 3;
          } else {
            res.label = "";
            res.forceLabel = false;
          }
          if (res.zIndex === undefined) res.zIndex = 1;
          // Responsive marker size: the 14 markers sit on a ring that fitExplore frames
          // smaller on narrow viewports (extra padding), so cap the marker's base size there
          // to keep the compressed ring collision-free without making desktop markers tiny.
          const vwNow = containerRef.current?.clientWidth ?? window.innerWidth;
          if (vwNow < 641) {
            // phone: the 14-marker ring is very compressed — cap small so it stays clear.
            res.size = Math.min((dataIn.size as number) ?? 18, 9);
          } else if (vwNow < 900) {
            res.size = Math.min((dataIn.size as number) ?? 18, 15);
          }
          return res;
        }
        // A regular node whose sector is currently aggregated at overview is hidden — the
        // marker represents it. (Its domain anchor stays visible: anchors are not members.)
        const memberDom = memberToDomainRef.current.get(node);
        if (
          memberDom &&
          sectorIsAggregatedAtOverview({
            ratio: ratioRef.current,
            activeId: active,
            activeDomainId: activeDomainRef.current,
            domainId: memberDom,
            inScan,
          })
        ) {
          res.hidden = true;
          return res;
        }
        // Hide the bare DOMAIN ANCHOR when its sector is aggregated: the marker (placed at
        // the same ring slot, labelled "<Domain> · <count>") stands in for it, so the 14
        // markers FORM the ring. The anchor returns on zoom / when its domain is selected.
        if (
          dataIn.nodeType === "domain" &&
          sectorMarkerIdsRef.current.has(node) &&
          sectorIsAggregatedAtOverview({
            ratio: ratioRef.current,
            activeId: active,
            activeDomainId: activeDomainRef.current,
            domainId: node,
            inScan,
          })
        ) {
          res.hidden = true;
          return res;
        }
      } else if (isAgg) {
        // In Repo X-Ray, aggregate markers never participate.
        res.hidden = true;
        return res;
      }

      // Repo X-Ray overlay (Phase 1.5B): detected nodes keep their domain color and
      // size but gain a status-colored ring; everything else dims. This is applied
      // before the hover/selection highlight so a scan read is stable.
      const scan = scanStatusRef.current;
      if (scan) {
        const status = scan.get(node);
        if (status) {
          res.type = "bordered";
          res.borderColor = STATUS_RING[status];
          res.borderSize = 3;
          res.zIndex = 2;
          // keep domain color (res.color unchanged) and size; show a PERSISTENT label for
          // this detected node when it's in the budgeted set, or when hovered/active, so the
          // scanned stack is identifiable without the sidebar (UI-A R5).
          const persist = persistentLabelsRef.current;
          const labelled =
            node === active || node === hoveredRef.current || (persist?.has(node) ?? false);
          if (labelled) {
            // Bypass Sigma's global label-collision for the budgeted detected set so the
            // scanned stack stays identifiable (UI-A R5) even under the tighter Universe
            // label density used for collision control (UI-C).
            res.forceLabel = true;
          } else {
            res.label = "";
          }
          return res;
        }
        // not detected -> in Stack View hide entirely so detected clusters read cleanly;
        // in Universe View (scan overlay) fade into the background.
        if (stackActiveRef.current) {
          res.hidden = true;
          return res;
        }
        res.color = SCAN_DIM_NODE;
        res.label = "";
        res.zIndex = 0;
        return res;
      }

      // Semantic-zoom label gating.
      if (!labelVisible(dataIn.nodeType as string, dataIn.size as number)) {
        res.label = "";
      }

      if (!active) return res;
      const set = neighborSetRef.current;
      if (set && set.has(node)) {
        if (node === active) {
          res.zIndex = 2;
          res.highlighted = true;
          res.label = dataIn.label; // always label the active node
        }
        return res;
      }
      res.color = DIM_NODE;
      res.label = "";
      res.zIndex = 0;
      return res;
    });

    renderer.setSetting("edgeReducer", (edge, dataIn) => {
      // Phase 1B filter: hide edges whose endpoints aren't both visible.
      const vedges = visibleEdgesRef.current;
      if (vedges && !vedges.has(edge)) {
        return { ...dataIn, hidden: true };
      }
      // Repo X-Ray overlay: highlight only existing edges between two detected nodes.
      const scanEdges = scanEdgesRef.current;
      if (scanEdges) {
        if (stackActiveRef.current) {
          // Stack View default: suppress edges so domain grouping is not mistaken for a
          // dependency (spec SS3). BUT when a node is SELECTED, reveal only its VERIFIED
          // canonical edges to other detected nodes (spec SS2) — never co-occurrence edges.
          const act = activeRef.current;
          if (act && scanEdges.has(edge)) {
            const [es, et] = graph.extremities(edge);
            if (es === act || et === act) {
              // Cross-domain verified edges are styled distinctly (amber) from same-domain
              // (blue) so a grouping line is never confused with a real relationship.
              const sd = graph.getNodeAttribute(es, "primaryDomain");
              const td = graph.getNodeAttribute(et, "primaryDomain");
              const crossDomain = sd !== td;
              return {
                ...dataIn,
                color: crossDomain ? "rgba(251,191,36,0.85)" : "rgba(150,180,255,0.75)",
                size: crossDomain ? 2.0 : 1.6,
                zIndex: 3,
              };
            }
          }
          return { ...dataIn, hidden: true };
        }
        if (scanEdges.has(edge)) {
          return { ...dataIn, color: SCAN_HILITE_EDGE, size: 1.5, zIndex: 2 };
        }
        if (scanContextRef.current?.has(edge)) {
          return { ...dataIn, color: SCAN_CONTEXT_EDGE, size: 0.7, zIndex: 1 };
        }
        // Unrelated edges: hide outright. They are the majority and only add noise in a
        // scan read; hiding (not just alpha~0) also saves overdraw (perf R30).
        return { ...dataIn, hidden: true, color: SCAN_DIM_EDGE, zIndex: 0 };
      }
      const active = activeRef.current;
      if (!active) {
        // Explore default (nothing selected): the view must read first as a MAP OF DOMAINS,
        // not a web of relationships (redesign §14 + atlas-overview-collision-free Layer 2).
        // At the OVERVIEW band, hide EVERY ordinary edge (intra-domain, cross-domain,
        // membership, subdomain-structural) so the default atlas is truly edge-free — a
        // true `hidden` state, not a faint alpha that still accumulates into a web. All 1116
        // edges remain in the graph and reappear the moment a node is selected/hovered or
        // the user zooms in. When zoomed into the DETAIL band with nothing selected, keep
        // the prior behaviour (structural spokes hidden, cross-node edges barely-there).
        if (
          isOverviewEdgeHidden({
            ratio: ratioRef.current,
            activeId: null,
            inScan: scanStatusRef.current != null,
          })
        ) {
          return { ...dataIn, hidden: true };
        }
        const rt = dataIn.relationshipType as string | undefined;
        if (rt === "belongs_to_domain" || rt === "has_subdomain") {
          return { ...dataIn, hidden: true };
        }
        return { ...dataIn, color: REST_EDGE, zIndex: 0 };
      }
      const [s, t] = graph.extremities(edge);
      if (s === active || t === active) {
        return { ...dataIn, color: ACTIVE_EDGE, size: 1.4, zIndex: 1 };
      }
      return { ...dataIn, color: DIM_EDGE, zIndex: 0 };
    });

    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null;
      scheduleRefresh();
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });
    renderer.on("clickNode", ({ node }) => {
      // Clicking an aggregate MARKER selects its domain: the sector expands to individual
      // members and the details panel shows the domain (markers are not canonical nodes).
      if (graph.hasNode(node) && graph.getNodeAttribute(node, "isAggregate") === true) {
        onSelect(graph.getNodeAttribute(node, "domainId") as string);
        return;
      }
      onSelect(node);
    });
    renderer.on("clickStage", () => onSelect(null));

    // Re-gate labels when the zoom level crosses a threshold (Task 8).
    const camera = renderer.getCamera();
    const onCameraUpdate = () => {
      const r = camera.getState().ratio;
      const crossed =
        bandOf(r) !== bandOf(ratioRef.current); // refresh on band change
      ratioRef.current = r;
      // At the aggregated overview (no selection, not scanning) the screen-space label
      // placement depends on the exact projected marker positions, so re-run the collision
      // pass on ANY camera move there (rAF-coalesced to one per frame — cheap for 14
      // markers). Elsewhere, only a band change needs a refresh.
      const atOverview =
        !activeRef.current && scanStatusRef.current == null && bandOf(r) <= 1;
      if (crossed || atOverview) scheduleRefresh();
      // Settle-debounced final pass: after the camera stops moving, re-place labels from the
      // FINAL projected positions (the last 'updated' can arrive after the last rAF), then
      // refresh once. Keeps the static overview exactly collision-free.
      if (atOverview) {
        if (labelSettleRef.current !== null) window.clearTimeout(labelSettleRef.current);
        labelSettleRef.current = window.setTimeout(() => {
          labelSettleRef.current = null;
          recomputeOverviewLabels();
          renderer.refresh();
        }, 160);
      }
    };
    camera.on("updated", onCameraUpdate);
    ratioRef.current = camera.getState().ratio;

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (labelSettleRef.current !== null) window.clearTimeout(labelSettleRef.current);
      labelSettleRef.current = null;
      camera.removeListener("updated", onCameraUpdate);
      renderer.kill();
      sigmaRef.current = null;
      graphRef.current = null;
      activeRef.current = null;
      neighborSetRef.current = null;
    };
  }, [data, onSelect]);

  // React to selection changes (recompute happens inside the scheduled refresh).
  useEffect(() => {
    selectedRef.current = selectedId;
    // Recompute the highlight set (not just a bare refresh) so selections coming
    // from search, the legend, a deep link, or the detail panel update the graph.
    scheduleRefreshRef.current?.();
  }, [selectedId]);

  // React to filter changes: update the live sets the reducers read, then refresh.
  // We never rebuild the graph or touch coordinates (requirement 1.7).
  useEffect(() => {
    visibleNodesRef.current = visibleNodes;
    visibleEdgesRef.current = visibleEdges;
    // Recompute active too: a filter may have just hidden the selected node.
    scheduleRefreshRef.current?.();
  }, [visibleNodes, visibleEdges]);

  // React to Repo X-Ray overlay changes: update the live sets the reducers read, then
  // refresh. Clearing them (scan exit) restores normal styling. Never mutates the graph.
  useEffect(() => {
    scanStatusRef.current = scanStatusByNode;
    scanEdgesRef.current = scanHighlightEdges;
    scanContextRef.current = scanContextEdges;
    // Recompute the budgeted persistent-label set once per overlay change (never per
    // frame — performance R30.4). Uses the graph's render sizes as the popularity proxy.
    const graph = graphRef.current;
    if (scanStatusByNode && graph) {
      const sizeById = new Map<string, number>();
      for (const id of scanStatusByNode.keys()) {
        if (graph.hasNode(id)) sizeById.set(id, graph.getNodeAttribute(id, "size") as number);
      }
      const ctx: LabelContext = {
        selectedId: selectedRef.current,
        hoveredId: hoveredRef.current,
        statusByNode: scanStatusByNode,
        sizeById,
      };
      // Label prioritization: on narrow (mobile) viewports show only the top few
      // persistent labels so clusters stay readable; selection/hover/zoom reveal more
      // (those bypass the budget in the node reducer). Desktop keeps the full budget.
      const vw = containerRef.current?.clientWidth ?? window.innerWidth;
      const labelBudget = vw < 760 ? 8 : vw < 1024 ? 16 : undefined;
      persistentLabelsRef.current = selectPersistentLabels(
        scanStatusByNode.keys(), ctx, labelBudget,
      );
    } else {
      persistentLabelsRef.current = null;
    }
    const renderer = sigmaRef.current;
    if (renderer) renderer.refresh();
  }, [scanStatusByNode, scanHighlightEdges, scanContextEdges]);

  // Stack View projection (X-Ray UX correction). Reprojects detected nodes into domain
  // clusters via temporary coordinates, with smooth eased repositioning; restores the
  // canonical coordinates on exit. Never mutates the dataset. Non-detected nodes are left
  // to the reducer (already dimmed/hidden under the scan overlay). prefers-reduced-motion
  // skips the animation and snaps to final positions.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Cancel any running projection animation.
    if (stackAnimRef.current !== null) {
      cancelAnimationFrame(stackAnimRef.current);
      stackAnimRef.current = null;
    }
    if (framedStackRef.current !== null) {
      cancelAnimationFrame(framedStackRef.current);
      framedStackRef.current = null;
    }

    stackActiveRef.current = !!(stackPositions && stackPositions.size > 0);
    stackPositionsRef.current = stackPositions ?? null;
    stackHeadingsRef.current = stackHeadings?.map((h) => ({ x: h.x, y: h.y })) ?? null;
    if (stackPositions && stackPositions.size > 0) {
      // Save canonical coordinates once (first entry into Stack View).
      if (!savedCoordsRef.current) {
        const saved = new Map<string, { x: number; y: number }>();
        graph.forEachNode((id, a) => saved.set(id, { x: a.x as number, y: a.y as number }));
        savedCoordsRef.current = saved;
      }
      const starts = new Map<string, { x: number; y: number }>();
      for (const [id] of stackPositions) {
        if (graph.hasNode(id)) {
          starts.set(id, {
            x: graph.getNodeAttribute(id, "x") as number,
            y: graph.getNodeAttribute(id, "y") as number,
          });
        }
      }
      const apply = (t: number) => {
        for (const [id, target] of stackPositions) {
          if (!graph.hasNode(id)) continue;
          const s = starts.get(id)!;
          graph.setNodeAttribute(id, "x", s.x + (target.x - s.x) * t);
          graph.setNodeAttribute(id, "y", s.y + (target.y - s.y) * t);
        }
        renderer.refresh();
      };
      if (prefersReduced) { apply(1); return; }
      const dur = 600;
      const t0 = performance.now();
      const ease = (u: number) => 1 - Math.pow(1 - u, 3); // easeOutCubic
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        apply(ease(u));
        if (u < 1) stackAnimRef.current = requestAnimationFrame(step);
        else stackAnimRef.current = null;
      };
      stackAnimRef.current = requestAnimationFrame(step);
      // Frame the camera on the reprojected stack bounds using Sigma's OWN coordinate
      // conversion (self-calibrating, not hardcoded), so clusters fit the USABLE viewport
      // (canvas width minus the open right sidebar + a label-safe margin) at any screen size.
      framedStackRef.current = requestAnimationFrame(() => {
        // Include heading anchors in the fit bounds so the topmost cluster label is
        // never clipped by the camera frame.
        const pts = [
          ...stackPositions.values(),
          ...(stackHeadings?.map((h) => ({ x: h.x, y: h.y })) ?? []),
        ];
        fitStack(renderer, pts, prefersReduced);
      });
    } else if (savedCoordsRef.current) {
      // Exit Stack View -> restore canonical coordinates (snap or eased).
      // Clear the custom bbox first so Sigma reframes the full canonical universe,
      // then reset the camera once coordinates are back home.
      renderer.setCustomBBox(null);
      const saved = savedCoordsRef.current;
      const starts = new Map<string, { x: number; y: number }>();
      graph.forEachNode((id, a) => starts.set(id, { x: a.x as number, y: a.y as number }));
      const apply = (t: number) => {
        for (const [id, target] of saved) {
          if (!graph.hasNode(id)) continue;
          const s = starts.get(id)!;
          graph.setNodeAttribute(id, "x", s.x + (target.x - s.x) * t);
          graph.setNodeAttribute(id, "y", s.y + (target.y - s.y) * t);
        }
        renderer.refresh();
      };
      if (prefersReduced) {
        apply(1); savedCoordsRef.current = null;
        void renderer.getCamera().animatedReset({ duration: 0 });
        return;
      }
      const dur = 500;
      const t0 = performance.now();
      const ease = (u: number) => 1 - Math.pow(1 - u, 3);
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        apply(ease(u));
        if (u < 1) stackAnimRef.current = requestAnimationFrame(step);
        else {
          stackAnimRef.current = null; savedCoordsRef.current = null;
          void renderer.getCamera().animatedReset({ duration: 400 });
        }
      };
      stackAnimRef.current = requestAnimationFrame(step);
    }
  }, [stackPositions, stackHeadings]);

  // "Focus Stack" — frame the detected nodes' bounding region with padding, keeping
  // labels readable (never zoom so far the graph is unusable). Uses the precomputed
  // coordinates; never relayouts.
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !fitSignal || fitSignal.ids.length === 0) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // In Stack View the camera is framed by the custom bbox (fitStack); re-run that
    // same path so "Focus on Stack" stays consistent and never mixes coordinate spaces.
    if (stackActiveRef.current && stackPositionsRef.current) {
      const pts = [
        ...stackPositionsRef.current.values(),
        ...(stackHeadingsRef.current?.map((h) => ({ x: h.x, y: h.y })) ?? []),
      ];
      fitStack(renderer, pts, prefersReduced);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = 0;
    for (const id of fitSignal.ids) {
      if (!graph.hasNode(id)) continue;
      const x = graph.getNodeAttribute(id, "x") as number;
      const y = graph.getNodeAttribute(id, "y") as number;
      if (typeof x !== "number" || typeof y !== "number") continue;
      found++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (found === 0) return;
    const camera = renderer.getCamera();
    // Full node spread for normalization.
    let fullMinX = Infinity, fullMaxX = -Infinity, fullMinY = Infinity, fullMaxY = -Infinity;
    graph.forEachNode((_n, a) => {
      const x = a.x as number, y = a.y as number;
      fullMinX = Math.min(fullMinX, x); fullMaxX = Math.max(fullMaxX, x);
      fullMinY = Math.min(fullMinY, y); fullMaxY = Math.max(fullMaxY, y);
    });
    const fit = computeFit({
      bounds: { minX, minY, maxX, maxY },
      fullSpread: { minX: fullMinX, minY: fullMinY, maxX: fullMaxX, maxY: fullMaxY },
      sidebarWidthPx: fitSignal.sidebarWidthPx ?? 0,
      viewportWidthPx: containerRef.current?.clientWidth ?? window.innerWidth,
      minRatio: 0.12,
      universeRatio: 1.1,
      padding: 0.4,
    });
    if (!fit) return;
    camera.animate(
      { x: fit.x, y: fit.y, ratio: fit.ratio },
      { duration: prefersReduced ? 0 : 600 },
    );
  }, [fitSignal]);

  // Explore "Home" reframe (Repo X-Ray -> Explore): clear any Stack View custom bbox and
  // smoothly restore the default sidebar-aware atlas camera. Runs only when exploreNonce
  // changes (not on first mount, which the construction effect already frames).
  const exploreNonceRef = useRef(exploreNonce);
  useEffect(() => {
    if (exploreNonce === exploreNonceRef.current) return;
    exploreNonceRef.current = exploreNonce;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    renderer.setCustomBBox(null);
    requestAnimationFrame(() => {
      fitExplore(renderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    });
  }, [exploreNonce]);

  // Animate the camera to the focused node; cancel any in-flight animation (Task 9).
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !focusId || !graph.hasNode(focusId)) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const display = renderer.getNodeDisplayData(focusId);
    if (!display) return;
    const camera = renderer.getCamera();
    // starting a new animation implicitly supersedes the previous target; calling
    // animate again is safe, but we null-out the callback timer by not chaining.
    camera.animate(
      { x: display.x, y: display.y, ratio: 0.35 },
      { duration: prefersReducedMotion ? 0 : 500 },
    );
  }, [focusId]);

  // Project Stack View domain headings to screen coordinates and keep them in sync with
  // camera moves. A handful of headings only (one per domain) -> cheap DOM overlay, not a
  // per-node label flood (performance budget preserved).
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    if (!stackHeadings || stackHeadings.length === 0) {
      setHeadingScreens([]);
      return;
    }
    const project = () => {
      const el = renderer.getContainer();
      const cw = el.clientWidth || window.innerWidth;
      const ch = el.clientHeight || window.innerHeight;
      // Usable band excludes the OPEN panel (right rail or bottom sheet). A heading is
      // hidden when it would land outside this band (off-screen or behind the panel) —
      // so on a tiny expanded-sheet preview we simplify by dropping labels rather than
      // overlapping them, without any extra state.
      const panel = document.querySelector(".details, .xray-panel") as HTMLElement | null;
      const pr = panel ? panel.getBoundingClientRect() : null;
      const cr = el.getBoundingClientRect();
      let bandRight = cw, bandBottom = ch;
      if (pr && pr.width > 0 && pr.height > 0) {
        if (pr.width >= cw * 0.85) bandBottom = Math.max(80, pr.top - cr.top - 8); // bottom sheet
        else bandRight = Math.max(120, pr.left - cr.left - 8); // right rail
      }
      const next = stackHeadings.map((h) => {
        const p = renderer.graphToViewport({ x: h.x, y: h.y });
        const visible = p.x > 4 && p.y > 4 && p.x < bandRight && p.y < bandBottom;
        return { domainId: h.domainId, label: h.label, color: h.color, left: p.x, top: p.y, visible };
      });
      setHeadingScreens(next);
    };
    project();
    const camera = renderer.getCamera();
    camera.on("updated", project);
    // The camera "updated" event can miss the final frame of an animatedReset (used by
    // fitStack) and of the collapse reframe, leaving headings projected from a stale
    // camera and visually detached from their clusters. Re-project on a short rAF loop
    // that spans the camera animation so headings track their clusters to the last frame.
    let rafId = 0;
    const start = performance.now();
    const loop = (now: number) => {
      project();
      if (now - start < 1200) rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => { camera.removeListener("updated", project); cancelAnimationFrame(rafId); };
    // Re-run (restart the rAF loop) whenever the stack reprojects or the camera is
    // reframed (fitSignal nonce changes, e.g. the mobile sheet collapse) so headings
    // re-sync even when fitStack uses setCustomBBox (which may not emit camera 'updated').
  }, [stackHeadings, stackPositions, fitSignal?.nonce]);

  // ---- Explore atlas backdrop: domain-sector backplates + centre identity ----
  // Decorative overlay only (pointer-events:none). Projects each domain's member-cluster
  // centroid/radius and the atlas centre to screen on every camera move, so the tinted
  // sectors and centre mark track pan/zoom without per-frame cost (recompute on 'updated').
  useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;

    // Compute graph-space geometry per TOP-LEVEL domain ONCE (deterministic from coords).
    // Members = nodes whose primaryDomain is the domain (same definition as the count).
    const doms = domainsRef.current;
    if (!doms || doms.length === 0) { setBackdrop({ sectors: [], center: null }); return; }
    if (!domainGeomRef.current) {
      const geom = new Map<string, { gx: number; gy: number; gr: number }>();
      for (const d of doms) {
        let sx = 0, sy = 0, n = 0;
        graph.forEachNode((id, a) => {
          if (a.primaryDomain === d.id || id === d.id) {
            sx += a.x as number; sy += a.y as number; n++;
          }
        });
        if (n === 0) continue;
        const gx = sx / n, gy = sy / n;
        let maxd = 0;
        graph.forEachNode((id, a) => {
          if (a.primaryDomain === d.id || id === d.id) {
            maxd = Math.max(maxd, Math.hypot((a.x as number) - gx, (a.y as number) - gy));
          }
        });
        // Tighter radius (atlas-overview-collision-free Layer 5) so adjacent sector
        // tints overlap less and the map does not wash into a single colour splash.
        geom.set(d.id, { gx, gy, gr: maxd * 0.8 + 40 });
      }
      domainGeomRef.current = geom;
    }

    const project = () => {
      // Suppress the atlas backdrop entirely during Repo X-Ray (Stack View owns the canvas).
      if (stackActiveRef.current) { setBackdrop({ sectors: [], center: null }); return; }
      const geom = domainGeomRef.current!;
      const colorOf = new Map(doms.map((d) => [d.id, d.color]));
      const sectors: { id: string; color: string; cx: number; cy: number; r: number }[] = [];
      let gcx = 0, gcy = 0, gn = 0;
      for (const [id, g] of geom) {
        const c = renderer.graphToViewport({ x: g.gx, y: g.gy });
        const edge = renderer.graphToViewport({ x: g.gx + g.gr, y: g.gy });
        const r = Math.hypot(edge.x - c.x, edge.y - c.y);
        sectors.push({ id, color: colorOf.get(id) ?? "#8a93ab", cx: c.x, cy: c.y, r });
        gcx += g.gx; gcy += g.gy; gn++;
      }
      // Centre of the ring = mean of domain centroids, projected.
      let center: { cx: number; cy: number; r: number } | null = null;
      if (gn > 0) {
        const cc = renderer.graphToViewport({ x: gcx / gn, y: gcy / gn });
        const cr0 = renderer.graphToViewport({ x: gcx / gn + 300, y: gcy / gn });
        center = { cx: cc.x, cy: cc.y, r: Math.hypot(cr0.x - cc.x, cr0.y - cc.y) };
      }
      setBackdrop({ sectors, center });
    };
    project();
    const camera = renderer.getCamera();
    camera.on("updated", project);
    const onResize = () => project();
    window.addEventListener("resize", onResize);
    // span the entry framing animation so the backdrop settles with the camera.
    // Also re-place the overview priority labels at the END of the span, i.e. once the
    // camera has fully settled at its final ratio-1 framing — the camera-event debounce can
    // run a frame early (mid-animation), so this guarantees a final collision pass from the
    // true final projected marker positions (no label grazes a panel/neighbour).
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => {
      project();
      if (now - t0 < 1400) raf = requestAnimationFrame(loop);
      else recomputeLabelsRef.current?.();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      camera.removeListener("updated", project);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [domains, data, exploreNonce, stackPositions]);

  const isEmpty = visibleNodes !== null && visibleNodes.size === 0;

  return (
    <div className="graph-canvas-wrap">
      {/* Atlas backdrop: soft domain-sector tints + centre identity. Behind the WebGL canvas,
          pointer-events:none, camera-synced. Decorative only — never affects graph events. */}
      {(backdrop.sectors.length > 0 || backdrop.center) && (
        <svg className="atlas-backdrop" aria-hidden>
          <defs>
            {backdrop.sectors.map((s) => (
              <radialGradient key={s.id} id={`sect-${s.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.11} />
                <stop offset="50%" stopColor={s.color} stopOpacity={0.045} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </radialGradient>
            ))}
            <radialGradient id="atlas-centre" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7aa2f7" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#7aa2f7" stopOpacity={0} />
            </radialGradient>
          </defs>
          {backdrop.sectors.map((s) => (
            <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill={`url(#sect-${s.id})`} />
          ))}
          {backdrop.center && (
            <g>
              <circle cx={backdrop.center.cx} cy={backdrop.center.cy}
                r={backdrop.center.r * 1.9} fill="url(#atlas-centre)" />
              {[1.15, 1.5, 1.9].map((m, i) => (
                <circle key={i} cx={backdrop.center!.cx} cy={backdrop.center!.cy}
                  r={backdrop.center!.r * m} className="atlas-ring" />
              ))}
            </g>
          )}
        </svg>
      )}
      {backdrop.center && (
        <div className="atlas-centre-id" aria-hidden
          style={{ left: backdrop.center.cx, top: backdrop.center.cy }}>
          <span className="atlas-centre-title">TechAtlas</span>
          <span className="atlas-centre-sub">Technology Knowledge Graph</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="graph-canvas"
        role="application"
        aria-label="Interactive technology graph. Use the search box or the node list for keyboard access."
      />
      {headingScreens.filter((h) => h.visible).map((h) => (
        <div
          key={h.domainId}
          className="stack-heading"
          style={{ left: h.left, top: h.top, borderColor: h.color }}
          aria-hidden
        >
          <span className="stack-heading-dot" style={{ background: h.color }} />
          {h.label}
        </div>
      ))}
      {isEmpty && (
        <div className="graph-empty-state" role="status">
          <p>No nodes match the current filters.</p>
          <p className="muted">Clear a filter to see the graph again.</p>
        </div>
      )}
    </div>
  );
}
