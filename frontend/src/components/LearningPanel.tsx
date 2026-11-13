import { useMemo } from "react";
import type { GraphResponse } from "../api/types";
import { suggestNext, useLearningMap, type LearningStatus } from "../graph/learning";

const SECTIONS: [LearningStatus, string][] = [["learning", "Learning"], ["goal", "Goals"], ["known", "Known"]];

interface Props {
  graph: GraphResponse;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** "My learning map": what the viewer marked, plus what to learn next. Stored locally. */
export function LearningPanel({ graph, onPick, onClose }: Props) {
  const [map, setStatus] = useLearningMap();
  const labels = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);
  const suggestions = useMemo(() => suggestNext(map, graph), [map, graph]);
  const marked = Object.keys(map).length;

  return (
    <section className="compare-panel learning-panel" aria-label="My learning map">
      <button type="button" className="outline-close" onClick={onClose} aria-label="Close learning map">×</button>
      <h2>My learning map</h2>
      {marked === 0 ? (
        <p>Open any technology or concept and mark it as <strong>Known</strong>, <strong>Learning</strong> or a <strong>Goal</strong>. Suggestions for what to learn next appear here. Saved only in this browser.</p>
      ) : (
        <>
          {suggestions.length > 0 && <>
            <h3>Learn next</h3>
            <ul>{suggestions.map((s) => (
              <li key={s.id}><button type="button" onClick={() => onPick(s.id)}>
                {labels.get(s.id) ?? s.id}
                <span className="learning-why">via {s.via.slice(0, 2).map((v) => labels.get(v) ?? v).join(", ")}</span>
              </button></li>
            ))}</ul>
          </>}
          {SECTIONS.map(([status, title]) => {
            const ids = Object.entries(map).filter(([, s]) => s === status).map(([id]) => id).filter((id) => labels.has(id));
            if (!ids.length) return null;
            return (
              <div key={status}>
                <h3>{title} · {ids.length}</h3>
                <ul>{ids.map((id) => (
                  <li key={id} className="learning-row">
                    <button type="button" onClick={() => onPick(id)}>{labels.get(id)}</button>
                    <button type="button" className="learning-remove" aria-label={`Remove ${labels.get(id)} from my map`}
                      onClick={() => setStatus(id, null)}>×</button>
                  </li>
                ))}</ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
