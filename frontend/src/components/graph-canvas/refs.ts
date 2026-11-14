import { useRef } from "react";
import type Graph from "graphology";
import type Sigma from "sigma";
import type { DetectionStatus } from "../../api/types";
import type { SharedCamera } from "../../graph/shareView";

export type Point = { x: number; y: number };

export interface CanvasRefInputs {
  journeyNodeIds: string[];
  journeyEdgeIds: string[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  previewEdgeId: string | null;
  visibleNodes: Set<string> | null;
  visibleEdges: Set<string> | null;
  scanStatusByNode: Map<string, DetectionStatus> | null;
  scanHighlightEdges: Set<string> | null;
  scanContextEdges: Set<string> | null;
  onCameraChange?: (camera: SharedCamera) => void;
  onSelect: (id: string | null) => void;
  onSelectEdge?: (id: string) => void;
  domains: { id: string; name: string; color: string; node_count: number }[] | null;
}

/**
 * Every mutable value the Sigma renderer reads. Sigma lives outside React's render loop
 * (spec §15): the reducers and event handlers read these refs on each frame, and the
 * prop-sync effects in GraphCanvas write them. Kept in one bag so the canvas hooks can
 * share them without threading a dozen arguments each.
 */
export function useCanvasRefs(p: CanvasRefInputs) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCameraChangeRef = useRef(p.onCameraChange);
  const onSelectRef = useRef(p.onSelect);
  const onSelectEdgeRef = useRef(p.onSelectEdge);
  onSelectRef.current = p.onSelect;
  onSelectEdgeRef.current = p.onSelectEdge;
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const journeyNodesRef = useRef(new Set(p.journeyNodeIds));
  const journeyEdgesRef = useRef(new Set(p.journeyEdgeIds));
  const hoveredRef = useRef<string | null>(null);
  // Members of a hovered domain, so hovering a field's main dot previews its whole network.
  const hoverDomainSetRef = useRef<Set<string> | null>(null);
  const descriptionsRef = useRef(new Map<string, string>());
  const pendingDescriptionsRef = useRef(new Set<string>());
  const selectedRef = useRef<string | null>(p.selectedId);
  const selectedEdgeRef = useRef<string | null>(p.selectedEdgeId);
  const previewEdgeRef = useRef<string | null>(p.previewEdgeId);
  // Precomputed highlight set for the current active node (Task 7).
  const activeRef = useRef<string | null>(null);
  const neighborSetRef = useRef<Set<string> | null>(null);
  // Live filter visibility sets, read inside the reducers (Phase 1B).
  const visibleNodesRef = useRef<Set<string> | null>(p.visibleNodes);
  const visibleEdgesRef = useRef<Set<string> | null>(p.visibleEdges);
  // Repo X-Ray overlay sets, read inside the reducers (Phase 1.5B).
  const scanStatusRef = useRef<Map<string, DetectionStatus> | null>(p.scanStatusByNode);
  const scanEdgesRef = useRef<Set<string> | null>(p.scanHighlightEdges);
  const scanContextRef = useRef<Set<string> | null>(p.scanContextEdges);
  // Persistent detected-node labels (UI-A): recomputed only when the overlay changes.
  const persistentLabelsRef = useRef<Set<string> | null>(null);
  // Saved canonical coordinates while Stack View is active (restored on exit).
  const savedCoordsRef = useRef<Map<string, Point> | null>(null);
  const focusBBoxRef = useRef(false);
  const stackAnimRef = useRef<number | null>(null);
  const stackActiveRef = useRef<boolean>(false);
  const framedStackRef = useRef<number | null>(null);
  const stackPositionsRef = useRef<Map<string, Point> | null>(null);
  const stackHeadingsRef = useRef<Point[] | null>(null);
  // rAF coalescing for refreshes (Task 7).
  const rafRef = useRef<number | null>(null);
  // Exposes the build-effect's coalesced refresh to the selection/filter effects,
  // so a selection change from search/legend/deep-link/panel recomputes the highlight
  // set (not just a bare renderer.refresh()).
  const scheduleRefreshRef = useRef<(() => void) | null>(null);
  const ratioRef = useRef<number>(1);
  // Drawn-size multiplier for the current viewport's atlas fit (1 = 1440x900 reference).
  const sizeScaleRef = useRef<number>(1);
  const focusFadeRef = useRef<number>(1);
  const domainGeomRef = useRef<Map<string, { gx: number; gy: number; gr: number; hr: number }> | null>(null);
  const domainsRef = useRef(p.domains);
  domainsRef.current = p.domains;

  return {
    containerRef, onCameraChangeRef, onSelectRef, onSelectEdgeRef, sigmaRef, graphRef,
    journeyNodesRef, journeyEdgesRef, hoveredRef, hoverDomainSetRef, descriptionsRef,
    pendingDescriptionsRef, selectedRef, selectedEdgeRef, previewEdgeRef, activeRef,
    neighborSetRef, visibleNodesRef, visibleEdgesRef, scanStatusRef, scanEdgesRef,
    scanContextRef, persistentLabelsRef, savedCoordsRef, focusBBoxRef, stackAnimRef,
    stackActiveRef, framedStackRef, stackPositionsRef, stackHeadingsRef, rafRef,
    scheduleRefreshRef, ratioRef, sizeScaleRef, focusFadeRef, domainGeomRef, domainsRef,
  };
}

export type CanvasRefs = ReturnType<typeof useCanvasRefs>;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
