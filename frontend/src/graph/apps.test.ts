import { describe, expect, it } from "vitest";
import { APPS, LAYERS, appsUsing, filterApps, readApp, readAppsOpen, resolveApp, writeApp } from "./apps";
import { realGraph } from "../test/realGraph";

const graph = realGraph();
const techSlugs = new Set(graph.nodes.filter((n) => n.node_type === "technology").map((n) => n.slug));
const layerIds = new Set(LAYERS.map((l) => l.id));

describe("famous apps data", () => {
  it("every stack entry is a technology in the atlas", () => {
    const missing = APPS.flatMap((a) => a.stack.filter((s) => !techSlugs.has(s.tech)).map((s) => `${a.id}: ${s.tech}`));
    expect(missing).toEqual([]);
  });
  it("ids are unique, layers are known and no technology repeats within an app", () => {
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
    for (const a of APPS) {
      expect(a.stack.length, a.id).toBeGreaterThanOrEqual(3);
      expect(new Set(a.stack.map((s) => s.tech)).size, a.id).toBe(a.stack.length);
      for (const s of a.stack) {
        expect(layerIds.has(s.layer), `${a.id}: ${s.layer}`).toBe(true);
        expect(s.note.trim(), `${a.id}: ${s.tech}`).not.toBe("");
      }
    }
  });
  it("every app cites at least one https source", () => {
    for (const a of APPS) {
      expect(a.sources.length, a.id).toBeGreaterThan(0);
      for (const s of a.sources) expect(s.url, a.id).toMatch(/^https:\/\//);
    }
  });
  it("not_in_atlas never names something the atlas already has", () => {
    const names = new Set(graph.nodes.map((n) => n.label.toLowerCase()));
    const dupes = APPS.flatMap((a) => a.not_in_atlas.filter((n) => names.has(n.toLowerCase())).map((n) => `${a.id}: ${n}`));
    expect(dupes).toEqual([]);
  });
});

describe("app helpers", () => {
  it("resolves an app into layers with ids and connecting edges", () => {
    const res = resolveApp(APPS.find((a) => a.id === "netflix")!, graph);
    expect(res.nodeIds.length).toBe(APPS.find((a) => a.id === "netflix")!.stack.length);
    expect(res.layers.map((l) => l.id)).toEqual(["web", "backend", "data", "infra"]);
    expect(res.edgeIds.length).toBeGreaterThan(0);
  });
  it("finds the apps that use a technology", () => {
    const users = appsUsing("django").map((u) => u.app.id);
    expect(users).toContain("instagram");
    expect(appsUsing("not-a-tech")).toEqual([]);
  });
  it("filters by name, category or technology", () => {
    expect(filterApps(APPS, "spot").map((a) => a.id)).toEqual(["spotify"]);
    expect(filterApps(APPS, "elixir").map((a) => a.id)).toEqual(["discord"]);
    expect(filterApps(APPS, "  ")).toHaveLength(APPS.length);
  });
  it("round-trips through the URL", () => {
    expect(readApp(writeApp("?node=x", true, "discord"))).toBe("discord");
    expect(readAppsOpen(writeApp("", true, null))).toBe(true);
    expect(readApp("?app=nope")).toBeNull();
    expect(readAppsOpen("?a=1")).toBe(false);
    expect(writeApp("?app=discord&a=1", false, "discord")).toBe("a=1");
  });
});
