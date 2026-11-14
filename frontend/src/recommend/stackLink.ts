// URL state for the stack recommender, so a copied link reopens the same stack.
// ?stack=1&sd=<description>&st=<archetype>&sl=<language>&so=<slot:slug,...>&sn=<current slugs>&sr=<owner/repo>
export interface StackParams {
  open: boolean;
  description: string;
  archetype: string | null;
  language: string | null;
  overrides: Record<string, string>;
  /** Slugs of technologies already in the project (from a repo scan). */
  current: string[];
  /** owner/name of the scanned repository the current stack came from. */
  repo: string | null;
}

const SLUG = /^[a-z0-9-]+$/;
const KEYS = ["stack", "sd", "st", "sl", "so", "sn", "sr"];
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function readStack(search: string): StackParams {
  const p = new URLSearchParams(search);
  const overrides: Record<string, string> = {};
  for (const pair of (p.get("so") ?? "").split(",")) {
    const [slot, slug] = pair.split(":");
    if (slot && slug && SLUG.test(slot) && SLUG.test(slug)) overrides[slot] = slug;
  }
  const one = (k: string) => { const v = p.get(k); return v && SLUG.test(v) ? v : null; };
  return {
    open: p.get("stack") === "1",
    description: (p.get("sd") ?? "").slice(0, 500),
    archetype: one("st"),
    language: one("sl"),
    overrides,
    current: (p.get("sn") ?? "").split(",").filter((s) => SLUG.test(s)).slice(0, 80),
    repo: REPO.test(p.get("sr") ?? "") ? p.get("sr") : null,
  };
}

export function writeStack(search: string, s: StackParams | null): string {
  const p = new URLSearchParams(search);
  for (const k of KEYS) p.delete(k);
  if (s?.open) {
    p.set("stack", "1");
    if (s.description.trim()) p.set("sd", s.description.trim().slice(0, 500));
    if (s.archetype) p.set("st", s.archetype);
    if (s.language) p.set("sl", s.language);
    const o = Object.entries(s.overrides).map(([k, v]) => `${k}:${v}`).join(",");
    if (o) p.set("so", o);
    if (s.current.length) p.set("sn", s.current.join(","));
    if (s.repo) p.set("sr", s.repo);
  }
  return p.toString();
}
