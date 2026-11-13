// "My learning map": the viewer marks nodes as known, learning or a goal. Stored only in
// this browser (localStorage); no accounts. Suggestions rank unmarked technologies and
// concepts by how many of the viewer's known/learning nodes they connect to.
import { useCallback, useEffect, useState } from "react";

export type LearningStatus = "known" | "learning" | "goal";
export type LearningMap = Record<string, LearningStatus>;

const KEY = "techatlas-learning-map";
const EVENT = "techatlas-learning-change";
const STATUSES = new Set<LearningStatus>(["known", "learning", "goal"]);

export function readLearning(): LearningMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const out: LearningMap = {};
    if (parsed && typeof parsed === "object") {
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && STATUSES.has(v as LearningStatus)) out[id] = v as LearningStatus;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLearning(map: LearningMap): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: the map lives for this page view only */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Shared state across components; any change re-renders every subscriber. */
export function useLearningMap(): [LearningMap, (id: string, status: LearningStatus | null) => void] {
  const [map, setMap] = useState<LearningMap>(readLearning);
  useEffect(() => {
    const sync = () => setMap(readLearning());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((id: string, status: LearningStatus | null) => {
    const next = { ...readLearning() };
    if (status) next[id] = status;
    else delete next[id];
    writeLearning(next);
  }, []);
  return [map, set];
}

interface MinimalGraph {
  nodes: { id: string; node_type: string }[];
  edges: { source: string; target: string; relationship_type: string }[];
}

export interface Suggestion { id: string; score: number; via: string[] }

/**
 * Next things to learn: unmarked non-domain nodes adjacent to what the viewer knows or
 * is learning, ranked by how many such neighbours they have. Goals get a bonus, and
 * nodes adjacent to a goal are boosted so the suggestions lead toward it.
 */
export function suggestNext(map: LearningMap, graph: MinimalGraph, limit = 6): Suggestion[] {
  const types = new Map(graph.nodes.map((n) => [n.id, n.node_type]));
  const anchors = new Set(Object.entries(map).filter(([, s]) => s !== "goal").map(([id]) => id));
  const goals = new Set(Object.entries(map).filter(([, s]) => s === "goal").map(([id]) => id));
  const scores = new Map<string, Suggestion>();
  const bump = (id: string, by: number, via: string | null) => {
    if (map[id] === "known" || map[id] === "learning" || types.get(id) === "domain" || !types.has(id)) return;
    const s = scores.get(id) ?? { id, score: 0, via: [] };
    s.score += by;
    if (via && !s.via.includes(via)) s.via.push(via);
    scores.set(id, s);
  };
  for (const e of graph.edges) {
    if (e.relationship_type === "belongs_to_domain" || e.relationship_type === "has_subdomain") continue;
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
      if (anchors.has(a)) bump(b, 1, a);
      if (goals.has(a) && scores.has(b)) bump(b, 0.5, null);
    }
  }
  for (const g of goals) if (scores.has(g)) bump(g, 1, null);
  return [...scores.values()]
    .filter((s) => s.via.length > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
