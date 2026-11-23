import type { NodeLabelDrawingFunction } from "sigma/rendering";

// Node labels that never draw on top of each other. Sigma's own grid drops colliding
// labels, but highlighted sets (a role, an app, a stack, X-Ray detections) force their
// labels on, and those used to pile into one unreadable blob. Each label now tries a few
// spots around its node and takes the first free one; if none is free it is skipped
// (hovering the node still shows it). The occupied list resets before every frame.

interface Box { x0: number; y0: number; x1: number; y1: number }
let taken: Box[] = [];
let hidden = 0;

/** Call on Sigma's "beforeRender" so each frame starts with an empty page. */
export function resetLabelSpace(): void { taken = []; hidden = 0; }
/** How many labels the last frame could not place (for tests and debugging). */
export function hiddenLabelCount(): number { return hidden; }
/** Boxes the last frame's labels took, so DOM field headings can keep clear of them. */
export function labelBoxes(): readonly Box[] { return taken; }

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Pure placement: the first candidate box around (x, y) that doesn't hit `used`, or null. */
export function placeLabel(x: number, y: number, r: number, w: number, h: number, used: Box[]): Box & { tx: number; ty: number } | null {
  const gap = 4;
  const candidates = [
    { tx: x + r + gap, ty: y },                    // right (the default)
    { tx: x - r - gap - w, ty: y },                // left
    { tx: x - w / 2, ty: y - r - gap - h / 2 },    // above
    { tx: x - w / 2, ty: y + r + gap + h / 2 },    // below
    { tx: x + r + gap, ty: y - h },                // upper right
    { tx: x + r + gap, ty: y + h },                // lower right
  ];
  for (const c of candidates) {
    const box = { x0: c.tx - 2, y0: c.ty - h / 2 - 1, x1: c.tx + w + 2, y1: c.ty + h / 2 + 1 };
    if (!used.some((b) => overlaps(b, box))) return { ...box, ...c };
  }
  return null;
}

export const drawNodeLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  // Sub-field names (domain nodes nested in a field) read as map captions: smaller, in
  // the field's own colour, so they never compete with the field headings or node names.
  const sub = (data as { nodeType?: string }).nodeType === "domain";
  const size = sub ? settings.labelSize - 1 : settings.labelSize;
  context.font = `${sub ? 600 : settings.labelWeight} ${size}px ${settings.labelFont}`;
  const w = context.measureText(data.label).width;
  // The node's own disc is occupied too, so a neighbour's label never covers it.
  const spot = placeLabel(data.x, data.y, data.size, w, size + 2, taken);
  if (!spot) { hidden++; return; }
  taken.push(spot, { x0: data.x - data.size, y0: data.y - data.size, x1: data.x + data.size, y1: data.y + data.size });
  const light = document.documentElement.dataset.theme === "light";
  // A thin halo in the background colour keeps the text readable over dots and lines.
  context.lineJoin = "round";
  context.lineWidth = 3;
  context.strokeStyle = light ? "rgba(237,242,247,0.9)" : "rgba(8,13,24,0.85)";
  context.strokeText(data.label, spot.tx, spot.ty + size / 3);
  const c = settings.labelColor;
  context.fillStyle = sub && typeof data.color === "string" && !light ? data.color
    : ("color" in c ? c.color : undefined) ?? (light ? "#26364d" : "#c8d0e8");
  context.fillText(data.label, spot.tx, spot.ty + size / 3);
};
