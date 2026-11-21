// Guided paths, roles and famous apps grow with the atlas, so they load as their own chunk
// (content/data.ts) in parallel with the graph instead of sitting in the entry bundle.
// App's initial load awaits loadContent() next to the graph fetch, so by the time the atlas
// draws, content() returns the real lists; before that it returns empty ones.
import type { Journey } from "../graph/journeys";
import type { Role } from "../graph/roles";
import type { FamousApp } from "../graph/apps";

export interface Content { journeys: Journey[]; roles: Role[]; apps: FamousApp[] }

const EMPTY: Content = { journeys: [], roles: [], apps: [] };
let loaded: Content | null = null;
let pending: Promise<Content> | null = null;

export function loadContent(): Promise<Content> {
  pending ??= import("./data").then((m) => (loaded = { journeys: m.JOURNEYS, roles: m.ROLES, apps: m.APPS }));
  return pending;
}

export function content(): Content {
  return loaded ?? EMPTY;
}

export function contentLoaded(): boolean {
  return loaded !== null;
}
