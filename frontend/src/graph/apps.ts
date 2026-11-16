// Famous apps and the stacks behind them. The curated list lives in data/seed/apps.json:
// each app maps to technology slugs in the atlas with a short note, cites an engineering
// blog, and names any notable piece the atlas does not have yet (`not_in_atlas`) instead
// of inventing nodes. apps.test.ts and backend/tests/test_famous_apps.py check every slug.
import data from "../../../data/seed/apps.json";

export type AppLayer = "web" | "mobile" | "backend" | "data" | "ml" | "infra";
export interface AppStackItem { tech: string; layer: AppLayer; note: string }
export interface AppSource { title: string; url: string }
export interface FamousApp {
  id: string; name: string; category: string; url: string; summary: string;
  stack: AppStackItem[]; not_in_atlas: string[]; sources: AppSource[];
}

export const APPS: FamousApp[] = data as FamousApp[];
export const APPS_BY_ID = new Map(APPS.map((a) => [a.id, a]));

export const LAYERS: { id: AppLayer; label: string }[] = [
  { id: "web", label: "Web and desktop" },
  { id: "mobile", label: "Mobile" },
  { id: "backend", label: "Backend" },
  { id: "data", label: "Data" },
  { id: "ml", label: "Machine learning" },
  { id: "infra", label: "Infrastructure" },
];

interface MinimalGraph {
  nodes: { id: string; slug: string; label: string }[];
  edges: { id: string; source: string; target: string }[];
}

export interface ResolvedItem extends AppStackItem { id: string; label: string }
export interface ResolvedApp {
  app: FamousApp;
  layers: { id: AppLayer; label: string; items: ResolvedItem[] }[];
  nodeIds: string[];
  edgeIds: string[];
}

/** Map an app's slugs onto graph ids, grouped by layer, plus the edges between its nodes. */
export function resolveApp(app: FamousApp, graph: MinimalGraph): ResolvedApp {
  const bySlug = new Map(graph.nodes.map((n) => [n.slug, n]));
  const items: ResolvedItem[] = app.stack.flatMap((s) => {
    const n = bySlug.get(s.tech);
    return n ? [{ ...s, id: n.id, label: n.label }] : [];
  });
  const layers = LAYERS.map((l) => ({ ...l, items: items.filter((i) => i.layer === l.id) })).filter((l) => l.items.length);
  const nodeIds = [...new Set(items.map((i) => i.id))];
  const set = new Set(nodeIds);
  const edgeIds = graph.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => e.id);
  return { app, layers, nodeIds, edgeIds };
}

/** Apps whose stack includes this technology slug, with the note on how they use it. */
export function appsUsing(slug: string): { app: FamousApp; note: string }[] {
  return APPS.flatMap((app) => {
    const item = app.stack.find((s) => s.tech === slug);
    return item ? [{ app, note: item.note }] : [];
  });
}

/** Case-insensitive match on name, category or any technology slug in the stack. */
export function filterApps(apps: FamousApp[], query: string): FamousApp[] {
  const q = query.trim().toLowerCase();
  if (!q) return apps;
  return apps.filter((a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    || a.stack.some((s) => s.tech.includes(q)));
}

const APP = /^[a-z0-9-]+$/;
export function readApp(search: string): string | null {
  const v = new URLSearchParams(search).get("app");
  return v && APP.test(v) && APPS_BY_ID.has(v) ? v : null;
}
/** Any ?app param opens the panel; an empty or unknown value shows the list. */
export function readAppsOpen(search: string): boolean {
  return new URLSearchParams(search).has("app");
}
export function writeApp(search: string, open: boolean, id: string | null): string {
  const p = new URLSearchParams(search);
  p.delete("app");
  if (open) p.set("app", id ?? "");
  return p.toString();
}
