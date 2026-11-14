// Optional "explain with Claude" for a recommended stack. Needs the FastAPI backend (the
// same one Repo X-Ray uses) with ANTHROPIC_API_KEY set; the static site never calls it.
// The request carries only the stack and the graph edges behind it, and the backend tells
// Claude to use nothing else, so the explanation stays grounded in the atlas.
import type { Recommendation } from "./recommend";

const RAW = import.meta.env.VITE_SCANNER_API;
const BASE = typeof RAW === "string" ? RAW.trim().replace(/\/$/, "") : "";
export const EXPLAIN_ENABLED = BASE.length > 0;

export interface ExplainRequest {
  description: string;
  project_type: string;
  picks: { slot: string; technology: string; source: string; reasons: string[]; alternatives: string[] }[];
  concepts: string[];
}

export function explainRequest(description: string, rec: Recommendation): ExplainRequest {
  return {
    description: description.slice(0, 500),
    project_type: rec.archetype.label,
    picks: rec.picks.map((p) => ({
      slot: p.slot.label,
      technology: p.node.label,
      source: p.source,
      reasons: p.reasons.map((r) => r.text).slice(0, 4),
      alternatives: p.alternatives.map((a) => a.label),
    })),
    concepts: rec.concepts.map((c) => c.node.label),
  };
}

export async function explainStack(body: ExplainRequest, signal?: AbortSignal): Promise<string> {
  if (!EXPLAIN_ENABLED) throw new Error("No backend is configured.");
  const res = await fetch(`${BASE}/stack-explanations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 503) throw new Error("Explanations are not enabled on this server.");
  if (res.status === 429) throw new Error("Too many requests. Try again in a minute.");
  if (!res.ok) throw new Error(`The explanation failed (${res.status}).`);
  const json = (await res.json()) as { explanation?: string };
  if (!json.explanation) throw new Error("The server returned no explanation.");
  return json.explanation;
}
