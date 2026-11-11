import { useState } from "react";

export function RelationshipLegend() {
  const [open, setOpen] = useState(false);
  return (
    <section className="relationship-legend" aria-label="Connection legend">
      <button type="button" className="relationship-legend-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Connections <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="relationship-legend-body">
        <p>Curves represent relationships in the catalog. Select a curve for its exact type.</p>
        <div><span className="edge-swatch edge-swatch-structure" /> Domain structure</div>
        <div><span className="edge-swatch edge-swatch-local" /> Within an ecosystem</div>
        <div><span className="edge-swatch edge-swatch-cross" /> Across ecosystems</div>
        <p>Zoom in to reveal more connections.</p>
      </div>}
    </section>
  );
}
