import { useEffect, useRef } from "react";

const SHORTCUTS: [string, string][] = [
  ["/", "Search"],
  ["← → ↑ ↓", "Move between connected nodes"],
  ["Esc", "Close the open panel"],
  ["F", "Fullscreen"],
  ["O", "Atlas outline (list view)"],
  ["M", "My learning map"],
  ["P", "Guided paths library"],
  ["?", "This help"],
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
        <dl>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{what}</dd></div>
          ))}
        </dl>
        <p className="muted">Tip: Compare two technologies side by side, or follow a guided path from the toolbar.</p>
        <button type="button" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
