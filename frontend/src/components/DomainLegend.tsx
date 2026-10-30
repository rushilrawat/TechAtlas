import type { DomainSummary } from "../api/types";

interface Props {
  domains: DomainSummary[];
  onPick: (slugOrId: string) => void;
}

/** Legend of domain communities. Doubles as a keyboard-accessible jump list. */
export function DomainLegend({ domains, onPick }: Props) {
  return (
    <section className="legend" aria-label="Domain legend">
      <h3>Domains</h3>
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
