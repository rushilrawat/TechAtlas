import { StackIndex, recommendStack, recommendationMarkdown } from "./recommend";
import { realGraph } from "../test/realGraph";

const index = new StackIndex(realGraph());
const slots = (r: ReturnType<typeof recommendStack>) => Object.fromEntries(r.picks.map((p) => [p.slot.id, p.node.slug]));

describe("mention detection", () => {
  it("finds technologies by name, slug and nickname", () => {
    const found = index.mentions("A SaaS on Next.js with Postgres, Tailwind and k8s").map((n) => n.slug);
    expect(found).toEqual(["nextjs", "postgresql", "tailwind-css", "kubernetes"]);
  });
  it("prefers the longer name and ignores ambiguous lowercase words", () => {
    expect(index.mentions("a react native app").map((n) => n.slug)).toEqual(["react-native"]);
    expect(index.mentions("we want to go fast and ship next week").map((n) => n.slug)).toEqual([]);
    expect(index.mentions("an API in Go").map((n) => n.slug)).toEqual(["go"]);
  });
});

describe("recommendStack", () => {
  it("builds a full web-app stack around what was mentioned, with graph reasons", () => {
    const rec = recommendStack(index, { description: "A SaaS dashboard on Next.js with user accounts and Stripe billing" });
    expect(rec.archetype.id).toBe("web-app");
    const s = slots(rec);
    expect(s.language).toBe("typescript");
    expect(s.meta).toBe("nextjs");
    expect(s.ui).toBe("react"); // Next.js is built on React
    expect(s.payments).toBe("stripe");
    expect(s.hosting).toBe("vercel"); // Vercel is commonly used with Next.js
    const ui = rec.picks.find((p) => p.slot.id === "ui")!;
    expect(ui.reasons.some((r) => r.kind === "edge" && /Next\.js is built on React/.test(r.text))).toBe(true);
    // Every edge reason cites a real edge id.
    const ids = new Set(realGraph().edges.map((e) => e.id));
    for (const p of rec.picks) for (const r of p.reasons) if (r.kind === "edge") expect(ids.has(r.edgeId!)).toBe(true);
  });

  it("keeps the stack in one language", () => {
    const rec = recommendStack(index, { description: "REST API for an inventory system in Python" });
    expect(rec.archetype.id).toBe("api");
    const s = slots(rec);
    expect(s.language).toBe("python");
    expect(["fastapi", "django", "flask"]).toContain(s.backend);
    expect(s["unit-tests"]).toBe("pytest");
    expect(["ruff", "mypy"]).toContain(s.lint);
  });

  it("derives the language from the framework when none is given", () => {
    const rec = recommendStack(index, { description: "A mobile app built with Flutter" });
    expect(rec.archetype.id).toBe("mobile");
    expect(slots(rec).language).toBe("dart");
  });

  it("builds a RAG app stack", () => {
    const rec = recommendStack(index, { description: "A chatbot that answers questions over our docs with RAG" });
    expect(rec.archetype.id).toBe("llm-app");
    const s = slots(rec);
    expect(s.language).toBe("python");
    expect(s["llm-framework"]).toBeTruthy();
    expect(s["vector-db"]).toBeTruthy();
  });

  it("treats a scanned repo as the current stack and suggests what to add", () => {
    const current = ["technology:django", "technology:python", "technology:postgresql"];
    const rec = recommendStack(index, { current });
    expect(rec.archetype.id).toBe("api");
    const byId = new Map(rec.picks.map((p) => [p.node.id, p]));
    expect(byId.get("technology:django")?.source).toBe("current");
    expect(rec.picks.some((p) => p.source === "recommended" && p.slot.id === "unit-tests" && p.node.slug === "pytest")).toBe(true);
  });

  it("honours an override and reuses one node for two slots", () => {
    const rec = recommendStack(index, { description: "web app with login", overrides: { database: "supabase" } });
    const s = slots(rec);
    expect(s.database).toBe("supabase");
    expect(s.auth).toBe("supabase");
  });

  it("is deterministic and lists concepts the stack relies on", () => {
    const a = recommendStack(index, { description: "An e-commerce site with React and PostgreSQL" });
    const b = recommendStack(index, { description: "An e-commerce site with React and PostgreSQL" });
    expect(slots(a)).toEqual(slots(b));
    expect(a.concepts.length).toBeGreaterThan(0);
    expect(a.edgeIds.length).toBeGreaterThan(0);
    expect(recommendationMarkdown(a)).toMatch(/Suggested stack · Web app/);
  });
});
