import { expect, it } from "vitest";
import graph from "../../../data/graph.json";
import { connectionPath } from "./compare";

it("finds a real non-membership path between technologies", () => {
  const path = connectionPath(graph as never, "technology:python", "technology:fastapi");
  expect(path).toEqual(["technology:python", "technology:fastapi"]);
});
