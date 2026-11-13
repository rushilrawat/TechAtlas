import { expect, it } from "vitest";
import { readFilter, writeFilter } from "./shareView";

it("round trips valid filters and preserves unrelated parameters", () => {
  const source = "foo=1&type=technology&domain=domain%3Aai-ml&subtype=framework";
  const encoded = writeFilter(source, readFilter(source));
  expect(encoded).toContain("foo=1");
  expect([...readFilter(encoded).nodeTypes]).toEqual(["technology"]);
  expect([...readFilter(encoded).domains]).toEqual(["domain:ai-ml"]);
  expect([...readFilter(encoded).subtypes]).toEqual(["framework"]);
});

import { readCamera, writeCamera } from "./shareView";
it("round trips a finite camera without losing filters", () => {
  const query = writeCamera("type=concept", { x: .5, y: .25, ratio: .4 });
  expect(readCamera(query)).toEqual({ x: .5, y: .25, ratio: .4 });
  expect(new URLSearchParams(query).get("type")).toBe("concept");
  expect(readCamera("cx=NaN&cy=1&zoom=-3")).toBeNull();
});

import { pathSlug, readView, writeView } from "./shareView";
it("round trips a guided path step and a compare pair by slug", () => {
  const titles = ["How a web request works", "Building an AI agent"];
  const q = writeView("type=concept", { path: 1, step: 2, compare: ["technology:react", "technology:vue"] }, titles);
  expect(new URLSearchParams(q).get("path")).toBe(pathSlug(titles[1]));
  expect(readView(q, titles)).toEqual({ path: 1, step: 2, compare: ["technology:react", "technology:vue"] });
  expect(new URLSearchParams(q).get("type")).toBe("concept");
  expect(readView("path=nope&compare=javascript:alert(1)", titles)).toEqual({ path: null, step: 0, compare: null });
});
