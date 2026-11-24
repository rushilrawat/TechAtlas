// Detection-status legend shown during Repo X-Ray mode (spec SS11). Compact by default
// (short status words + rings); expands to full definitions via a help popover. Domain
// colors still mean domains (a separate channel). Lines: a white curve is an existing atlas
// relationship between two detections (never repo co-occurrence); faint ones lead to related,
// undetected nodes (see graph/scanOverlay.ts). Status is conveyed by TEXT, not color
// alone (a11y). This is informational, not a filter control.

import { useState } from "react";

const ITEMS: { status: string; short: string; label: string; cls: string }[] = [
  // Same words as the results panel (one vocabulary for the four statuses).
  { status: "confirmed", short: "In code", label: "Found in code", cls: "status-confirmed" },
  { status: "declared", short: "Dependency", label: "Listed as a dependency", cls: "status-declared" },
  { status: "inferred", short: "Guessed", label: "Guessed from related files", cls: "status-inferred" },
  { status: "related", short: "Related", label: "Related to the stack (not detected)", cls: "status-related" },
];

export function XrayLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`xray-legend${open ? " is-open" : ""}`}
      aria-label="Detection status legend"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="xray-legend-title">Key</span>
      {ITEMS.map((it) => (
        <span key={it.status} className="xray-legend-item" title={it.label}>
          <span className={`xray-ring ${it.cls}`} aria-hidden />
          <span className="xray-legend-word">{open ? it.label : it.short}</span>
        </span>
      ))}
      <span className="xray-legend-sep" aria-hidden />
      <span className="xray-legend-item" title="A white line is an atlas relationship between two things the scan detected. It does not mean they call each other in the code.">
        <span className="xray-line" aria-hidden />
        <span className="xray-legend-word">{open ? "Atlas relationship between two detections" : "Link"}</span>
      </span>
      {open && <span className="xray-legend-item" title="A faint line leads from a detection to a related node the scan did not find.">
        <span className="xray-line is-faint" aria-hidden />
        <span className="xray-legend-word">Link to a related, undetected node</span>
      </span>}
      <button
        type="button"
        className="xray-legend-help"
        aria-expanded={open}
        aria-label={open ? "Hide detection status definitions" : "Show detection status definitions"}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
    </div>
  );
}
