export type Heading = { id: string; label: string; color: string; left: number; top: number; align: string;
  disc?: { x: number; y: number; r: number } };
export type Box = { x: number; y: number; w: number; h: number };
const HEADING_FONT = "600 11.5px Inter, system-ui, sans-serif";
const HEADING_MAX_W = 150, HEADING_LINE_H = 14.4;
// Phones: the whole atlas is a few hundred px wide, so names are smaller and short.
const PHONE_HEADING_FONT = "600 10px Inter, system-ui, sans-serif";
const PHONE_MAX_W = 96, PHONE_LINE_H = 12.5;
export const SHORT_NAMES: Record<string, string> = {
  "domain:ai-ml": "AI & ML", "domain:backend": "Backend", "domain:cloud-devops": "Cloud & DevOps",
  "domain:networks": "Networks", "domain:security": "Security", "domain:databases": "Databases",
  "domain:frontend": "Frontend", "domain:gamedev": "Game Dev", "domain:mobile": "Mobile & Desktop",
  "domain:robotics": "Robotics", "domain:software-engineering": "Software Eng.",
  "domain:systems": "Systems", "domain:testing-tooling": "Testing & Tooling", "domain:theory": "Theory",
  "domain:quantum": "Quantum", "domain:blockchain": "Blockchain", "domain:iot": "IoT",
  "domain:computer-engineering": "Comp. Eng.", "domain:hci": "HCI", "domain:interdisciplinary": "Interdisciplinary",
  "domain:offensive-security": "Ethical Hacking",
  "domain:computer-graphics": "Graphics",
};
let headingCtx: CanvasRenderingContext2D | null = null;

/** Whether a box overlaps a circle (closest-point test). */
function discHits(b: Box, d: { x: number; y: number; r: number }, fringe = 0.85) {
  const nx = Math.max(b.x, Math.min(d.x, b.x + b.w)), ny = Math.max(b.y, Math.min(d.y, b.y + b.h));
  return Math.hypot(nx - d.x, ny - d.y) < d.r * fringe;
}

/** Screen-space obstacles (drawn nodes and sampled visible curves) bucketed in a grid. */
export class Obstacles {
  private cells = new Map<string, { x: number; y: number; r: number; node: boolean; owner: string }[]>();
  constructor(private size = 24) {}
  add(x: number, y: number, r: number, node: boolean, owner: string) {
    const k = Math.floor(x / this.size) + ":" + Math.floor(y / this.size);
    const list = this.cells.get(k);
    if (list) list.push({ x, y, r, node, owner }); else this.cells.set(k, [{ x, y, r, node, owner }]);
  }
  /**
   * Nodes and curve samples touching the box (pad gives the label a little air), split
   * into those of the labelled ecosystem itself and those of any other ecosystem.
   */
  count(b: Box, owner: string, pad = 6) {
    let nodes = 0, curves = 0, own = 0, ownNodes = 0;
    const s = this.size;
    for (let gx = Math.floor((b.x - pad - 8) / s); gx <= Math.floor((b.x + b.w + pad + 8) / s); gx++) {
      for (let gy = Math.floor((b.y - pad - 8) / s); gy <= Math.floor((b.y + b.h + pad + 8) / s); gy++) {
        for (const o of this.cells.get(gx + ":" + gy) ?? []) {
          const m = pad + o.r;
          if (o.x > b.x - m && o.x < b.x + b.w + m && o.y > b.y - m && o.y < b.y + b.h + m) {
            if (o.owner.split("|").includes(owner)) { own++; if (o.node) ownNodes++; }
            else if (o.node) nodes++; else curves++;
          }
        }
      }
    }
    return { nodes, curves, own, ownNodes };
  }
}

/**
 * Domain headings placed like map labels. Every heading tries spots all around its own
 * ecosystem (16 directions, from inside its sparse outer ring to just past its rim) and
 * takes the clearest one: it never overlaps another heading, a side panel, the viewport
 * edge or another ecosystem's body, and it is scored against the drawn nodes and curves
 * it would cover and its distance from its own cluster. Larger domains place first.
 */
export function placeHeadings(headings: Heading[], container: HTMLElement,
  domains: { id: string; node_count: number }[], selected: string | null,
  obstacles: Obstacles, ringLike: boolean): Heading[] {
  headingCtx ??= document.createElement("canvas").getContext("2d");
  if (!headingCtx) return headings;
  const vw = container.clientWidth, vh = container.clientHeight;
  const phone = vw < 641;
  headingCtx.font = phone ? PHONE_HEADING_FONT : HEADING_FONT;
  const maxW = phone ? PHONE_MAX_W : HEADING_MAX_W, lineH = phone ? PHONE_LINE_H : HEADING_LINE_H;
  // Small clusters keep their names tight against the rim instead of a fixed gap.
  const gap = phone ? 2 : 6;
  const crect = container.getBoundingClientRect();
  const panels = [".legend", "#graph-filters", ".filter-panel", ".relationship-legend", ".details", ".hero",
    ".atlas-rail", ".journey-panel", ".compare-panel"]
    .map((sel) => document.querySelector(sel)?.getBoundingClientRect())
    .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0 && r.width < vw * 0.85)
    .map((r) => ({ x: r.left - crect.left, y: r.top - crect.top, w: r.width, h: r.height }));
  const count = new Map(domains.map((d) => [d.id, d.node_count]));
  const hits = (a: Box, b: Box) =>
    a.x < b.x + b.w + 8 && a.x + a.w + 8 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
  const rank = (h: Heading) => (h.id === selected ? Infinity : count.get(h.id) ?? 0);
  // Greedy placement depends on order. Place largest first; then re-run with any heading
  // that had to cover another ecosystem moved to the front, and keep the cleanest result.
  let order = [...headings].sort((a, b) => rank(b) - rank(a));
  let result: { placed: { h: Heading; box: Box }[]; foreign: Map<string, number> } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const run = placeInOrder(order);
    const total = (r: typeof run) => [...r.foreign.values()].reduce((a, b) => a + b, 0) * 10
      + (headings.length - r.placed.length) * 100;
    if (!result || total(run) < total(result)) result = run;
    const bad = order.filter((h) => (run.foreign.get(h.id) ?? 0) > 0 || !run.placed.some((p) => p.h.id === h.id));
    if (!bad.length) break;
    order = [...bad, ...order.filter((h) => !bad.includes(h))];
  }
  return result!.placed.map((p) => p.h);

  function placeInOrder(sequence: Heading[]) {
  const placed: { h: Heading; box: Box }[] = [];
  const foreign = new Map<string, number>();
  for (const h of sequence) {
    if (!h.disc) continue;
    const { x: cx, y: cy, r } = h.disc;
    // Canvas metrics can run narrower than the DOM's rendered font; keep a safety margin.
    const label = phone ? SHORT_NAMES[h.id] ?? h.label : h.label;
    const text = (headingCtx?.measureText(label).width ?? label.length * 6) * 1.08;
    const w = Math.min(maxW, text + 2);
    const bh = Math.ceil(text / maxW + 0.05) * lineH + (phone ? 2 : 4);
    let best: { score: number; box: Box; foreign: number } | null = null;
    // Second pass only if the strict "nearest to its own cluster" rule left no spot at all.
    for (const strict of [true, false]) {
    if (best) break;
    for (const reach of phone ? [0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.25, 1.45, 1.7, 2] : [0.7, 0.85, 0.95, 1.05, 1.2]) {
      for (let k = 0; k < 24; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 12; // start straight above
        const dx = Math.cos(a), dy = Math.sin(a);
        // The box's near edge touches the spot, so the label grows away from its cluster.
        const px = cx + dx * (r * reach + gap), py = cy + dy * (r * reach + gap);
        const box = { x: px - w / 2 + (dx * w) / 2, y: py - bh / 2 + (dy * bh) / 2, w, h: bh };
        if (box.x < 4 || box.y < 2 || box.x + w > vw - 4 || box.y + bh > vh - 2) continue;
        if (panels.some((p) => hits(box, p)) || placed.some((p) => hits(box, p.box))) continue;
        if (strict && phone && headings.some((o) => o.id !== h.id && o.disc && discHits(box, o.disc, 0.7))) continue;
        const { nodes, curves, own, ownNodes } = obstacles.count(box, h.id);
        // Ring compositions read best with names on the outer rim; maps prefer above.
        const outward = ringLike ? Math.hypot(px - vw / 2, py - vh / 2) < Math.hypot(cx - vw / 2, cy - vh / 2) ? 2 : 0 : 0;
        const below = dy > 0.35 ? 0.6 : 0;
        // Covering another ecosystem's nodes or lines is what reads as a wrong label, so it
        // costs far more than grazing its own cluster's sparse fringe or sitting farther out.
        // Phones: clusters are packed tightly, so a name must also read as belonging to its
        // own cluster; it may not sit nearer (by rim distance) to any other ecosystem.
        const bx = box.x + w / 2, by = box.y + bh / 2;
        const ownGap = Math.hypot(bx - cx, by - cy) - r;
        // A name must read as belonging to its own cluster: it may never sit nearer (by rim
        // distance, measured from the label's closest edge) to any other ecosystem.
        const near = (d: { x: number; y: number; r: number }) =>
          Math.hypot(Math.max(box.x, Math.min(d.x, box.x + w)) - d.x, Math.max(box.y, Math.min(d.y, box.y + bh)) - d.y) - d.r;
        const ownNear = near(h.disc);
        if (strict && headings.some((o) => o.id !== h.id && o.disc && (phone
          ? Math.hypot(bx - o.disc.x, by - o.disc.y) - o.disc.r < ownGap - 2
          : near(o.disc) < ownNear + 12))) continue;
        // On phones clusters are tiny, so a name on its own nodes hides the cluster itself.
        // Desktop: names hug their cluster, centred above or below it where there is room.
        const side = phone ? 0 : Math.abs(dx) * 1.5;
        const score = nodes * 14 + curves * 9 + ownNodes * (phone ? 12 : 4) + own * 0.6 + reach * 3 + below + outward
          + side + (phone ? 0 : Math.max(0, ownNear) * 0.12);
        if (!best || score < best.score - 1e-9) best = { score, box, foreign: nodes + curves + ownNodes };
      }
    }
    }
    if (best) {
      foreign.set(h.id, best.foreign);
      placed.push({ box: best.box,
        h: { id: h.id, label, color: h.color, left: best.box.x, top: best.box.y, align: phone ? "box phone" : "box" } });
    }
  }
  return { placed, foreign };
  }
}
