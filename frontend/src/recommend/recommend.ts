// Stack recommender (Phase 2). Pure and deterministic: the same input and dataset always
// give the same stack, so it runs on the static site with no backend. Every reason it
// gives is a real edge in the atlas (or a plainly labelled fallback such as "you mentioned
// it" or "most used option"), so a recommendation can always be traced back to the graph.
import type { GraphEdge, GraphNode, GraphResponse } from "../api/types";
import {
  ARCHETYPES, ARCHETYPES_BY_ID, DEFAULT_LANGUAGE, SLOT_TRIGGERS, SLOTS_BY_ID, SYNONYMS, USED_FROM,
  type Archetype, type Slot,
} from "./catalog";

export interface RecommendInput {
  description?: string;
  /** Archetype id; inferred from the description and current stack when absent. */
  archetype?: string | null;
  /** Language slug the user wants (e.g. "python"); inferred when absent. */
  language?: string | null;
  /** Node ids already in the project (e.g. from a Repo X-Ray scan). */
  current?: string[];
  /** Slot id -> slug the user chose instead of the recommendation. */
  overrides?: Record<string, string>;
}

export type ReasonKind = "edge" | "mentioned" | "current" | "chosen" | "language" | "popular" | "reuse";
export interface Reason { kind: ReasonKind; text: string; edgeId?: string; weight: number }

export type PickSource = "mentioned" | "current" | "chosen" | "recommended";
export interface Pick {
  slot: Slot;
  node: GraphNode;
  source: PickSource;
  reasons: Reason[];
  alternatives: GraphNode[];
  optional: boolean;
}

export interface Recommendation {
  archetype: Archetype;
  archetypeReason: string;
  language: GraphNode | null;
  languageReason: string;
  picks: Pick[];
  /** Concepts adjacent to two or more picks: what this stack asks you to understand. */
  concepts: { node: GraphNode; via: GraphNode[] }[];
  /** Mentioned technologies that no slot of this archetype covers (kept, not dropped). */
  extras: GraphNode[];
  /** Edges among the picked technologies, for drawing the stack on the atlas. */
  edgeIds: string[];
}

export const EDGE_WEIGHT: Record<string, number> = {
  commonly_used_with: 3, integrates_with: 3, built_on: 2.5, part_of_ecosystem: 2.5, depends_on: 2,
  written_in: 1.5, supports: 1.5, used_for: 1, implements: 1, enables: 1, related_to: 0.6,
};

const VERB: Record<string, string> = {
  commonly_used_with: "is commonly used with", integrates_with: "integrates with", built_on: "is built on",
  part_of_ecosystem: "is part of the ecosystem of", depends_on: "depends on", written_in: "is written in",
  supports: "supports", used_for: "is used for", implements: "implements", enables: "enables",
  related_to: "is related to", alternative_to: "is an alternative to",
};

/** Words too ambiguous to count as a mention unless written with a capital (Go, Next, Swift...). */
const CAPITALIZED_ONLY = new Set(["go", "next", "node", "swift", "dart", "express", "spring", "flask", "make", "rust", "ruby",
  "deno", "bun", "julia", "elixir", "astro", "remix", "hono", "gin", "redux", "metal", "matter", "thread", "consul", "vault",
  "packer", "helm", "keras", "ray", "spark", "flink", "chroma", "unity", "godot", "bevy", "electron", "expo", "qt", "jest",
  "cargo", "maven", "gradle", "git", "es", "pg", "rn", "tf", "lambda"]);
/** Names that collide with ordinary words even when capitalised at the start of a sentence. */
const NEVER = new Set(["c", "r", "d", "html", "css", "json", "yaml", "arm", "linux"]);

export function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ")} `;
}

function hasPhrase(norm: string, raw: string, phrase: string, capitalOnly = false): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9+#])${esc}(?=$|[^a-z0-9+#])`, capitalOnly ? "" : "i");
  if (!capitalOnly) return re.test(norm);
  // Capitalised form in the original text only ("Go", "Next.js").
  const cap = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return new RegExp(`(^|[^A-Za-z0-9+#])${cap.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z0-9+#])`).test(raw);
}

export class StackIndex {
  readonly bySlug = new Map<string, GraphNode>();
  readonly byId = new Map<string, GraphNode>();
  readonly adj = new Map<string, GraphEdge[]>();
  private readonly mentionKeys: [string, string, boolean][] = [];

  constructor(readonly graph: GraphResponse) {
    for (const n of graph.nodes) { this.bySlug.set(n.slug, n); this.byId.set(n.id, n); }
    for (const e of graph.edges) {
      if (e.relationship_type === "belongs_to_domain" || e.relationship_type === "has_subdomain") continue;
      for (const id of [e.source, e.target]) {
        const list = this.adj.get(id);
        if (list) list.push(e); else this.adj.set(id, [e]);
      }
    }
    const keys = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.node_type !== "technology") continue;
      for (const k of [n.label.toLowerCase(), n.slug, n.slug.replace(/-/g, " ")]) if (!keys.has(k)) keys.set(k, n.slug);
    }
    for (const [k, slug] of Object.entries(SYNONYMS)) if (this.bySlug.has(slug)) keys.set(k, slug);
    for (const [k, slug] of keys) {
      if (NEVER.has(k) || k.length < 2) continue;
      this.mentionKeys.push([k, slug, CAPITALIZED_ONLY.has(k)]);
    }
    // Longest first so "react native" wins over "react".
    this.mentionKeys.sort((a, b) => b[0].length - a[0].length);
  }

  node(slug: string): GraphNode | undefined { return this.bySlug.get(slug); }

  /** Technologies named in free text, in the order they first appear. */
  mentions(text: string): GraphNode[] {
    if (!text.trim()) return [];
    let norm = normalize(text), raw = ` ${text} `;
    const found: { slug: string; at: number }[] = [];
    for (const [key, slug, capOnly] of this.mentionKeys) {
      if (!hasPhrase(norm, raw, key, capOnly)) continue;
      const at = norm.indexOf(key);
      if (!found.some((f) => f.slug === slug)) found.push({ slug, at });
      // Blank the matched phrase so "react native" does not also count as "react".
      const blank = " ".repeat(key.length);
      norm = norm.split(key).join(blank);
      raw = raw.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), blank);
    }
    return found.sort((a, b) => a.at - b.at).map((f) => this.bySlug.get(f.slug)!).filter(Boolean);
  }

  /** Edges between two nodes (either direction), strongest first. */
  between(a: string, b: string): GraphEdge[] {
    return (this.adj.get(a) ?? []).filter((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))
      .sort((x, y) => (EDGE_WEIGHT[y.relationship_type] ?? 0) - (EDGE_WEIGHT[x.relationship_type] ?? 0));
  }

  describe(e: GraphEdge): string {
    const s = this.byId.get(e.source)?.label ?? e.source, t = this.byId.get(e.target)?.label ?? e.target;
    return `${s} ${VERB[e.relationship_type] ?? e.relationship_type.replaceAll("_", " ")} ${t}`;
  }
}

/** Tie-break votes by the catalog's language order (TypeScript before JavaScript). */
const LANG_ORDER = SLOTS_BY_ID.get("language")!.candidates;
const byVote = (x: [string, number], y: [string, number]) =>
  y[1] - x[1] || (LANG_ORDER.indexOf(x[0]) + 99) % 99 - (LANG_ORDER.indexOf(y[0]) + 99) % 99 || x[0].localeCompare(y[0]);

const sameFamily = (a: string, b: string) =>
  a === b || ((a === "typescript" || a === "javascript") && (b === "typescript" || b === "javascript"));

function fitsLanguage(slug: string, lang: string | null): boolean | null {
  const from = USED_FROM[slug];
  if (!from || !lang) return null;
  return from.some((l) => sameFamily(l, lang));
}

function inferArchetype(input: RecommendInput, mentioned: GraphNode[], current: GraphNode[]): { a: Archetype; why: string } {
  if (input.archetype && ARCHETYPES_BY_ID.has(input.archetype)) {
    return { a: ARCHETYPES_BY_ID.get(input.archetype)!, why: "You chose this project type." };
  }
  const norm = normalize(input.description ?? ""), raw = input.description ?? "";
  let best: { a: Archetype; score: number; hits: string[] } | null = null;
  for (const a of ARCHETYPES) {
    const hits = a.keywords.filter((k) => hasPhrase(norm, raw, k));
    let score = hits.length * 2;
    const slugs = new Set(a.slots.flatMap((s) => SLOTS_BY_ID.get(s.slot)?.candidates ?? []));
    // Defining slots (the first non-language slot) count more: Flutter says "mobile".
    const lead = a.slots.find((s) => s.slot !== "language");
    const leadSet = new Set(SLOTS_BY_ID.get(lead?.slot ?? "")?.candidates ?? []);
    for (const n of [...mentioned, ...current]) {
      if (leadSet.has(n.slug)) score += 3;
      else if (slugs.has(n.slug)) score += 0.5;
    }
    if (!best || score > best.score) best = { a, score, hits };
  }
  if (!best || best.score === 0) return { a: ARCHETYPES_BY_ID.get("web-app")!, why: "Nothing pointed elsewhere, so this assumes a web app. Pick another type to change it." };
  const named = [...mentioned, ...current].filter((n) => best!.a.slots.some((s) => SLOTS_BY_ID.get(s.slot)?.candidates.includes(n.slug)));
  const why = best.hits.length
    ? `Your description mentions ${best.hits.slice(0, 3).map((h) => `“${h}”`).join(", ")}.`
    : `Inferred from ${named.slice(0, 3).map((n) => n.label).join(", ")}.`;
  return { a: best.a, why };
}

export function recommendStack(index: StackIndex, input: RecommendInput): Recommendation {
  const description = input.description ?? "";
  const mentioned = index.mentions(description);
  const current = (input.current ?? []).map((id) => index.byId.get(id)).filter((n): n is GraphNode => !!n && n.node_type === "technology");
  const { a: archetype, why: archetypeReason } = inferArchetype(input, mentioned, current);
  const norm = normalize(description);
  const known = new Map<string, PickSource>();
  for (const n of current) known.set(n.slug, "current");
  for (const n of mentioned) if (!known.has(n.slug)) known.set(n.slug, "mentioned");
  for (const slug of Object.values(input.overrides ?? {})) known.set(slug, "chosen");

  // Language: explicit choice > a mentioned/current language > votes from what is used > default.
  const langSlots = new Set(SLOTS_BY_ID.get("language")!.candidates);
  let language: GraphNode | null = null, languageReason = "";
  const explicitLang = input.overrides?.language ?? input.language ?? null;
  if (explicitLang && index.node(explicitLang)) { language = index.node(explicitLang)!; languageReason = "You chose it."; }
  if (!language) {
    const named = [...mentioned, ...current].filter((n) => langSlots.has(n.slug));
    const ts = named.find((n) => n.slug === "typescript");
    const pick = ts ?? named[0];
    if (pick) { language = pick; languageReason = known.get(pick.slug) === "current" ? "Already used in the repository." : "You mentioned it."; }
  }
  if (!language) {
    const votes = new Map<string, number>();
    for (const n of [...mentioned, ...current]) for (const l of USED_FROM[n.slug] ?? []) votes.set(l, (votes.get(l) ?? 0) + (USED_FROM[n.slug].length === 1 ? 2 : 1));
    const top = [...votes].sort(byVote)[0];
    if (top && index.node(top[0])) {
      language = index.node(top[0])!;
      const users = [...mentioned, ...current].filter((n) => USED_FROM[n.slug]?.some((l) => sameFamily(l, top[0])));
      languageReason = `${users.slice(0, 2).map((n) => n.label).join(" and ")} ${users.length > 1 ? "are" : "is"} used from ${language.label}.`;
    }
  }
  const langDecidedLater = !language && archetype.slots[0]?.slot !== "language";
  if (!language && !langDecidedLater) {
    const d = DEFAULT_LANGUAGE[archetype.id];
    if (d && index.node(d)) { language = index.node(d)!; languageReason = `The usual choice for a ${archetype.label.toLowerCase()}.`; }
  }

  const picks: Pick[] = [];
  const pickedIds = new Set<string>();
  const anchorIds = () => [...new Set([...pickedIds, ...current.map((n) => n.id), ...mentioned.map((n) => n.id)])];

  for (const { slot: slotId, optional = false } of archetype.slots) {
    const slot = SLOTS_BY_ID.get(slotId);
    if (!slot) continue;
    if (slotId === "language") {
      if (!language) {
        // Decide from what has been picked so far (e.g. Flutter -> Dart).
        const votes = new Map<string, number>();
        for (const p of picks) for (const l of USED_FROM[p.node.slug] ?? []) votes.set(l, (votes.get(l) ?? 0) + 1 / (USED_FROM[p.node.slug].length));
        const top = [...votes].sort(byVote)[0]?.[0] ?? DEFAULT_LANGUAGE[archetype.id];
        language = index.node(top) ?? null;
        const by = picks.find((p) => USED_FROM[p.node.slug]?.includes(top));
        languageReason = by ? `${by.node.label} is used from ${language?.label}.` : `The usual choice for a ${archetype.label.toLowerCase()}.`;
      }
      if (language) {
        picks.push({ slot, node: language, source: (known.get(language.slug) as PickSource) ?? (explicitLang ? "chosen" : "recommended"),
          reasons: [{ kind: "language", text: languageReason, weight: 5 }],
          alternatives: slot.candidates.filter((s) => s !== language!.slug).slice(0, 4).map((s) => index.node(s)).filter((n): n is GraphNode => !!n),
          optional: false });
        pickedIds.add(language.id);
      }
      continue;
    }
    const lang = language?.slug ?? null;
    const candidates = slot.candidates.map((s) => index.node(s)).filter((n): n is GraphNode => !!n);
    if (!candidates.length) continue;

    // 1) Something the user already uses, named or chose for this slot wins outright.
    const override = input.overrides?.[slotId];
    const given = (override ? candidates.find((c) => c.slug === override) : undefined)
      ?? candidates.find((c) => known.get(c.slug) === "current")
      ?? candidates.find((c) => known.get(c.slug) === "mentioned");
    // 2) A node already picked for another slot that also covers this one (Supabase: DB + auth).
    const reused = !given ? candidates.find((c) => pickedIds.has(c.id)) : undefined;

    // Editorial prior from catalog order (1.5 for the usual default, down to 0).
    const scored = candidates.map((c, rank) => {
      const reasons: Reason[] = [];
      let score = candidates.length > 1 ? 1.5 * (1 - rank / (candidates.length - 1)) : 1.5;
      for (const other of anchorIds()) {
        if (other === c.id) continue;
        const e = index.between(c.id, other).find((x) => x.relationship_type !== "alternative_to");
        if (!e) continue;
        // Ties to what the user named count fully; ties to another recommendation count
        // half, so one suggestion does not snowball the rest of the stack.
        const fromUser = known.has(index.byId.get(other)?.slug ?? "") || other === language?.id;
        const w = (EDGE_WEIGHT[e.relationship_type] ?? 0) * (fromUser ? 1 : 0.5);
        score += w;
        reasons.push({ kind: "edge", text: index.describe(e), edgeId: e.id, weight: w });
      }
      const fit = fitsLanguage(c.slug, lang);
      // Fitting the language is table stakes, not a selling point: language-neutral
      // candidates (databases, APIs) must not lose to a weaker option just for fitting.
      if (fit === true) { score += 0.5; reasons.push({ kind: "language", text: `Used from ${language!.label}.`, weight: 1 }); }
      if (fit === false) score -= 6;
      reasons.sort((x, y) => y.weight - x.weight);
      return { c, score, reasons, fit };
    }).sort((x, y) => y.score - x.score || x.c.slug.localeCompare(y.c.slug));

    let chosen: (typeof scored)[number] | undefined;
    let source: PickSource = "recommended";
    if (given) {
      chosen = scored.find((s) => s.c.id === given.id);
      source = override === given.slug ? "chosen" : (known.get(given.slug) as PickSource);
    } else if (reused) {
      chosen = scored.find((s) => s.c.id === reused.id);
    } else {
      const viable = scored.filter((s) => s.fit !== false);
      if (!viable.length) continue; // nothing in the atlas fits this language for this slot
      // Optional slots only appear when the description asks for them or the graph insists.
      const triggered = (SLOT_TRIGGERS[slotId] ?? []).some((t) => hasPhrase(norm, description, t));
      // ...or when it is strongly tied to something the user named (not to another
      // recommendation, which would let one suggestion cascade into a heavy stack).
      const userIds = new Set([...mentioned, ...current].map((n) => n.id));
      const strongEdge = (index.adj.get(viable[0].c.id) ?? []).some((e) => (EDGE_WEIGHT[e.relationship_type] ?? 0) >= 2.5
        && userIds.has(e.source === viable[0].c.id ? e.target : e.source));
      if (optional && !triggered && !strongEdge) continue;
      chosen = viable[0];
    }
    if (!chosen) continue;
    const reasons: Reason[] = [];
    if (source === "current") reasons.push({ kind: "current", text: "Already in the repository.", weight: 10 });
    if (source === "mentioned") reasons.push({ kind: "mentioned", text: "You mentioned it.", weight: 10 });
    if (source === "chosen") reasons.push({ kind: "chosen", text: "You picked it.", weight: 10 });
    if (reused && !given) reasons.push({ kind: "reuse", text: `${chosen.c.label} already covers this.`, weight: 9 });
    reasons.push(...chosen.reasons.slice(0, 3));
    if (!reasons.some((r) => r.kind === "edge") && !given && !reused) {
      const top = candidates.find((c) => fitsLanguage(c.slug, lang) !== false);
      if (top?.id === chosen.c.id) reasons.push({ kind: "popular", text: "A common default choice.", weight: 0.5 });
    }
    // Alternatives: the next viable candidates plus explicit alternative_to neighbours.
    const alt = new Map<string, GraphNode>();
    for (const e of index.adj.get(chosen.c.id) ?? []) {
      if (e.relationship_type !== "alternative_to") continue;
      const other = index.byId.get(e.source === chosen.c.id ? e.target : e.source);
      if (other && slot.candidates.includes(other.slug) && fitsLanguage(other.slug, lang) !== false) alt.set(other.id, other);
    }
    for (const s of scored) {
      if (alt.size >= 4) break;
      if (s.c.id !== chosen.c.id && s.fit !== false) alt.set(s.c.id, s.c);
    }
    picks.push({ slot, node: chosen.c, source, reasons, alternatives: [...alt.values()].slice(0, 4), optional });
    pickedIds.add(chosen.c.id);
  }

  // Concepts that two or more picks connect to.
  const via = new Map<string, Set<string>>();
  for (const p of picks) {
    for (const e of index.adj.get(p.node.id) ?? []) {
      const other = e.source === p.node.id ? e.target : e.source;
      const n = index.byId.get(other);
      if (!n || n.node_type !== "concept") continue;
      const set = via.get(other) ?? new Set<string>();
      set.add(p.node.id);
      via.set(other, set);
    }
  }
  const concepts = [...via].filter(([, s]) => s.size >= 2)
    .sort((x, y) => y[1].size - x[1].size || x[0].localeCompare(y[0])).slice(0, 8)
    .map(([id, s]) => ({ node: index.byId.get(id)!, via: [...s].map((v) => index.byId.get(v)!) }));

  const extras = mentioned.filter((n) => !pickedIds.has(n.id));
  const all = new Set([...pickedIds, ...extras.map((n) => n.id)]);
  const edgeIds = index.graph.edges.filter((e) => e.relationship_type !== "belongs_to_domain" && all.has(e.source) && all.has(e.target)).map((e) => e.id);

  return { archetype, archetypeReason, language, languageReason, picks, concepts, extras, edgeIds };
}

/** Plain-text stack for copying into a README, issue or chat. */
export function recommendationMarkdown(rec: Recommendation, link?: string): string {
  const lines = [`## Suggested stack · ${rec.archetype.label}`, ""];
  for (const p of rec.picks) {
    const why = p.reasons.find((r) => r.kind === "edge")?.text ?? p.reasons[0]?.text ?? "";
    lines.push(`- **${p.slot.label}:** ${p.node.label}${why ? ` (${why})` : ""}`);
  }
  if (rec.concepts.length) lines.push("", `Concepts to know: ${rec.concepts.map((c) => c.node.label).join(", ")}.`);
  if (link) lines.push("", `Explore it on TechAtlas: ${link}`);
  return lines.join("\n");
}
