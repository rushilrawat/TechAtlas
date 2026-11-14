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
  const gpx = Math.max((mxX - mnX) / Math.max(vw, 1), (mxY - mnY) / Math.max(vh, 1));
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
  const bMinX = mnX - leftW * gpx;
  const bMaxX = mxX + rightW * gpx;
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
