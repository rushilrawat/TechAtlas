import { Fragment } from "react";
import type { DomainSummary } from "../api/types";

interface Props {
  domains: DomainSummary[];
  onPick: (slugOrId: string) => void;
  // Currently selected node id (so a selected domain row reads as active and the legend
  // visually links to the highlighted sector on the canvas — redesign §18/§19).
  selectedId?: string | null;
  // UI-C: collapsed state is controlled by the parent so it can auto-minimize during
  // Repo X-Ray (freeing canvas space) while staying reopenable.
  collapsed: boolean;
  onToggle: () => void;
}

/** Curated atlas legend / domain navigator. Lists the 14 TOP-LEVEL domains, with the three
 *  canonical subdomains nested under their parent (hierarchy honest). Doubles as a
 *  keyboard-accessible jump list; a selected row links to the highlighted sector. */
export function DomainLegend({ domains, onPick, selectedId, collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <button
        type="button"
        className="legend-reopen"
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Show domain legend"
      >
        <span className="legend-reopen-dots" aria-hidden>
          {domains.slice(0, 6).map((d) => (
            <span key={d.id} style={{ background: d.color }} />
          ))}
        </span>
        Domains
      </button>
    );
  }

  const topLevel = domains.filter((d) => !d.parent_id);
  const childrenOf = (id: string) => domains.filter((d) => d.parent_id === id);

  const row = (d: DomainSummary, nested: boolean) => (
    <li key={d.id} className={nested ? "legend-sub" : undefined}>
      <button
        className={`legend-item${selectedId === d.id ? " is-selected" : ""}`}
        onClick={() => onPick(d.slug)}
        aria-pressed={selectedId === d.id}
      >
        <span className="legend-dot" style={{ background: d.color }} aria-hidden />
        <span className="legend-name">{d.name}</span>
        <span className="legend-count">{d.node_count}</span>
      </button>
    </li>
  );

  return (
    <section className="legend" aria-label="Domain navigator">
      <div className="legend-head">
        <div className="legend-title">
          <h3>Domains</h3>
          <span className="legend-subtitle">{topLevel.length} top-level areas</span>
        </div>
        <button
          type="button"
          className="legend-collapse"
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Hide domain legend"
          title="Hide"
        >
          &times;
        </button>
      </div>
      <ul>
        {topLevel.map((d) => (
          <Fragment key={d.id}>
            {row(d, false)}
            {childrenOf(d.id).map((c) => row(c, true))}
          </Fragment>
        ))}
      </ul>
      <p className="legend-note">Colour groups by domain; click a domain to focus its members.</p>
    </section>
  );
}
