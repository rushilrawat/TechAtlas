// Phase 1B filter controls (requirements 1.6–1.10). Keyboard-accessible toggles for
// node type and domain. Emits a new FilterState; the actual hiding happens in
// GraphCanvas via Sigma reducers (no relayout).

import type { DomainSummary, NodeType } from "../api/types";
import { emptyFilter, isEmptyFilter, type FilterState } from "../graph/filters";

interface Props {
  domains: DomainSummary[];
  filter: FilterState;
  onChange: (next: FilterState) => void;
  // UI-E: on mobile the panel is a bottom sheet hidden until the Filters control opens it.
  // Desktop ignores this (CSS keeps the panel visible regardless).
  mobileOpen?: boolean;
}

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: "domain", label: "Domains" },
  { value: "concept", label: "Concepts" },
  { value: "technology", label: "Technologies" },
];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function FilterPanel({ domains, filter, onChange, mobileOpen = false }: Props) {
  const active = !isEmptyFilter(filter);

  return (
    <section
      id="graph-filters"
      className={`filter-panel${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Graph filters"
    >
      <div className="filter-panel-header">
        <h2>Filters</h2>
        <button
          type="button"
          className="filter-clear"
          onClick={() => onChange(emptyFilter())}
          disabled={!active}
        >
          Clear
        </button>
      </div>

      <fieldset className="filter-group">
        <legend>Type</legend>
        {NODE_TYPES.map((nt) => (
          <label key={nt.value} className="filter-check">
            <input
              type="checkbox"
              checked={filter.nodeTypes.has(nt.value)}
              onChange={() =>
                onChange({ ...filter, nodeTypes: toggle(filter.nodeTypes, nt.value) })
              }
            />
            <span>{nt.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Domain</legend>
        {domains.map((d) => (
          <label key={d.id} className="filter-check">
            <input
              type="checkbox"
              checked={filter.domains.has(d.id)}
              onChange={() =>
                onChange({ ...filter, domains: toggle(filter.domains, d.id) })
              }
            />
            <span className="filter-dot" style={{ background: d.color }} aria-hidden />
            <span>{d.name}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
