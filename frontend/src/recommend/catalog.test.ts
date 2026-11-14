import { ARCHETYPES, DEFAULT_LANGUAGE, SLOTS, SLOTS_BY_ID, SYNONYMS, USED_FROM } from "./catalog";
import { realGraph } from "../test/realGraph";

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
  it("synonyms point at real technologies", () => {
    const bad = Object.entries(SYNONYMS).filter(([, slug]) => !tech.has(slug));
    expect(bad).toEqual([]);
  });
});
