import { useEffect, useMemo, useRef, useState } from "react";
import type { DomainSummary, GraphNode } from "../api/types";
import { nodeTypeLabel } from "../graph/relationships";

interface Props {
  nodes: GraphNode[];
  domains: DomainSummary[];
  onPick: (id: string) => void;
  onClose?: () => void;
  /** Shown when the atlas cannot render (no WebGL); then there is nothing to close to. */
  fallback?: boolean;
}

/**
 * The whole atlas as an accessible outline: every domain is a heading with its members
 * as buttons. Serves screen-reader and keyboard users, low-end phones, and browsers
 * without WebGL. Picking a node opens the same detail panel as the canvas.
 */
export function OutlineView({ nodes, domains, onPick, onClose, fallback = false }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!onClose) return;
    // Capture phase: the search input and other panels' handlers must not swallow Escape.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byDomain = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      if (n.node_type === "domain") continue;
      if (q && !n.label.toLowerCase().includes(q)) continue;
      const list = byDomain.get(n.primary_domain) ?? [];
      list.push(n);
      byDomain.set(n.primary_domain, list);
    }
    return domains
      .map((d) => ({ domain: d, members: (byDomain.get(d.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)) }))
      .filter((g) => g.members.length > 0 || (!q && g.domain));
  }, [nodes, domains, query]);

  const total = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <section className={`outline-view${fallback ? " is-fallback" : ""}`} aria-label="Atlas outline">
      <header className="outline-head">
        <h2>Atlas outline</h2>
        {fallback && <p className="muted">Your browser cannot draw the interactive map, so here is every node as a list.</p>}
        {onClose && <button type="button" className="outline-close" onClick={onClose} aria-label="Close outline">×</button>}
        <input ref={inputRef} type="search" className="outline-filter" placeholder="Filter by name"
          aria-label="Filter the outline by name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="outline-count" aria-live="polite">{total} {total === 1 ? "node" : "nodes"}</p>
      </header>
      <div className="outline-body">
        {groups.map(({ domain, members }) => (
          <details key={domain.id} open={query.trim().length > 0}>
            <summary>
              <span className="outline-dot" style={{ background: domain.color }} aria-hidden />
              <span>{domain.name}</span>
              <span className="outline-n">{members.length}</span>
            </summary>
            <button type="button" className="outline-domain" onClick={() => onPick(domain.id)}>
              Open {domain.name}
            </button>
            <ul>
              {members.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onPick(n.id)}>
                    {n.label} <span className="outline-kind">{nodeTypeLabel(n.node_type, n.node_subtype)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

/** True when the browser can create a WebGL context (Sigma needs one). */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
