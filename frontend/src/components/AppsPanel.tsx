import { useEffect, useMemo, useState } from "react";
import type { GraphResponse } from "../api/types";
import { appById, apps, filterApps, resolveApp } from "../graph/apps";
import { safeHttpUrl } from "../util/safeUrl";
import { arrowNav, arrowNavGrid } from "../util/arrowNav";
import { AppLogo } from "./AppLogo";
import { StepNav, neighbours, useStepKeys } from "./StepNav";

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
  const [category, setCategory] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const app = appId ? appById(appId) : null;
  const resolved = useMemo(() => app ? resolveApp(app, graph) : null, [app, graph]);
  // Biggest categories first, so the chips that narrow the list most are in view.
  const categories = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of apps()) n.set(a.category, (n.get(a.category) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, []);
  const shown = useMemo(() => filterApps(apps(), query).filter((a) => !category || a.category === category), [query, category]);

  // ← / → (and [ / ]) step through the apps in list order.
  const all = apps();
  const around = app ? neighbours(all.findIndex((a) => a.id === app.id), all.length) : null;
  const prevApp = around ? all[around[0]] : null;
  const nextApp = around ? all[around[1]] : null;
  const goPrev = useMemo(() => prevApp ? () => onAppChange(prevApp.id) : null, [prevApp, onAppChange]);
  const goNext = useMemo(() => nextApp ? () => onAppChange(nextApp.id) : null, [nextApp, onAppChange]);
  useStepKeys(!!app, goPrev, goNext);

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
      {app && <button type="button" className="panel-crumb" onClick={() => onAppChange(null)}><span aria-hidden>← </span>All apps</button>}
      {app ? (
        <header className="apps-head">
          <AppLogo id={app.id} name={app.name} size={40} />
          <div>
            <h2>{app.name}</h2>
            <p className="apps-head-meta">
              <span className="apps-cat">{app.category}</span>
              {safeHttpUrl(app.url) && <a href={safeHttpUrl(app.url) as string} target="_blank" rel="noreferrer">{app.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗</a>}
            </p>
          </div>
        </header>
      ) : <h2>What are famous apps built with?</h2>}
      {!app && <>
        <p className="stack-note">Pick an app to light up its stack on the atlas. Each one is taken from the company's own engineering blog.</p>
        <label className="apps-search"><span className="sr-only">Filter apps</span>
          <input type="search" value={query} placeholder="Filter by app, category or technology"
            onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="apps-cats">
          <div className="chip-row is-wrapping" role="group" aria-label="Filter by category" data-arrow-nav onKeyDown={arrowNav}>
            <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>All <span>{apps().length}</span></button>
            {categories.map(([c, n]) => (
              <button key={c} type="button" className="chip" aria-pressed={category === c}
                onClick={() => setCategory(category === c ? null : c)}>{c} <span>{n}</span></button>
            ))}
          </div>
        </div>
        <ul className="apps-grid" data-arrow-nav onKeyDown={arrowNavGrid}>{shown.map((a) => (
          <li key={a.id}><button type="button" onClick={() => onAppChange(a.id)} aria-label={`${a.name}, ${a.category}, ${a.stack.length} technologies`}>
            <AppLogo id={a.id} name={a.name} />
            <span className="apps-card-text">
              <strong>{a.name}</strong>
              <span>{a.category}</span>
            </span>
            <span className="apps-card-n" title={`${a.stack.length} technologies on the atlas`}>{a.stack.length} tech</span>
          </button></li>
        ))}</ul>
        {shown.length === 0 && <p className="stack-note">No app matches “{query}”{category ? ` in ${category}` : ""}.</p>}
        <p className="apps-hint muted">Tip: use the arrow keys to move between apps.</p>
      </>}
      {app && resolved && <>
        <StepNav label="Step through apps"
          position={`${all.findIndex((a) => a.id === app.id) + 1} / ${all.length}`}
          prev={prevApp && goPrev ? { label: prevApp.name, onGo: goPrev, icon: <AppLogo id={prevApp.id} name={prevApp.name} size={16} /> } : null}
          next={nextApp && goNext ? { label: nextApp.name, onGo: goNext, icon: <AppLogo id={nextApp.id} name={nextApp.name} size={16} /> } : null} />
        <p className="stack-note">{app.summary}</p>
        {resolved.layers.map((layer) => (
          <div key={layer.id} className="apps-layer">
            <h3>{layer.label}</h3>
            <ul data-arrow-nav onKeyDown={arrowNav}>{layer.items.map((item) => (
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
        </div>
      </>}
    </section>
  );
}
