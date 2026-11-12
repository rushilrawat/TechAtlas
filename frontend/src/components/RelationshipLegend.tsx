import { useState } from "react";

export function RelationshipLegend() {
  const [open, setOpen] = useState(false);
  return (
    <section className="relationship-legend" aria-label="Connection legend">
      <button type="button" className="relationship-legend-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Connections <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="relationship-legend-body">
        <p>The overview draws a sparse backbone of real, canonical relationships. Position and color show domain membership. Select a curve or a relationship row for its exact type.</p>
        <div><span className="edge-swatch edge-swatch-local" /> Within an ecosystem, in its domain color</div>
        <div><span className="edge-swatch edge-swatch-cross" /> Across neighboring ecosystems</div>
        <p>Zoom in to reveal more connections, or select a node to see all of its relationships.</p>
        <p className="relationship-legend-keys">Keyboard: arrows move along connections · Shift + arrows pan · + / − zoom · 0 resets · F fullscreen · Esc clears</p>
      </div>}
    </section>
  );
}
