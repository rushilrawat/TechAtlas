import type { FilterState } from "./filters";
import { emptyFilter } from "./filters";
import type { NodeType } from "../api/types";

const TYPES = new Set<NodeType>(["domain", "concept", "technology"]);

export function readFilter(search: string): FilterState {
  const params = new URLSearchParams(search);
  const filter = emptyFilter();
  for (const value of params.getAll("type")) if (TYPES.has(value as NodeType)) filter.nodeTypes.add(value as NodeType);
  for (const value of params.getAll("domain")) if (/^domain:[a-z0-9-]+$/.test(value)) filter.domains.add(value);
  for (const value of params.getAll("subtype")) if (/^[a-z0-9-]+$/.test(value)) filter.subtypes.add(value);
  return filter;
}

export function writeFilter(search: string, filter: FilterState): string {
  const params = new URLSearchParams(search);
  for (const key of ["type", "domain", "subtype"]) params.delete(key);
  for (const value of [...filter.nodeTypes].sort()) params.append("type", value);
  for (const value of [...filter.domains].sort()) params.append("domain", value);
  for (const value of [...filter.subtypes].sort()) params.append("subtype", value);
  return params.toString();
}


export interface SharedCamera { x: number; y: number; ratio: number }
export function readCamera(search: string): SharedCamera | null {
  const params = new URLSearchParams(search);
  const x = Number(params.get("cx")), y = Number(params.get("cy")), ratio = Number(params.get("zoom"));
  if (!params.has("cx") || !params.has("cy") || !params.has("zoom")) return null;
  return [x, y, ratio].every(Number.isFinite) && ratio > 0 && ratio < 100 ? { x, y, ratio } : null;
}
export function writeCamera(search: string, camera: SharedCamera): string {
  const params = new URLSearchParams(search);
  params.set("cx", camera.x.toFixed(4)); params.set("cy", camera.y.toFixed(4));
  params.set("zoom", camera.ratio.toFixed(4));
  return params.toString();
}


/** Guided path + step and the compare pair, so a shared link restores exactly that view.
 *  Paths are addressed by a slug of their title, so reordering journeys.json keeps links. */
export interface SharedView { path: number | null; step: number; compare: [string, string | null] | null }
const NODE_ID = /^(technology|concept|domain):[a-z0-9-]+$/;
export function pathSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function readView(search: string, titles: string[]): SharedView {
  const params = new URLSearchParams(search);
  const wanted = params.get("path");
  const index = wanted ? titles.findIndex((t) => pathSlug(t) === wanted) : -1;
  const path = index >= 0 ? index : null;
  const st = Number(params.get("step"));
  const step = path !== null && Number.isInteger(st) && st >= 0 ? st : 0;
  const pair = params.getAll("compare").filter((id) => NODE_ID.test(id)).slice(0, 2);
  return { path, step, compare: pair.length ? [pair[0], pair[1] ?? null] : null };
}
export function writeView(search: string, view: SharedView, titles: string[]): string {
  const params = new URLSearchParams(search);
  for (const key of ["path", "step", "compare"]) params.delete(key);
  if (view.path !== null && titles[view.path]) {
    params.set("path", pathSlug(titles[view.path]));
    if (view.step > 0) params.set("step", String(view.step));
  }
  if (view.compare) for (const id of view.compare) if (id) params.append("compare", id);
  return params.toString();
}
