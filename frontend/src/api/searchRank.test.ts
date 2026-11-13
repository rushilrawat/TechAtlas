import { describe, expect, it } from "vitest";
import { editDistance, rankMatch, typoBudget } from "./searchRank";

const k8s = { name: "Kubernetes", aliases: ["k8s"], short_description: "Container orchestration platform." };
const pg = { name: "PostgreSQL", aliases: ["Postgres"], short_description: "An open-source relational database." };
const ml = { name: "Machine Learning", aliases: ["ML"], short_description: "Learning patterns from data." };

describe("rankMatch", () => {
  it("keeps the existing exact/prefix/substring tiers", () => {
    expect(rankMatch(k8s, "kubernetes")).toEqual({ rank: 0, matched: "name" });
    expect(rankMatch(k8s, "K8S")).toEqual({ rank: 0, matched: "alias" });
    expect(rankMatch(k8s, "kube")).toEqual({ rank: 1, matched: "name" });
    expect(rankMatch(pg, "postg")).toEqual({ rank: 1, matched: "name" });
    expect(rankMatch(ml, "learn")).toEqual({ rank: 3, matched: "substring" });
  });

  it("matches multi-word queries word by word", () => {
    expect(rankMatch(ml, "learning machine")).toEqual({ rank: 5, matched: "words" });
  });

  it("tolerates typos", () => {
    expect(rankMatch(k8s, "kubernets")?.matched).toBe("fuzzy");
    expect(rankMatch(k8s, "kuberntes")?.matched).toBe("fuzzy");
    expect(rankMatch(pg, "postgrse")?.matched).toBe("fuzzy");
    expect(rankMatch(ml, "machne")?.matched).toBe("fuzzy");
  });

  it("does not fuzz short queries", () => {
    expect(rankMatch(k8s, "k9s")).toBeNull();
  });

  it("falls back to the description", () => {
    expect(rankMatch(pg, "relational")).toEqual({ rank: 7, matched: "description" });
    expect(rankMatch(pg, "op")).toBeNull();
  });
});

describe("editDistance", () => {
  it("counts transpositions as one edit", () => {
    expect(editDistance("ab", "ba", 2)).toBe(1);
    expect(editDistance("react", "raect", 2)).toBe(1);
  });
  it("bails out past the budget", () => {
    expect(editDistance("abcdef", "uvwxyz", 1)).toBe(2);
  });
  it("budget grows with length", () => {
    expect([typoBudget(3), typoBudget(4), typoBudget(7)]).toEqual([0, 1, 2]);
  });
});
