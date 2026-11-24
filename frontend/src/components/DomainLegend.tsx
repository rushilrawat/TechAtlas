import { Fragment } from "react";
import type { DomainSummary, NodeType } from "../api/types";
import { emptyFilter, isEmptyFilter, type FilterState } from "../graph/filters";

interface Props {
  domains: DomainSummary[];
  onPick: (slugOrId: string) => void;
  // Currently selected node id, so a selected field row reads as active.
  selectedId?: string | null;
  // Collapsed state is controlled by the parent so it can minimize during Repo X-Ray.
  collapsed: boolean;
  onToggle: () => void;
  /** Field and type filters live in the same panel (one list of fields, not two). */
  filter?: FilterState;
  onFilterChange?: (next: FilterState) => void;
}

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: "domain", label: "Field hubs" },
  { value: "concept", label: "Concepts" },
  { value: "technology", label: "Technologies" },
];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

/**
 * The Fields panel: every field with its sub-fields indented under it. Clicking a name
 * focuses that field on the atlas; the checkbox narrows the atlas to the checked fields.
 * Replaces the separate Domains list and Filters panel, which listed the same 40 rows twice.
 */
export function DomainLegend({ domains, onPick, selectedId, collapsed, onToggle, filter, onFilterChange }: Props) {
  const filtering = !!filter && !isEmptyFilter(filter);
  if (collapsed) {
    return (
      <button type="button" className="legend-reopen" onClick={onToggle} aria-expanded={false} aria-label="Show fields">
        <span className="legend-reopen-dots" aria-hidden>
          {domains.slice(0, 6).map((d) => <span key={d.id} style={{ background: d.color }} />)}
        </span>
        Fields{filtering ? " · filtered" : ""}
      </button>
    );
  }

  const topLevel = domains.filter((d) => !d.parent_id);
  const childrenOf = (id: string) => domains.filter((d) => d.parent_id === id);
  const subCount = domains.length - topLevel.length;

  const row = (d: DomainSummary, nested: boolean) => (
    <li key={d.id} className={nested ? "legend-sub" : undefined}>
      <div className="legend-row">
        {filter && onFilterChange && (
          <input type="checkbox" className="legend-check" checked={filter.domains.has(d.id)}
            aria-label={`Show only checked fields: ${d.name}`}
            onChange={() => onFilterChange({ ...filter, domains: toggle(filter.domains, d.id) })} />
        )}
        <button type="button" className={`legend-item${selectedId === d.id ? " is-selected" : ""}`}
          onClick={() => onPick(d.slug)} aria-pressed={selectedId === d.id}>
          <span className="legend-dot" style={{ background: d.color }} aria-hidden />
          <span className="legend-name">{d.name}</span>
          <span className="legend-count">{d.node_count.toLocaleString("en-US")}</span>
        </button>
      </div>
    </li>
  );

  return (
    <section className="legend" aria-label="Fields">
      <div className="legend-head">
        <div className="legend-title">
          <h2 className="legend-h">Fields</h2>
          <span className="legend-subtitle">{topLevel.length} {topLevel.length === 1 ? "field" : "fields"} · {subCount} {subCount === 1 ? "sub-field" : "sub-fields"}</span>
        </div>
        {filtering && onFilterChange && (
          <button type="button" className="filter-clear" onClick={() => onFilterChange(emptyFilter())}>Clear filters</button>
        )}
        <button type="button" className="legend-collapse" onClick={onToggle} aria-expanded={true}
          aria-label="Hide fields" title="Hide">&times;</button>
      </div>
      {filter && onFilterChange && (
        <div className="legend-types" role="group" aria-label="Show only these types">
          <span className="legend-types-label">Show only:</span>
          {NODE_TYPES.map((nt) => (
            <label key={nt.value} className="filter-check">
              <input type="checkbox" checked={filter.nodeTypes.has(nt.value)}
                onChange={() => onFilterChange({ ...filter, nodeTypes: toggle(filter.nodeTypes, nt.value) })} />
              <span>{nt.label}</span>
            </label>
          ))}
        </div>
      )}
      <ul>
        {topLevel.map((d) => (
          <Fragment key={d.id}>
            {row(d, false)}
            {childrenOf(d.id).map((c) => row(c, true))}
          </Fragment>
        ))}
      </ul>
      <p className="legend-note">Click a name to focus it. Tick boxes to show only those fields.</p>
    </section>
  );
}
