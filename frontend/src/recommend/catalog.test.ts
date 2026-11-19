import { ARCHETYPES, DEFAULT_LANGUAGE, SLOTS, SLOTS_BY_ID, SYNONYMS, USED_FROM } from "./catalog";
import { realGraph } from "../test/realGraph";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const graph = realGraph();
const tech = new Map(graph.nodes.filter((n) => n.node_type === "technology").map((n) => [n.slug, n]));
const languages = new Set(SLOTS_BY_ID.get("language")!.candidates);

describe("stack catalog", () => {
  it("only names technologies that exist in the dataset", () => {
    const missing = SLOTS.flatMap((s) => s.candidates.filter((c) => !tech.has(c)).map((c) => `${s.id}:${c}`));
    expect(missing).toEqual([]);
  });
  it("every archetype slot is defined", () => {
    for (const a of ARCHETYPES) for (const s of a.slots) expect(SLOTS_BY_ID.has(s.slot), `${a.id}/${s.slot}`).toBe(true);
  });
  it("language tables use language slugs that exist", () => {
    for (const [slug, langs] of Object.entries(USED_FROM)) {
      expect(tech.has(slug), slug).toBe(true);
      for (const l of langs) expect(tech.get(l)?.node_subtype, `${slug} -> ${l}`).toBe("programming_language");
    }
    for (const l of Object.values(DEFAULT_LANGUAGE)) expect(languages.has(l), l).toBe(true);
  });
  it("never recommends a deprecated or historical technology", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const raw = JSON.parse(readFileSync(resolve(root, "data/graph.json"), "utf8")) as {
      nodes: { slug: string; lifecycle_status?: string }[];
    };
    const dead = new Set(raw.nodes.filter((n) => n.lifecycle_status === "deprecated" || n.lifecycle_status === "historical").map((n) => n.slug));
    const bad = SLOTS.flatMap((s) => s.candidates.filter((c) => dead.has(c)).map((c) => `${s.id}:${c}`));
    expect(bad).toEqual([]);
  });
  it("synonyms point at real technologies", () => {
    const bad = Object.entries(SYNONYMS).filter(([, slug]) => !tech.has(slug));
    expect(bad).toEqual([]);
  });
});
