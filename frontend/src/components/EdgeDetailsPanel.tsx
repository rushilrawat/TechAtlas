import { useEffect, useRef } from "react";
import type { GraphEdge, GraphNode } from "../api/types";
import { relationshipPhrase } from "../graph/relationships";

interface Props {
  edge: GraphEdge;
  source: GraphNode;
  target: GraphNode;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function EdgeDetailsPanel({ edge, source, target, onClose, onNavigate }: Props) {
  const phrase = relationshipPhrase(edge.relationship_type, "out");
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);
  return (
    <aside ref={panelRef} className="details edge-details" role="region" aria-label="Relationship details" tabIndex={-1}>
      <button className="details-close" onClick={onClose} aria-label="Close relationship details">×</button>
      <h2>Relationship</h2>
      <p className="edge-statement">
        <button onClick={() => onNavigate(source.id)}>{source.label}</button>
        <span>{phrase}</span>
        <button onClick={() => onNavigate(target.id)}>{target.label}</button>
      </p>
      <dl className="edge-facts">
        <div><dt>Canonical type</dt><dd>{edge.relationship_type.replaceAll("_", " ")}</dd></div>
        <div><dt>Relationship ID</dt><dd>{edge.id}</dd></div>
      </dl>
      <p className="muted">Select either name to explore its other connections.</p>
    </aside>
  );
}
