// Role / career lens: "what does a backend engineer need to know?" Roles live in
// data/seed/roles.json as ordered stages of node slugs, so they can be edited without
// touching React code. roles.test.ts checks every slug exists in data/graph.json.
import data from "../../../data/seed/roles.json";
import type { LearningMap, LearningStatus } from "./learning";

export interface RoleStage { title: string; caption: string; nodes: string[] }
export interface Role { id: string; title: string; summary: string; stages: RoleStage[] }

export const ROLES: Role[] = data;
export const ROLES_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

interface MinimalGraph {
  nodes: { id: string; slug: string; label: string }[];
  edges: { id: string; source: string; target: string }[];
}

export interface ResolvedStage extends RoleStage { ids: string[] }
export interface ResolvedRole { role: Role; stages: ResolvedStage[]; nodeIds: string[]; edgeIds: string[] }

/** Map a role's slugs onto graph ids, and collect the edges that connect its nodes. */
export function resolveRole(role: Role, graph: MinimalGraph): ResolvedRole {
  const bySlug = new Map(graph.nodes.map((n) => [n.slug, n.id]));
  const stages = role.stages.map((s) => ({
    ...s, ids: s.nodes.map((slug) => bySlug.get(slug)).filter((id): id is string => !!id),
  }));
  const nodeIds = [...new Set(stages.flatMap((s) => s.ids))];
  const set = new Set(nodeIds);
  const edgeIds = graph.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => e.id);
  return { role, stages, nodeIds, edgeIds };
}

export interface RoleProgress { known: number; learning: number; goal: number; total: number }

export function roleProgress(ids: string[], map: LearningMap): RoleProgress {
  const count = (s: LearningStatus) => ids.filter((id) => map[id] === s).length;
  return { known: count("known"), learning: count("learning"), goal: count("goal"), total: ids.length };
}

/** The first node, in path order, that the viewer doesn't know yet. */
export function nextUp(role: ResolvedRole, map: LearningMap): string | null {
  for (const s of role.stages) for (const id of s.ids) if (map[id] !== "known") return id;
  return null;
}

/** Cycle a node's status from a role checklist: none → learning → known → none. Goals advance to learning. */
export function cycleStatus(current: LearningStatus | undefined): LearningStatus | null {
  if (!current || current === "goal") return "learning";
  if (current === "learning") return "known";
  return null;
}

const ROLE = /^[a-z0-9-]+$/;
export function readRole(search: string): string | null {
  const v = new URLSearchParams(search).get("role");
  return v && ROLE.test(v) && ROLES_BY_ID.has(v) ? v : null;
}
export function writeRole(search: string, id: string | null): string {
  const p = new URLSearchParams(search);
  p.delete("role");
  if (id) p.set("role", id);
  return p.toString();
}
