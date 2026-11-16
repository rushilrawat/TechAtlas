import { useEffect, useMemo, useState } from "react";
import type { GraphResponse } from "../api/types";
import { APPS, APPS_BY_ID, filterApps, resolveApp } from "../graph/apps";
import { safeHttpUrl } from "../util/safeUrl";

interface Props {
  graph: GraphResponse;
  appId: string | null;
  onAppChange: (id: string | null) => void;
  onPick: (id: string) => void;
  onHighlight: (nodeIds: string[], edgeIds: string[]) => void;
  onClose: () => void;
}

/**
 * Famous apps: pick a well-known product to see its documented stack lit up on the atlas,
 * grouped by layer, with a note per technology and the engineering blog it comes from.
 */
export function AppsPanel({ graph, appId, onAppChange, onPick, onHighlight, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const app = appId ? APPS_BY_ID.get(appId) ?? null : null;
  const resolved = useMemo(() => app ? resolveApp(app, graph) : null, [app, graph]);
  const shown = useMemo(() => filterApps(APPS, query), [query]);

  useEffect(() => {
    if (!resolved) { onHighlight([], []); return; }
    onHighlight(resolved.nodeIds, resolved.edgeIds);
  }, [resolved, onHighlight]);
  useEffect(() => () => onHighlight([], []), [onHighlight]);

  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };

  return (
    <section className="stack-panel apps-panel" aria-label="Famous apps">
      <button type="button" className="outline-close" onClick={onClose} aria-label="Close famous apps">×</button>
      <h2>{app ? app.name : "What are famous apps built with?"}</h2>
      {!app && <>
        <p className="stack-note">Pick an app to light up its stack on the atlas. Each one is taken from the company's own engineering blog.</p>
        <label className="apps-search"><span className="sr-only">Filter apps</span>
          <input type="search" value={query} placeholder="Filter by app, category or technology"
            onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="apps-grid">{shown.map((a) => (
          <li key={a.id}><button type="button" onClick={() => onAppChange(a.id)}>
            <strong>{a.name}</strong>
            <span>{a.category} · {a.stack.length} technologies</span>
          </button></li>
        ))}</ul>
        {shown.length === 0 && <p className="stack-note">No app matches “{query}”.</p>}
      </>}
      {app && resolved && <>
        <label className="role-switch"><span className="sr-only">App</span>
          <select value={app.id} onChange={(e) => onAppChange(e.target.value)}>
            {APPS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <p className="stack-note">{app.summary}</p>
        {resolved.layers.map((layer) => (
          <div key={layer.id} className="apps-layer">
            <h3>{layer.label}</h3>
            <ul>{layer.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="role-label" onClick={() => onPick(item.id)}>{item.label}</button>
                <span className="muted">{item.note}</span>
              </li>
            ))}</ul>
          </div>
        ))}
        {app.not_in_atlas.length > 0 && <p className="apps-missing muted">
          Also uses, not yet on the atlas: {app.not_in_atlas.join(", ")}.</p>}
        <p className="apps-sources muted">Source: {app.sources.map((s, i) => {
          const href = safeHttpUrl(s.url);
          return <span key={s.url}>{i > 0 && ", "}{href ? <a href={href} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>;
        })}. Stacks change; this is what the company has written about publicly.</p>
        <div className="compare-actions stack-actions">
          <button type="button" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          <button type="button" onClick={() => onAppChange(null)}>All apps</button>
        </div>
      </>}
    </section>
  );
}
