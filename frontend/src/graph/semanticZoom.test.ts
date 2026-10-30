import { describe, expect, it } from "vitest";
import {
  bandOf,
  labelVisibleAtRatio,
  RATIO_DOMAIN,
  RATIO_UNIVERSE,
} from "./semanticZoom";

describe("semantic zoom", () => {
  it("maps camera ratios to bands", () => {
    expect(bandOf(RATIO_UNIVERSE + 0.5)).toBe(0); // zoomed out -> universe
    expect(bandOf((RATIO_UNIVERSE + RATIO_DOMAIN) / 2)).toBe(1); // mid -> domain
    expect(bandOf(RATIO_DOMAIN - 0.1)).toBe(2); // zoomed in -> detail
  });

  it("at universe zoom only domains and the biggest hubs are labelled", () => {
    const ratio = RATIO_UNIVERSE + 0.5;
    expect(labelVisibleAtRatio("domain", 20, ratio)).toBe(true);
    expect(labelVisibleAtRatio("technology", 20, ratio)).toBe(true); // very big hub (>=18)
    expect(labelVisibleAtRatio("technology", 14, ratio)).toBe(false); // mid hub now hidden
    expect(labelVisibleAtRatio("concept", 7, ratio)).toBe(false);
  });

  it("at domain zoom domains and prominent (>=12) nodes are labelled", () => {
    const ratio = (RATIO_UNIVERSE + RATIO_DOMAIN) / 2;
    expect(labelVisibleAtRatio("domain", 10, ratio)).toBe(true);     // domains always
    expect(labelVisibleAtRatio("technology", 13, ratio)).toBe(true); // prominent tech
    expect(labelVisibleAtRatio("concept", 7, ratio)).toBe(false);    // small concept hidden
    expect(labelVisibleAtRatio("technology", 5, ratio)).toBe(false);
  });

  it("at detail zoom everything is labelled", () => {
    const ratio = RATIO_DOMAIN - 0.2;
    expect(labelVisibleAtRatio("technology", 5, ratio)).toBe(true);
    expect(labelVisibleAtRatio("concept", 6, ratio)).toBe(true);
  });
});
