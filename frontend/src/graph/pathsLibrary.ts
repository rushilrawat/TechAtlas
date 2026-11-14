// Guided-paths library: pure helpers behind the browsable Paths panel.
//
// A path's "field" is the domain of its first step (or the step itself when it is a
// domain), the same grouping the old <select> used. Progress lives in localStorage:
// finished paths by title (existing key, kept for compatibility) and the furthest step
// reached per path slug, so the library can show "in progress".

import type { DomainSummary, GraphNode } from "../api/types";
import type { Journey } from "./journeys";
import { pathSlug } from "./shareView";

export interface PathEntry {
  index: number;
  title: string;
  slug: string;
  stepCount: number;
  fieldId: string;
  fieldName: string;
  color: string;
  /** Step labels in order, for the preview line and search. */
  labels: string[];
  /** Lower-cased title + step labels + field name. */
  haystack: string;
}

export type LengthFilter = "all" | "quick" | "deep";
export type StatusFilter = "all" | "new" | "started" | "done";
export interface PathFilter { query: string; field: string; length: LengthFilter; status: StatusFilter }
export const EMPTY_PATH_FILTER: PathFilter = { query: "", field: "", length: "all", status: "all" };

/** Paths a newcomer should see first. Missing titles are skipped. */
export const FEATURED_PATH_TITLES = ["How a web request works", "Ship a modern web app", "LLM apps with retrieval"];

/** Paths of up to this many steps count as "quick". */
export const QUICK_MAX_STEPS = 4;

export function buildPathEntries(
  journeys: Journey[],
  nodesById: Map<string, GraphNode>,
  domainsById: Map<string, DomainSummary>,
): PathEntry[] {
  return journeys.map((j, index) => {
    const first = nodesById.get(j.steps[0]?.id ?? "");
    const fieldId = first?.node_type === "domain" ? first.id : first?.primary_domain ?? "";
    const domain = domainsById.get(fieldId);
    const labels = j.steps.map((s) => nodesById.get(s.id)?.label ?? s.id);
    const fieldName = domain?.name ?? "Other";
    return {
      index, title: j.title, slug: pathSlug(j.title), stepCount: j.steps.length,
      fieldId, fieldName, color: domain?.color ?? "#8a93ab", labels,
      haystack: `${j.title} ${labels.join(" ")} ${fieldName}`.toLowerCase(),
    };
  });
}

export type PathStatus = "new" | "started" | "done";
export function pathStatus(entry: PathEntry, done: Set<string>, progress: Record<string, number>): PathStatus {
  if (done.has(entry.title)) return "done";
  return (progress[entry.slug] ?? 0) > 0 ? "started" : "new";
}

export function filterPaths(
  entries: PathEntry[], filter: PathFilter, done: Set<string>, progress: Record<string, number>,
): PathEntry[] {
  const words = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (filter.field && e.fieldId !== filter.field) return false;
    if (filter.length === "quick" && e.stepCount > QUICK_MAX_STEPS) return false;
    if (filter.length === "deep" && e.stepCount <= QUICK_MAX_STEPS) return false;
    if (filter.status !== "all" && pathStatus(e, done, progress) !== filter.status) return false;
    return words.every((w) => e.haystack.includes(w));
  });
}

/** Fields that have paths, with counts, sorted by name. */
export function pathFields(entries: PathEntry[]): { id: string; name: string; color: string; count: number }[] {
  const m = new Map<string, { id: string; name: string; color: string; count: number }>();
  for (const e of entries) {
    const f = m.get(e.fieldId) ?? { id: e.fieldId, name: e.fieldName, color: e.color, count: 0 };
    f.count++;
    m.set(e.fieldId, f);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function featuredPaths(entries: PathEntry[]): PathEntry[] {
  return FEATURED_PATH_TITLES.map((t) => entries.find((e) => e.title === t)).filter((e): e is PathEntry => !!e);
}

/**
 * What to offer after finishing a path: an unfinished path that starts where this one
 * ended, else one in the same field, else any unfinished path. Null when all are done.
 */
export function suggestNextPath(
  entries: PathEntry[], journeys: Journey[], current: number, done: Set<string>,
): PathEntry | null {
  const open = entries.filter((e) => e.index !== current && !done.has(e.title));
  const lastId = journeys[current]?.steps.at(-1)?.id;
  const cur = entries[current];
  return open.find((e) => journeys[e.index].steps[0]?.id === lastId)
    ?? open.find((e) => journeys[e.index].steps.some((s) => s.id === lastId))
    ?? open.find((e) => e.fieldId === cur?.fieldId)
    ?? open[0] ?? null;
}

// ---- persistence --------------------------------------------------------------------

export const DONE_PATHS_KEY = "techatlas-paths-done";
export const PATH_PROGRESS_KEY = "techatlas-paths-progress";

export function readDonePaths(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(DONE_PATHS_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
export function writeDonePaths(done: Set<string>): void {
  try { window.localStorage.setItem(DONE_PATHS_KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ }
}
export function readPathProgress(): Record<string, number> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PATH_PROGRESS_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, number> : {};
  } catch { return {}; }
}
export function writePathProgress(progress: Record<string, number>): void {
  try { window.localStorage.setItem(PATH_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
}
