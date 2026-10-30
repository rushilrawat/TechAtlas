// Thin typed API client. All external data is untrusted; callers handle errors.

import type {
  DomainSummary,
  GraphResponse,
  NodeDetail,
  SearchResult,
} from "./types";

const BASE = "/api/v1";

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  graph: (signal?: AbortSignal) => get<GraphResponse>("/graph", signal),
  domains: (signal?: AbortSignal) => get<DomainSummary[]>("/domains", signal),
  node: (slug: string, signal?: AbortSignal) =>
    get<NodeDetail>(`/nodes/${encodeURIComponent(slug)}`, signal),
  search: (q: string, signal?: AbortSignal) =>
    get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}&limit=20`, signal),
};
