import { useEffect, useMemo, useState } from "react";
import type { GraphResponse } from "../api/types";
import { useLearningMap, type LearningStatus } from "../graph/learning";
import { ROLES, ROLES_BY_ID, cycleStatus, nextUp, resolveRole, roleProgress } from "../graph/roles";

const STATUS_LABEL: Record<LearningStatus, string> = { known: "Known", learning: "Learning", goal: "Goal" };

interface Props {
  graph: GraphResponse;
  roleId: string | null;
  onRoleChange: (id: string | null) => void;
  onPick: (id: string) => void;
  onHighlight: (nodeIds: string[], edgeIds: string[]) => void;
  onClose: () => void;
}

/**
 * Role / career lens: pick a role, see what it needs on the atlas as an ordered path,
 * and track progress through the learning map (stored only in this browser).
 */
export function RolePanel({ graph, roleId, onRoleChange, onPick, onHighlight, onClose }: Props) {
  const [map, setStatus] = useLearningMap();
  const [copied, setCopied] = useState(false);
  const role = roleId ? ROLES_BY_ID.get(roleId) ?? null : null;
  const resolved = useMemo(() => role ? resolveRole(role, graph) : null, [role, graph]);
  const labels = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);

  useEffect(() => {
    if (!resolved) { onHighlight([], []); return; }
    onHighlight(resolved.nodeIds, resolved.edgeIds);
  }, [resolved, onHighlight]);
  useEffect(() => () => onHighlight([], []), [onHighlight]);

  const progress = resolved ? roleProgress(resolved.nodeIds, map) : null;
  const next = resolved ? nextUp(resolved, map) : null;
  const unmarked = resolved ? resolved.nodeIds.filter((id) => !map[id]) : [];
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };

  return (
    <section className="stack-panel role-panel" aria-label="Role paths">
      <button type="button" className="outline-close" onClick={onClose} aria-label="Close role paths">×</button>
      <h2>{role ? "Role path" : "What does a role need?"}</h2>
      {!role && <>
        <p className="stack-note">Pick a role to see what it needs, lit up on the atlas and ordered into a path. Mark what you know as you go; progress is saved only in this browser.</p>
        <ul className="role-list">{ROLES.map((r) => {
          const ids = resolveRole(r, graph).nodeIds;
          const p = roleProgress(ids, map);
          return <li key={r.id}><button type="button" onClick={() => onRoleChange(r.id)}>
            <strong>{r.title}</strong>
            <span>{r.summary}</span>
            {p.known + p.learning > 0 && <span className="role-mini">{p.known} of {p.total} known</span>}
          </button></li>;
        })}</ul>
      </>}
      {role && resolved && progress && <>
        <label className="role-switch"><span className="sr-only">Role</span>
          <select value={role.id} onChange={(e) => onRoleChange(e.target.value)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
        <p className="stack-note">{role.summary}</p>
        <div className="role-progress" aria-label={`${progress.known} of ${progress.total} known, ${progress.learning} learning`}>
          <div className="role-bar"><span className="is-known" style={{ width: `${(progress.known / progress.total) * 100}%` }} />
            <span className="is-learning" style={{ width: `${(progress.learning / progress.total) * 100}%` }} /></div>
          <span>{progress.known} of {progress.total} known{progress.learning ? ` · ${progress.learning} learning` : ""}</span>
        </div>
        {next && <button type="button" className="stack-go role-next" onClick={() => onPick(next)}>
          {progress.known === 0 && progress.learning === 0 ? "Start with" : "Next up:"} {labels.get(next)}</button>}
        {!next && <p className="stack-note"><strong>You know everything on this path.</strong> Open the learning map for what to learn next.</p>}
        <ol className="role-stages">
          {resolved.stages.map((stage, si) => {
            const done = stage.ids.filter((id) => map[id] === "known").length;
            return (
              <li key={stage.title} className="role-stage">
                <h3><span>{si + 1}. {stage.title}</span><span className="role-count">{done}/{stage.ids.length}</span></h3>
                <p className="muted">{stage.caption}</p>
                <ul>{stage.ids.map((id) => {
                  const status = map[id];
                  const nextStatus = cycleStatus(status);
                  return (
                    <li key={id} className={`role-node${status ? ` is-${status}` : ""}`}>
                      <button type="button" className="role-check" aria-label={`${labels.get(id)}: ${status ? STATUS_LABEL[status] : "not started"}. Mark as ${nextStatus ? STATUS_LABEL[nextStatus].toLowerCase() : "not started"}`}
                        title={nextStatus ? `Mark as ${STATUS_LABEL[nextStatus].toLowerCase()}` : "Clear"}
                        onClick={() => setStatus(id, nextStatus)}>{status === "known" ? "✓" : status === "learning" ? "◐" : ""}</button>
                      <button type="button" className="role-label" onClick={() => onPick(id)}>{labels.get(id)}</button>
                      {status && status !== "known" && <span className="role-status">{STATUS_LABEL[status]}</span>}
                    </li>
                  );
                })}</ul>
              </li>
            );
          })}
        </ol>
        <div className="compare-actions stack-actions">
          <button type="button" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          {unmarked.length > 0 && <button type="button" title="Add every unmarked node to your learning map as a goal"
            onClick={() => unmarked.forEach((id) => setStatus(id, "goal"))}>Add {unmarked.length} as goals</button>}
          <button type="button" onClick={() => onRoleChange(null)}>All roles</button>
        </div>
      </>}
    </section>
  );
}
