// A row that scrolls sideways when it doesn't fit, with ← / → buttons that appear only on
// the side that has more to show. Used for the toolbar on phones and other chip rows.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";

export function ScrollRow({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);
  // Bring the focused item into view when keyboard focus moves past the edge.
  const onFocus = (e: FocusEvent) => (e.target as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" });
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className={`scroll-row${edges.start ? " can-start" : ""}${edges.end ? " can-end" : ""} ${className}`}>
      {edges.start && <button type="button" className="scroll-arrow is-start" tabIndex={-1} aria-label={`Scroll ${label} left`} onClick={() => scroll(-1)}>←</button>}
      <div className="scroll-row-track" ref={ref} onFocus={onFocus}>{children}</div>
      {edges.end && <button type="button" className="scroll-arrow is-end" tabIndex={-1} aria-label={`Scroll ${label} right`} onClick={() => scroll(1)}>→</button>}
    </div>
  );
}
