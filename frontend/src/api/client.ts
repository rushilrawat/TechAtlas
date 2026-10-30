// Thin typed API client. All external data is untrusted; callers handle errors.
//
// Two modes:
//  - LIVE (dev, or any deployment with the FastAPI backend): hits /api/v1/* and lets
//    the server do search + summaries.
//  - STATIC (GitHub Pages / any static host): fetches pre-rendered JSON produced by
//    `scripts/build_static_api.py` under <base>/api/v1/*, and runs search in the browser
//    over a static search index. No backend required.
//
// Mode is chosen at build time via VITE_STATIC_API ("true" => static). import.meta.env.BASE_URL
// is respected so it works under a GitHub Pages sub-path (e.g. /TechAtlas/).

import type {
  DomainSummary,
  GraphResponse,
  NodeDetail,
  SearchResult,
} from "./types";

const STATIC_MODE = import.meta.env.VITE_STATIC_API === "true";
// In live mode the dev server proxies /api -> backend, so a root-relative base is right.
// In static mode, assets live under Vite's BASE_URL (handles the Pages sub-path).
const BASE = STATIC_MODE
  ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}

// ---- client-side search (static mode) --------------------------------------

interface SearchIndexEntry {
  id: string;
  slug: string;
  name: string;
  node_type: SearchResult["node_type"];
  node_subtype: string | null;
  primary_domain: string;
  aliases: string[];
}

let searchIndexPromise: Promise<SearchIndexEntry[]> | null = null;

function loadSearchIndex(signal?: AbortSignal): Promise<SearchIndexEntry[]> {
  if (!searchIndexPromise) {
    searchIndexPromise = getJSON<SearchIndexEntry[]>(
      `${BASE}/search-index.json`,
      signal,
    ).catch((e) => {
      searchIndexPromise = null; // allow retry on failure
      throw e;
    });
  }
  return searchIndexPromise;
}

function rankMatch(
  entry: SearchIndexEntry,
  q: string,
): { rank: number; matched: SearchResult["matched_on"] } | null {
  const name = entry.name.toLowerCase();
  const aliases = entry.aliases.map((a) => a.toLowerCase());
  if (name === q || aliases.includes(q)) return { rank: 0, matched: name === q ? "name" : "alias" };
  if (name.startsWith(q)) return { rank: 1, matched: "name" };
  if (aliases.some((a) => a.startsWith(q))) return { rank: 2, matched: "alias" };
  if (name.includes(q)) return { rank: 3, matched: "substring" };
  if (aliases.some((a) => a.includes(q))) return { rank: 4, matched: "alias" };
  return null;
}

async function staticSearch(
  q: string,
  limit: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const index = await loadSearchIndex(signal);
  const scored: { rank: number; res: SearchResult }[] = [];
  for (const e of index) {
    const m = rankMatch(e, needle);
    if (m) {
      scored.push({
        rank: m.rank,
        res: {
          id: e.id,
          slug: e.slug,
          name: e.name,
          node_type: e.node_type,
          node_subtype: e.node_subtype,
          primary_domain: e.primary_domain,
          matched_on: m.matched,
        },
      });
    }
  }
  scored.sort((a, b) => a.rank - b.rank || a.res.name.localeCompare(b.res.name));
  return scored.slice(0, limit).map((s) => s.res);
}

// ---- public API -------------------------------------------------------------

export const api = {
  graph: (signal?: AbortSignal) =>
    getJSON<GraphResponse>(`${BASE}/graph${STATIC_MODE ? ".json" : ""}`, signal),

  domains: (signal?: AbortSignal) =>
    getJSON<DomainSummary[]>(`${BASE}/domains${STATIC_MODE ? ".json" : ""}`, signal),

  node: (slug: string, signal?: AbortSignal) => {
    if (STATIC_MODE) {
      // Static files are keyed by bare slug, but callers may pass a canonical id
      // ("technology:react"). Ids are always "<type>:<slug>", so derive the slug.
      const bare = slug.includes(":") ? slug.split(":").slice(1).join(":") : slug;
      return getJSON<NodeDetail>(`${BASE}/nodes/${encodeURIComponent(bare)}.json`, signal);
    }
    return getJSON<NodeDetail>(`${BASE}/nodes/${encodeURIComponent(slug)}`, signal);
  },

  search: (q: string, signal?: AbortSignal) => {
    if (STATIC_MODE) return staticSearch(q, 20, signal);
    return getJSON<SearchResult[]>(
      `${BASE}/search?q=${encodeURIComponent(q)}&limit=20`,
      signal,
    );
  },
};
