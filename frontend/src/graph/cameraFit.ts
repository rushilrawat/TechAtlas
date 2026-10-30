// Pure camera-fit math (Phase 1.5 UI-A), extracted for unit testing without Sigma.
// Frames a detected-region bounding box within the usable viewport (viewport width minus
// the open sidebar), biasing the center away from the sidebar so highlighted nodes are
// not covered by the panel. Returns normalized camera target {x,y,ratio} or null.

export interface FitInput {
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  fullSpread: { minX: number; minY: number; maxX: number; maxY: number };
  sidebarWidthPx: number;
  viewportWidthPx: number;
  minRatio: number;   // camera minimum ratio clamp (most zoomed-in)
  universeRatio: number; // ratio that shows ~the whole graph (upper clamp for a fit)
  padding?: number;   // fraction of extra span to leave around the region (default 0.4)
}

export interface FitResult {
  x: number; // normalized [0..1] target center x in graph-extent space
  y: number; // normalized [0..1] target center y (note: screen y is inverted)
  ratio: number;
}

export function computeFit(input: FitInput): FitResult | null {
  const { bounds, fullSpread, sidebarWidthPx, viewportWidthPx, minRatio, universeRatio } = input;
  if (!bounds) return null;
  const padding = input.padding ?? 0.4;
  const fullW = Math.max(fullSpread.maxX - fullSpread.minX, 1e-6);
  const fullH = Math.max(fullSpread.maxY - fullSpread.minY, 1e-6);

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const gw = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const gh = Math.max(bounds.maxY - bounds.minY, 1e-6);

  // Framing ratio from the detected span relative to the full spread, with padding,
  // clamped so we never zoom past the universe view or tighter than the min ratio.
  const spanRatio = Math.max(gw / fullW, gh / fullH);
  const ratio = Math.min(universeRatio, Math.max(minRatio, spanRatio * (1 + padding) + 0.08));

  // Normalized center in graph-extent space (screen y inverted, matching Sigma usage).
  let nx = (cx - fullSpread.minX) / fullW;
  const ny = 1 - (cy - fullSpread.minY) / fullH;

  // Sidebar offset: the usable canvas is (viewport - sidebar) wide. Shift the target
  // center LEFT by half the sidebar's share of the viewport so the region sits in the
  // visible area, not behind the panel.
  if (viewportWidthPx > 0 && sidebarWidthPx > 0) {
    const sidebarFrac = Math.min(0.9, sidebarWidthPx / viewportWidthPx);
    nx -= (sidebarFrac / 2) * ratio;
  }
  return { x: nx, y: ny, ratio };
}
