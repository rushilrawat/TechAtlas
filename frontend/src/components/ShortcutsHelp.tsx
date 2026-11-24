import { useEffect, useRef } from "react";

// Grouped by where they work, so the arrow keys (which mean different things on the map
// and in a toolbar) are listed once under each place instead of twice with no context.
const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Anywhere", items: [
    ["/", "Search"], ["Esc", "Close the open panel"], ["F", "Fullscreen"], ["O", "Atlas outline (list view)"],
    ["M", "My learning map"], ["P", "Guided paths"], ["?", "This help"],
  ] },
  { title: "On the map", items: [
    ["← → ↑ ↓", "Move between connected nodes"],
    ["[ ]", "Previous / next app, role, guided-path step or example scan"],
  ] },
  { title: "In lists and toolbars", items: [
    ["← → ↑ ↓", "Move between buttons"], ["Home End", "First / last button"],
  ] },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "?") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [onClose]);
  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
        tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        {GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="shortcuts-group">{g.title}</h3>
            <dl>
              {g.items.map(([keys, what]) => (
                <div key={what}><dt><kbd>{keys}</kbd></dt><dd>{what}</dd></div>
              ))}
            </dl>
          </section>
        ))}
        <p className="muted">Tip: Compare two technologies side by side, or follow a guided path from the toolbar.</p>
        <button type="button" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
