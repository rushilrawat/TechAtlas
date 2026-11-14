import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXAMPLE_SCANS, exampleForRepo, findExample, readExampleParam, writeExampleParam } from "./exampleScans";

describe("example scans", () => {
  it("ships at least five examples, each with its scan file", () => {
    expect(EXAMPLE_SCANS.length).toBeGreaterThanOrEqual(5);
    for (const e of EXAMPLE_SCANS) {
      const file = resolve(__dirname, "../../public/example-scans", `${e.slug}.json`);
      expect(existsSync(file), e.slug).toBe(true);
      const scan = JSON.parse(readFileSync(file, "utf-8"));
      expect(`${scan.repository.owner}/${scan.repository.name}`).toBe(e.repo);
      expect(scan.summary.matched_technology_count).toBe(e.technologies);
      expect(scan.detections.length).toBeGreaterThan(0);
    }
  });

  it("finds examples by slug and by repository", () => {
    const first = EXAMPLE_SCANS[0];
    expect(findExample(first.slug)).toBe(first);
    expect(findExample("nope")).toBeNull();
    const [owner, name] = first.repo.split("/");
    expect(exampleForRepo(owner.toUpperCase(), name)).toBe(first);
  });

  it("round-trips the ?xray= parameter and ignores unknown slugs", () => {
    const slug = EXAMPLE_SCANS[0].slug;
    const q = writeExampleParam("?type=technology", slug);
    expect(readExampleParam(`?${q}`)).toBe(slug);
    expect(new URLSearchParams(q).get("type")).toBe("technology");
    expect(readExampleParam("?xray=not-a-real-example")).toBeNull();
    expect(writeExampleParam(`?${q}`, null)).toBe("type=technology");
  });
});
