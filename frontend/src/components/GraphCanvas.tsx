import { useEffect } from "react";
import type { DetectionStatus, GraphResponse } from "../api/types";
import type { SharedCamera } from "../graph/shareView";
import { useCanvasRefs } from "./graph-canvas/refs";
import { useSigmaRenderer } from "./graph-canvas/useSigmaRenderer";
import { useSelectionSync } from "./graph-canvas/useSelectionSync";
import { useStackProjection } from "./graph-canvas/useStackProjection";
import { useCameraControl } from "./graph-canvas/useCameraControl";
import { useStackHeadings } from "./graph-canvas/useStackHeadings";
import { useAtlasBackdrop } from "./graph-canvas/useAtlasBackdrop";
import { useKeyboardNav } from "./graph-canvas/useKeyboardNav";

interface Props {
  data: GraphResponse;
  theme?: "dark" | "light";
  journeyNodeIds?: string[];
  journeyEdgeIds?: string[];
  initialCamera?: SharedCamera | null;
  onCameraChange?: (camera: SharedCamera) => void;
  selectedId: string | null;
  selectedEdgeId?: string | null;
  previewEdgeId?: string | null;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onSelectEdge?: (id: string) => void;
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

const EMPTY_IDS: string[] = [];

/**
 * The primary WebGL visualization. Owns the Sigma instance imperatively; React only
 * drives it through props. Sigma is kept out of React's render loop so interactions
 * never recreate the renderer (spec §15).
 *
 * The renderer's pieces live in ./graph-canvas: colors, camera framing, heading
 * placement, the node/edge reducers, and one hook per concern.
 *
 * Performance (smoothness plan, Tasks 7-9):
 *  - the active node's neighbor set is computed ONCE per hover/selection change, not
 *    per-node per-frame, avoiding O(n^2) work in the reducers;
 *  - enter/leave events coalesce into a single requestAnimationFrame refresh;
 *  - label/edge visibility follows the camera ratio (semantic zoom);
 *  - camera animations cancel any in-flight animation before starting a new one.
 */
export function GraphCanvas({
  data,
  theme = "dark",
  journeyNodeIds = EMPTY_IDS,
  journeyEdgeIds = EMPTY_IDS,
  initialCamera = null,
  onCameraChange,
  selectedId,
  selectedEdgeId = null,
  previewEdgeId = null,
  focusId,
  onSelect,
  onSelectEdge,
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
  const refs = useCanvasRefs({
    journeyNodeIds, journeyEdgeIds, selectedId, selectedEdgeId, previewEdgeId, visibleNodes, visibleEdges,
    scanStatusByNode, scanHighlightEdges, scanContextEdges, onCameraChange, onSelect, onSelectEdge, domains,
  });
  const { containerRef, sigmaRef, onCameraChangeRef, journeyNodesRef, journeyEdgesRef } = refs;
  useEffect(() => { sigmaRef.current?.setSetting("labelColor", { color: theme === "light" ? "#26364d" : "#c8d0e8" }); sigmaRef.current?.refresh(); }, [theme]); // also re-runs node fades
  useEffect(() => { onCameraChangeRef.current = onCameraChange; }, [onCameraChange]);
  useEffect(() => { journeyNodesRef.current = new Set(journeyNodeIds); journeyEdgesRef.current = new Set(journeyEdgeIds); sigmaRef.current?.refresh(); }, [journeyNodeIds, journeyEdgeIds]);

  // Effect order matters (React runs them in call order): build the renderer first, then
  // sync props into it, then the camera and overlay effects that read its state.
  const hoverPreview = useSigmaRenderer(refs, data, initialCamera);
  useSelectionSync(refs, selectedId, selectedEdgeId, previewEdgeId, visibleNodes, visibleEdges,
    scanStatusByNode, scanHighlightEdges, scanContextEdges);
  useStackProjection(refs, stackPositions, stackHeadings);
  useCameraControl(refs, fitSignal, exploreNonce, focusId);
  const headingScreens = useStackHeadings(refs, stackHeadings, stackPositions, fitSignal?.nonce);
  const backdrop = useAtlasBackdrop(refs, data, domains, exploreNonce, stackPositions, scanStatusByNode, visibleNodes);
  useKeyboardNav(refs);

  const isEmpty = visibleNodes !== null && visibleNodes.size === 0;

  return (
    <div className="graph-canvas-wrap">
      {/* Atlas backdrop: soft domain-sector tints + centre identity. Behind the WebGL canvas,
          pointer-events:none, camera-synced. Decorative only — never affects graph events. */}
      {backdrop.sectors.length > 0 && (
        <svg className="atlas-backdrop" aria-hidden>
          <defs>
            {backdrop.sectors.map((s) => (
              <radialGradient key={s.id} id={`sect-${s.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.085} />
                <stop offset="60%" stopColor={s.color} stopOpacity={0.03} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          {backdrop.sectors.map((s) => (
            <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill={`url(#sect-${s.id})`} />
          ))}
        </svg>
      )}
      <div
        ref={containerRef}
        className="graph-canvas"
        role="group"
        tabIndex={0}
        aria-label="Technology graph. Arrow keys move to the connected node in that direction, Shift plus arrows pans, plus and minus zoom, 0 resets the view, Escape clears the selection. Search and the domain list reach every node."
      />
      {backdrop.headings.map((h) => (
        <button
          key={h.id}
          type="button"
          className={`atlas-heading atlas-heading-${h.align}${selectedId === h.id ? " is-active" : ""}`}
          aria-label={domains?.find((d) => d.id === h.id)?.name ?? h.label}
          style={{ left: h.left, top: h.top, ["--domain" as string]: h.color }}
          onClick={() => onSelect(h.id)}
        >
          {h.label}
        </button>
      ))}
      {hoverPreview && (() => {
        const node = data.nodes.find((n) => n.id === hoverPreview.id);
        if (!node) return null;
        const connections = new Set(data.edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => edge.source === node.id ? edge.target : edge.source)).size;
        return <aside className="node-preview" style={{ left: hoverPreview.x, top: hoverPreview.y }} aria-hidden="true">
          <strong>{node.label}</strong><span>{node.node_subtype || node.node_type} · {connections} connections</span>
          {hoverPreview.description && <p>{hoverPreview.description}</p>}
        </aside>;
      })()}
      <div className="sr-only" aria-live="polite">{selectedId ? `${data.nodes.find((n) => n.id === selectedId)?.label ?? ""} selected` : ""}</div>
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
