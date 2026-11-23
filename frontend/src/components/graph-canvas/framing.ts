import type Sigma from "sigma";

// Frame the Stack View on its clustered nodes by handing Sigma a CUSTOM BOUNDING BOX in
// graph-coordinate space and resetting the camera to fit it. All math stays in graph units;
// Sigma converts to camera space internally, so there is no coordinate-system mixing and no
// hardcoded pixel offsets. Framing is correct at any screen size. The right side of the box
// is padded by the sidebar's *fraction of the viewport* so the clusters sit in the visible
// area left of the open panel. Caller clears the custom bbox (setCustomBBox(null)) on exit.
export function fitStack(
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
export function fitExplore(renderer: Sigma, prefersReduced: boolean): number {
  const graph = renderer.getGraph();
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity, any = false;
  // Frame the full radial atlas, including every canonical node.
  graph.forEachNode((_n, a) => {
    const x = a.x as number, y = a.y as number;
    if (typeof x !== "number" || typeof y !== "number") return;
    any = true;
    mnX = Math.min(mnX, x); mnY = Math.min(mnY, y);
    mxX = Math.max(mxX, x); mxY = Math.max(mxY, y);
  });
  if (!any) return 1;
  const el = renderer.getContainer();
  const vw = el.clientWidth || window.innerWidth;
  // Narrow screens get extra padding so domain labels near the rim are not clipped by the
  // viewport edge (labels extend well beyond their node); wide screens use a tight frame.
  // Every canonical node stays visible at overview. A tighter mobile frame keeps the
  // clusters large enough to explore while leaving room for rim labels.
  // Domain headings sit just outside each ecosystem, so the frame reserves their band.
  const narrow = vw < 641;
  const padX = narrow ? (mxX - mnX) * 0.1 + 40 : 130;
  const padY = narrow ? (mxY - mnY) * 0.1 + 40 : 34;
  mnX -= padX; mxX += padX; mnY -= padY; mxY += padY;
  const vh = el.clientHeight || window.innerHeight;
  const cr = el.getBoundingClientRect();
  const fitW = (mxX - mnX) / Math.max(vw, 1), fitH = (mxY - mnY) / Math.max(vh, 1);
  // Portrait tablets and phones: the atlas is wider than tall, so fitting its full width
  // left half the screen empty above and below. Let the sides run off-screen a little
  // (people pan sideways easily) so the map fills most of the height instead.
  const portrait = vw < 1024 && vh > vw * 1.05;
  const gpx = portrait ? Math.max(fitW * (narrow ? 0.62 : 0.7), fitH) : Math.max(fitW, fitH);
  let leftW = 0, rightW = 0;
  if (vw >= 641) {
    const q = (sel: string) => {
      const n = document.querySelector(sel) as HTMLElement | null;
      const r = n ? n.getBoundingClientRect() : null;
      return r && r.width > 0 && r.width < vw * 0.6 ? r : null;  // ignore bottom sheets
    };
    const legend = q(".legend");
    const filters = q("#graph-filters, .filter-panel");
    for (const panel of [legend, filters]) {
      if (!panel) continue;
      if (panel.left - cr.left < vw / 2) leftW = Math.max(leftW, panel.right - cr.left);
      else rightW = Math.max(rightW, cr.right - panel.left);
    }
  }
  let bMinX = mnX - leftW * gpx;
  let bMaxX = mxX + rightW * gpx;
  if (portrait) {
    // Sigma fits the box by its constraining side, so crop the box itself to the width
    // the viewport shows at this scale; nodes past it still render and can be panned to.
    const cx = (bMinX + bMaxX) / 2, half = (vw * gpx) / 2;
    bMinX = cx - half; bMaxX = cx + half;
  }
  renderer.setCustomBBox({ x: [bMinX, bMaxX], y: [mnY, mxY] });
  if (prefersReduced) {
    renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    renderer.refresh();
  } else {
    void renderer.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 560, easing: "cubicInOut" });
  }
  // Layout units are px at the reference fit; scale drawn sizes to this viewport's fit.
  return Math.max(0.42, Math.min(1.25, 1 / gpx));
}

/** The part of the canvas that no open panel covers, in container pixels. */
export interface UsableRect { left: number; top: number; right: number; bottom: number }

// Panels that float over the canvas. Left tools, right details/X-Ray, the path card and
// phone bottom sheets all count; anything at least 85% of the width is treated as a sheet.
const OVERLAY_SELECTORS = [".details", ".xray-panel", ".stack-panel", ".outline-view:not(.is-fallback)",
  ".learning-panel", ".journey-panel", ".compare-panel"];

export function usableRect(container: HTMLElement): UsableRect {
  const cr = container.getBoundingClientRect();
  const vw = container.clientWidth || window.innerWidth;
  const vh = container.clientHeight || window.innerHeight;
  const r: UsableRect = { left: 0, top: 0, right: vw, bottom: vh };
  for (const sel of OVERLAY_SELECTORS) {
    for (const el of Array.from(document.querySelectorAll(sel)) as HTMLElement[]) {
      const p = el.getBoundingClientRect();
      if (p.width <= 0 || p.height <= 0) continue;
      const left = p.left - cr.left, right = p.right - cr.left, top = p.top - cr.top;
      if (p.width >= vw * 0.85 || (sel === ".journey-panel" && p.width < vw * 0.6 && left > vw * 0.2)) {
        // Bottom sheet, or the centred path card: the usable band is above it.
        if (top > vh * 0.3) r.bottom = Math.min(r.bottom, top - 8);
        continue;
      }
      if (left + p.width / 2 < vw / 2) r.left = Math.max(r.left, right + 8);
      else r.right = Math.min(r.right, left - 8);
    }
  }
  // Never shrink the usable area to nothing on tiny screens.
  if (r.right - r.left < 160) { r.left = 0; r.right = vw; }
  if (r.bottom - r.top < 140) { r.top = 0; r.bottom = vh; }
  return r;
}

/**
 * Frame a set of nodes inside the usable rectangle (canvas minus open panels), by camera
 * state only: no custom bbox, so semantic zoom and sizes stay as they are. With one node
 * the zoom is `singleRatio` (or the current zoom when already closer) and the node lands
 * in the centre of the usable area instead of the centre of the canvas.
 */
export function frameNodes(renderer: Sigma, ids: string[], opts: {
  prefersReduced: boolean; singleRatio?: number; minRatio?: number; padding?: number; duration?: number;
}): boolean {
  const pts = ids.map((id) => renderer.getNodeDisplayData(id)).filter((d): d is NonNullable<typeof d> => !!d && !d.hidden);
  if (pts.length === 0) return false;
  const container = renderer.getContainer();
  const vw = container.clientWidth || window.innerWidth;
  const vh = container.clientHeight || window.innerHeight;
  const base = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
  const toPx = (p: { x: number; y: number }) => renderer.framedGraphToViewport(p, { cameraState: base });
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity, cx = 0, cy = 0;
  for (const p of pts) {
    const v = toPx(p);
    mnX = Math.min(mnX, v.x - p.size); mxX = Math.max(mxX, v.x + p.size);
    mnY = Math.min(mnY, v.y - p.size); mxY = Math.max(mxY, v.y + p.size);
    cx += p.x; cy += p.y;
  }
  // Pixels per framed-graph unit at ratio 1 (y is flipped on screen).
  const o = toPx({ x: 0.5, y: 0.5 });
  const kx = Math.abs(toPx({ x: 0.6, y: 0.5 }).x - o.x) / 0.1 || 1;
  const ky = Math.abs(toPx({ x: 0.5, y: 0.6 }).y - o.y) / 0.1 || 1;
  const u = usableRect(container);
  const uw = u.right - u.left, uh = u.bottom - u.top;
  const pad = opts.padding ?? 0.22;
  const camera = renderer.getCamera();
  let ratio: number;
  if (pts.length === 1) {
    ratio = Math.min(camera.getState().ratio, opts.singleRatio ?? 0.35);
  } else {
    // Labels hang to the right of nodes; leave them room.
    const spanW = (mxX - mnX) + 110, spanH = (mxY - mnY) + 40;
    ratio = Math.max(spanW / (uw * (1 - pad)), spanH / (uh * (1 - pad)), opts.minRatio ?? 0.12);
    ratio = Math.min(ratio, 1.15);
  }
  // Centre of the set in framed units (bbox centre for sets, the node for one).
  let bx = cx / pts.length, by = cy / pts.length;
  if (pts.length > 1) {
    bx = 0.5 + ((mnX + mxX) / 2 - o.x) / kx;
    by = 0.5 - ((mnY + mxY) / 2 - o.y) / ky;
  }
  // Put that centre on the usable rectangle's centre, not the canvas centre.
  const dx = (u.left + uw / 2) - vw / 2, dy = (u.top + uh / 2) - vh / 2;
  const target = { x: bx - (dx * ratio) / kx, y: by + (dy * ratio) / ky, ratio };
  void camera.animate(target, { duration: opts.prefersReduced ? 0 : (opts.duration ?? 560), easing: "cubicInOut" });
  return true;
}
