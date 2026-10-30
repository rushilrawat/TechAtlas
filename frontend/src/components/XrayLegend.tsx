// Detection-status legend shown during Repo X-Ray mode (spec §4). Explains the ring
// colors; domain colors still mean domains (a separate channel).

const ITEMS: { status: string; label: string; cls: string }[] = [
  { status: "confirmed", label: "Confirmed in source", cls: "status-confirmed" },
  { status: "declared", label: "Declared dependency", cls: "status-declared" },
  { status: "inferred", label: "Inferred concept", cls: "status-inferred" },
  { status: "related", label: "Related (not detected)", cls: "status-related" },
];

export function XrayLegend() {
  return (
    <div className="xray-legend" aria-label="Detection status legend">
      <span className="xray-legend-title">Detection</span>
      {ITEMS.map((it) => (
        <span key={it.status} className="xray-legend-item">
          <span className={`xray-ring ${it.cls}`} aria-hidden />
          {it.label}
        </span>
      ))}
    </div>
  );
}
