import { useEffect, useMemo, useState } from "react";
import type { GraphResponse } from "../api/types";
import { useLearningMap, type LearningStatus } from "../graph/learning";
import { roleById, roles, cycleStatus, nextUp, resolveRole, roleProgress } from "../graph/roles";
import { roleEmoji } from "../graph/roleEmoji";
import { arrowNav, arrowNavGrid } from "../util/arrowNav";
import { StepNav, neighbours, useStepKeys } from "./StepNav";

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
  const role = roleId ? roleById(roleId) : null;
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
  // ← / → (and [ / ]) step through the roles in list order.
  const all = roles();
  const around = role ? neighbours(all.findIndex((r) => r.id === role.id), all.length) : null;
  const prevRole = around ? all[around[0]] : null;
  const nextRole = around ? all[around[1]] : null;
  const goPrev = useMemo(() => prevRole ? () => onRoleChange(prevRole.id) : null, [prevRole, onRoleChange]);
  const goNext = useMemo(() => nextRole ? () => onRoleChange(nextRole.id) : null, [nextRole, onRoleChange]);
  useStepKeys(!!role, goPrev, goNext);
  const copy = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  };

  return (
    <section className="stack-panel role-panel" aria-label="Role paths">
      <button type="button" className="outline-close" onClick={onClose} aria-label="Close role paths">×</button>
      {role ? (
        <header className="role-head">
          <span className="role-emoji is-big" aria-hidden>{roleEmoji(role.id)}</span>
          <div><p className="role-kicker">Role path</p><h2>{role.title}</h2></div>
        </header>
      ) : <h2>What does a role need?</h2>}
      {!role && <>
        <p className="stack-note">Pick a role to see what it needs, lit up on the atlas and ordered into a path. Mark what you know as you go; progress is saved only in this browser.</p>
        <ul className="role-list" data-arrow-nav onKeyDown={arrowNav}>{roles().map((r) => {
          const ids = resolveRole(r, graph).nodeIds;
          const p = roleProgress(ids, map);
          return <li key={r.id}><button type="button" onClick={() => onRoleChange(r.id)}>
            <span className="role-emoji" aria-hidden>{roleEmoji(r.id)}</span>
            <span className="role-list-text">
              <strong>{r.title}</strong>
              <span>{r.summary}</span>
              {p.known + p.learning > 0 && <span className="role-mini">{p.known} of {p.total} known</span>}
            </span>
          </button></li>;
        })}</ul>
      </>}
      {role && resolved && progress && <>
        <StepNav label="Step through roles"
          position={`${all.findIndex((r) => r.id === role.id) + 1} / ${all.length}`}
          prev={prevRole && goPrev ? { label: prevRole.title, onGo: goPrev, icon: <span aria-hidden>{roleEmoji(prevRole.id)} </span> } : null}
          next={nextRole && goNext ? { label: nextRole.title, onGo: goNext, icon: <span aria-hidden>{roleEmoji(nextRole.id)} </span> } : null} />
        <label className="role-switch"><span className="sr-only">Jump to role</span>
          <select value={role.id} onChange={(e) => onRoleChange(e.target.value)}>
            {roles().map((r) => <option key={r.id} value={r.id}>{roleEmoji(r.id)} {r.title}</option>)}
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
                <ul data-arrow-nav onKeyDown={arrowNavGrid}>{stage.ids.map((id) => {
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
          <button type="button" onClick={() => onRoleChange(null)}><span aria-hidden>← </span>All roles</button>
        </div>
      </>}
    </section>
  );
}
