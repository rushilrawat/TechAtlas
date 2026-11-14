import { describe, expect, it } from "vitest";
import type { DomainSummary, GraphNode } from "../api/types";
import { buildReport, decodeCard, encodeCard, headline, readCardParam, writeCardParam } from "./reportCard";

const node = (id: string, type: "technology" | "concept", domain: string, size = 1): GraphNode => ({
  id, slug: id.split(":")[1], label: id.split(":")[1], node_type: type, node_subtype: null, primary_domain: domain,
  x: 0, y: 0, cluster: null, size, color: "#fff",
});
const nodes = [node("technology:react", "technology", "domain:frontend", 5), node("technology:vite", "technology", "domain:frontend"),
  node("concept:caching", "concept", "domain:backend"), node("technology:redis", "technology", "domain:db-sub")];
const nodesById = new Map(nodes.map((n) => [n.id, n]));
const dom = (id: string, parent: string | null = null): DomainSummary => ({ id, slug: id, name: id.split(":")[1], short_description: "", color: "#000", node_count: 1, parent_id: parent });
const domainsById = new Map([dom("domain:frontend"), dom("domain:backend"), dom("domain:db-sub", "domain:backend")].map((d) => [d.id, d]));

describe("report card", () => {
  it("groups by top-level field and writes the headline", () => {
    const r = buildReport("vercel/next.js", [...nodes.map((n) => n.id), "technology:missing"], nodesById, domainsById);
    expect(r.technologies).toBe(3);
    expect(r.concepts).toBe(1);
    expect(r.fields.map((f) => [f.id, f.nodes.length])).toEqual([["domain:backend", 2], ["domain:frontend", 2]]);
    expect(r.fields[0].nodes[0].id).toBe("technology:redis");
    expect(headline(r)).toBe("next.js uses 3 technologies across 2 fields");
  });
  it("round-trips the share param and rejects junk", () => {
    const v = encodeCard("a-b/c.d", ["react", "Bad Slug", "vite"]);
    expect(v).toBe("a-b/c.d~react.vite");
    expect(readCardParam(`?${writeCardParam("?x=1", v)}`)).toEqual({ repo: "a-b/c.d", slugs: ["react", "vite"] });
    expect(decodeCard("no-tilde")).toBeNull();
    expect(decodeCard("../../etc~react")).toBeNull();
    expect(decodeCard("a/b~")).toBeNull();
  });
});
