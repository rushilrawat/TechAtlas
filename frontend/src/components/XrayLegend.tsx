// Detection-status legend shown during Repo X-Ray mode (spec SS11). Compact by default
// (short status words + rings); expands to full definitions via a help popover. Domain
// colors still mean domains (a separate channel). Status is conveyed by TEXT, not color
// alone (a11y). This is informational, not a filter control.

import { useState } from "react";

const ITEMS: { status: string; short: string; label: string; cls: string }[] = [
  { status: "confirmed", short: "Confirmed", label: "Confirmed in source", cls: "status-confirmed" },
  { status: "declared", short: "Declared", label: "Declared dependency", cls: "status-declared" },
  { status: "inferred", short: "Inferred", label: "Inferred concept", cls: "status-inferred" },
  { status: "related", short: "Related", label: "Related (not detected)", cls: "status-related" },
];

export function XrayLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="xray-legend"
      aria-label="Detection status legend"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="xray-legend-title">Detection</span>
      {ITEMS.map((it) => (
        <span key={it.status} className="xray-legend-item" title={it.label}>
          <span className={`xray-ring ${it.cls}`} aria-hidden />
          <span className="xray-legend-word">{open ? it.label : it.short}</span>
        </span>
      ))}
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
