import { describe, expect, it } from "vitest";
import type { DomainSummary, GraphNode } from "../api/types";
import type { Journey } from "./journeys";
import { JOURNEYS } from "./journeys";
import {
  EMPTY_PATH_FILTER, FEATURED_PATH_TITLES, buildPathEntries, featuredPaths, filterPaths, pathFields,
  pathStatus, suggestNextPath,
} from "./pathsLibrary";

const node = (id: string, label: string, domain: string, type: GraphNode["node_type"] = "technology"): GraphNode =>
  ({ id, slug: id.split(":")[1], label, node_type: type, node_subtype: null, primary_domain: domain, x: 0, y: 0, cluster: null, size: 1, color: "#fff" });
const nodes = new Map<string, GraphNode>([
  ["domain:web", node("domain:web", "Web", "domain:web", "domain")],
  ["technology:http", node("technology:http", "HTTP", "domain:web")],
  ["technology:dns", node("technology:dns", "DNS", "domain:net")],
  ["technology:tcp", node("technology:tcp", "TCP", "domain:net")],
  ["technology:tls", node("technology:tls", "TLS", "domain:net")],
  ["technology:k8s", node("technology:k8s", "Kubernetes", "domain:cloud")],
]);
const domains = new Map<string, DomainSummary>([
  ["domain:web", { id: "domain:web", slug: "web", name: "Web", short_description: "", color: "#f00", node_count: 1 }],
  ["domain:net", { id: "domain:net", slug: "net", name: "Networking", short_description: "", color: "#0f0", node_count: 3 }],
  ["domain:cloud", { id: "domain:cloud", slug: "cloud", name: "Cloud", short_description: "", color: "#00f", node_count: 1 }],
]);
const s = (id: string) => ({ id, caption: "" });
const journeys: Journey[] = [
  { title: "Web basics", steps: [s("domain:web"), s("technology:http"), s("technology:tcp")] },
  { title: "Down the stack", steps: [s("technology:tcp"), s("technology:dns"), s("technology:tls"), s("technology:http"), s("technology:k8s")] },
  { title: "Secure transport", steps: [s("technology:dns"), s("technology:tls"), s("technology:tcp")] },
  { title: "Clusters", steps: [s("technology:k8s"), s("technology:tcp"), s("technology:dns")] },
];
const entries = buildPathEntries(journeys, nodes, domains);

describe("paths library", () => {
  it("derives field, labels and slug for each path", () => {
    expect(entries[0]).toMatchObject({ slug: "web-basics", fieldId: "domain:web", fieldName: "Web", stepCount: 3, labels: ["Web", "HTTP", "TCP"] });
    expect(entries[1].fieldName).toBe("Networking");
  });

  it("filters by words across titles and steps, field, length and status", () => {
    const none = new Set<string>();
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, query: "kubernetes" }, none, {}).map((e) => e.title)).toEqual(["Down the stack", "Clusters"]);
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, query: "tls stack" }, none, {}).map((e) => e.title)).toEqual(["Down the stack"]);
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, field: "domain:net" }, none, {})).toHaveLength(2);
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, length: "deep" }, none, {}).map((e) => e.title)).toEqual(["Down the stack"]);
    const done = new Set(["Clusters"]);
    const progress = { "secure-transport": 1 };
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, status: "done" }, done, progress).map((e) => e.title)).toEqual(["Clusters"]);
    expect(filterPaths(entries, { ...EMPTY_PATH_FILTER, status: "started" }, done, progress).map((e) => e.title)).toEqual(["Secure transport"]);
    expect(pathStatus(entries[0], done, progress)).toBe("new");
  });

  it("lists fields with counts", () => {
    expect(pathFields(entries)).toEqual([
      { id: "domain:cloud", name: "Cloud", color: "#00f", count: 1 },
      { id: "domain:net", name: "Networking", color: "#0f0", count: 2 },
      { id: "domain:web", name: "Web", color: "#f00", count: 1 },
    ]);
  });

  it("suggests a path that picks up where this one ended, skipping finished ones", () => {
    expect(suggestNextPath(entries, journeys, 0, new Set())?.title).toBe("Down the stack");
    expect(suggestNextPath(entries, journeys, 0, new Set(["Down the stack"]))?.title).toBe("Secure transport");
    expect(suggestNextPath(entries, journeys, 0, new Set(journeys.map((j) => j.title)))).toBeNull();
  });

  it("every featured title exists in the real dataset", () => {
    const real = buildPathEntries(JOURNEYS, new Map(), new Map());
    expect(featuredPaths(real).map((e) => e.title)).toEqual(FEATURED_PATH_TITLES);
  });
});
