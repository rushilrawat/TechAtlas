import type { NodeHoverDrawingFunction } from "sigma/rendering";

// Hovered / highlighted node: a dark rounded plate under the light label (Sigma's
// default plate is white, which made the light label unreadable).
export const drawNodeHover: NodeHoverDrawingFunction = (context, d, settings) => {
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  const light = document.documentElement.dataset.theme === "light";
  context.beginPath();
  context.arc(d.x, d.y, d.size + 3, 0, Math.PI * 2);
  context.fillStyle = light ? "rgba(255,255,255,0.95)" : "rgba(11,14,20,0.92)";
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = typeof d.color === "string" ? d.color : "#c8d0e8";
  context.stroke();
  if (typeof d.label !== "string" || !d.label) return;
  const w = context.measureText(d.label).width;
  const x = d.x + d.size + 6, h = size + 8;
  context.beginPath();
  context.roundRect(x - 4, d.y - h / 2, w + 8, h, 5);
  context.fillStyle = light ? "rgba(255,255,255,0.95)" : "rgba(11,14,20,0.92)";
  context.fill();
  context.fillStyle = light ? "#1d3046" : "#eef2fb";
  context.fillText(d.label, x, d.y + size / 3);
};
