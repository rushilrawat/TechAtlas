import type { DomainSummary } from "../api/types";

interface Props {
  domains: DomainSummary[];
  onPick: (slugOrId: string) => void;
  // UI-C: collapsed state is controlled by the parent so it can auto-minimize during
  // Repo X-Ray (freeing canvas space) while staying reopenable.
  collapsed: boolean;
  onToggle: () => void;
}

/** Legend of domain communities. Doubles as a keyboard-accessible jump list.
 *  Collapsible so it does not compete with the Repo X-Ray panel for canvas space. */
export function DomainLegend({ domains, onPick, collapsed, onToggle }: Props) {
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
  return (
    <section className="legend" aria-label="Domain legend">
      <div className="legend-head">
        <h3>Domains</h3>
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
        {domains.map((d) => (
          <li key={d.id}>
            <button className="legend-item" onClick={() => onPick(d.slug)}>
              <span
                className="legend-dot"
                style={{ background: d.color }}
                aria-hidden
              />
              <span className="legend-name">{d.name}</span>
              <span className="legend-count">{d.node_count}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="legend-note">
        Node shape and the detail panel label indicate type; colour groups by domain.
      </p>
    </section>
  );
}
