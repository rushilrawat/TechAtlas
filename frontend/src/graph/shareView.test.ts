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
