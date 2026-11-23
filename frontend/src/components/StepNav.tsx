// "← Previous · Next →" for stepping through a list one item at a time (apps, roles,
// example scans). The neighbours' names are on the buttons, so you know where you'll land.
// [ and ] do the same from anywhere on the page (see useStepKeys).
import { useEffect } from "react";
import type { ReactNode } from "react";

export interface Step { label: string; onGo: () => void; icon?: ReactNode }

export function StepNav({ prev, next, label, position }: { prev: Step | null; next: Step | null; label: string; position?: string }) {
  return (
    <nav className="step-nav" aria-label={label}>
      <button type="button" className="step-btn is-prev" disabled={!prev} onClick={prev?.onGo}
        aria-label={prev ? `Previous: ${prev.label}` : "No previous"} title={prev ? `Previous: ${prev.label} ( [ )` : undefined}>
        <span className="step-arrow" aria-hidden>←</span>
        {prev && <span className="step-name">{prev.icon}<span className="step-text">{prev.label}</span></span>}
      </button>
      {position && <span className="step-pos" aria-hidden>{position}</span>}
      <button type="button" className="step-btn is-next" disabled={!next} onClick={next?.onGo}
        aria-label={next ? `Next: ${next.label}` : "No next"} title={next ? `Next: ${next.label} ( ] )` : undefined}>
        {next && <span className="step-name">{next.icon}<span className="step-text">{next.label}</span></span>}
        <span className="step-arrow" aria-hidden>→</span>
      </button>
    </nav>
  );
}

/** [ / ] step back / forward while `active`, unless typing in a field. */
export function useStepKeys(active: boolean, prev: (() => void) | null, next: (() => void) | null) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "[" && prev) { e.preventDefault(); prev(); }
      else if (e.key === "]" && next) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, prev, next]);
}

/** Neighbours of `index` in a list of `length`, wrapping around so there is always a next. */
export function neighbours(index: number, length: number): [number, number] | null {
  if (index < 0 || length < 2) return null;
  return [(index - 1 + length) % length, (index + 1) % length];
}
