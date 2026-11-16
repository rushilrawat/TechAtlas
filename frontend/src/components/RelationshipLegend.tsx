import { useState } from "react";

export function RelationshipLegend() {
  const [open, setOpen] = useState(false);
  return (
    <section className="relationship-legend" aria-label="Connection legend">
      <button type="button" className="relationship-legend-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Connections <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="relationship-legend-body">
        <p>Lines stay hidden until you hover or tap a node or a field; then its real, canonical relationships appear. Select a curve or a relationship row for its exact type.</p>
        <div><span className="edge-swatch edge-swatch-local" /> Within a field, in that field's colour</div>
        <div><span className="edge-swatch edge-swatch-cross" /> Between two different fields</div>
        <p className="relationship-legend-keys">Keyboard: arrows move along connections · Shift + arrows pan · + / − zoom · 0 resets · F fullscreen · Esc clears</p>
      </div>}
    </section>
  );
}
