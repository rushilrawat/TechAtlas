// Arrow-key traversal for groups of buttons (toolbars, card grids, chip rows, step dots).
// Put onKeyDown={arrowNav} (or arrowNavWith({...})) on the container; it carries the
// data-arrow-nav attribute so the atlas's own arrow-key navigation leaves it alone.
//
//   ← / →   previous / next item (in DOM order)
//   ↑ / ↓   in a grid, the item in the row above / below nearest in x; elsewhere same as ← / →
//   Home / End   first / last item
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const ITEMS = "button:not([disabled]), a[href], [role='option']";

function visible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

export interface ArrowNavOptions { selector?: string; grid?: boolean; wrap?: boolean }

/** The item to move to from `from` for `key`, or null. Exported for tests. */
export function arrowTarget(items: HTMLElement[], from: number, key: string, opts: ArrowNavOptions = {}): number | null {
  const n = items.length;
  if (!n) return null;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  const step = (d: number) => {
    const to = from + d;
    if (to < 0 || to >= n) return opts.wrap ? (to + n) % n : null;
    return to;
  };
  if (key === "ArrowLeft") return step(-1);
  if (key === "ArrowRight") return step(1);
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  if (!opts.grid) return step(key === "ArrowUp" ? -1 : 1);
  // Grid: nearest item (by centre x) in the closest row above or below.
  const rect = (i: number) => items[i].getBoundingClientRect();
  const here = rect(from), cx = here.left + here.width / 2;
  const down = key === "ArrowDown";
  let best: number | null = null, bestRow = Infinity, bestDx = Infinity;
  items.forEach((_, i) => {
    if (i === from) return;
    const r = rect(i);
    const dy = down ? r.top - here.top : here.top - r.top;
    if (dy <= 4) return;
    const dx = Math.abs(r.left + r.width / 2 - cx);
    if (dy < bestRow - 4 || (Math.abs(dy - bestRow) <= 4 && dx < bestDx)) { best = i; bestRow = dy; bestDx = dx; }
  });
  return best;
}

export function arrowNavWith(opts: ArrowNavOptions = {}) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(opts.selector ?? ITEMS)].filter(visible);
    const from = items.findIndex((el) => el === target || el.contains(target));
    if (from < 0) return;
    const to = arrowTarget(items, from, event.key, opts);
    // Keep the keystroke inside the group even at an edge, so the atlas doesn't jump.
    event.preventDefault();
    event.stopPropagation();
    if (to === null || to === from) return;
    items[to].focus();
    items[to].scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
}

export const arrowNav = arrowNavWith();
export const arrowNavGrid = arrowNavWith({ grid: true });
