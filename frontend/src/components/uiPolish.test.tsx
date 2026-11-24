// UI polish pass: arrow-key traversal, ← / → steppers, app logos and role emojis.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { APPS, ROLES } from "../content/data";
import { APP_LOGOS } from "../content/appLogos";
import { FALLBACK_ROLE_EMOJI, hasRoleEmoji, roleEmoji } from "../graph/roleEmoji";
import { arrowNav, arrowTarget } from "../util/arrowNav";
import { luminance, monogram } from "./AppLogo";
import { StepNav, neighbours, useStepKeys } from "./StepNav";

afterEach(cleanup);

describe("role emojis", () => {
  it("every role has its own emoji", () => {
    expect(ROLES.filter((r) => !hasRoleEmoji(r.id)).map((r) => r.id)).toEqual([]);
    const used = ROLES.map((r) => roleEmoji(r.id));
    expect(new Set(used).size).toBe(used.length);
  });
  it("falls back for an unknown role", () => {
    expect(roleEmoji("not-a-role")).toBe(FALLBACK_ROLE_EMOJI);
  });
});

describe("app logos", () => {
  it("only lists apps that exist, and covers most of them", () => {
    const ids = new Set(APPS.map((a) => a.id));
    expect(Object.keys(APP_LOGOS).filter((id) => !ids.has(id))).toEqual([]);
    expect(Object.keys(APP_LOGOS).length).toBeGreaterThanOrEqual(APPS.length - 6);
    for (const [id, mark] of Object.entries(APP_LOGOS)) {
      expect(mark.hex, id).toMatch(/^[0-9A-F]{6}$/i);
      expect(mark.path.length, id).toBeGreaterThan(20);
    }
  });
  it("monograms and glyph contrast", () => {
    expect(monogram("Khan Academy")).toBe("KA");
    expect(monogram("Slack")).toBe("S");
    expect(monogram("Pokémon GO")).toBe("PG");
    expect(luminance("FFFFFF")).toBeCloseTo(1);
    expect(luminance("000000")).toBe(0);
  });
});

describe("arrow-key traversal", () => {
  const items = Array.from({ length: 4 }, () => document.createElement("button"));
  it("moves linearly and stops at the edges unless wrapping", () => {
    expect(arrowTarget(items, 0, "ArrowRight")).toBe(1);
    expect(arrowTarget(items, 0, "ArrowLeft")).toBeNull();
    expect(arrowTarget(items, 0, "ArrowLeft", { wrap: true })).toBe(3);
    expect(arrowTarget(items, 2, "ArrowDown")).toBe(3);
    expect(arrowTarget(items, 2, "Home")).toBe(0);
    expect(arrowTarget(items, 0, "End")).toBe(3);
    expect(arrowTarget(items, 0, "a")).toBeNull();
  });
  it("moves focus between buttons and keeps the key from the atlas", () => {
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    render(<div data-arrow-nav onKeyDown={arrowNav}><button>One</button><button>Two</button></div>);
    // jsdom has no layout, so give the buttons a size for the visibility check.
    for (const b of screen.getAllByRole("button")) Object.defineProperty(b, "offsetWidth", { value: 10 });
    screen.getByText("One").focus();
    fireEvent.keyDown(screen.getByText("One"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByText("Two"));
    expect(onWindow).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindow);
  });
});

describe("step navigation", () => {
  it("wraps around a list", () => {
    expect(neighbours(0, 5)).toEqual([4, 1]);
    expect(neighbours(4, 5)).toEqual([3, 0]);
    expect(neighbours(-1, 5)).toBeNull();
    expect(neighbours(0, 1)).toBeNull();
  });
  it("names both neighbours and steps with the buttons and [ / ]", () => {
    const prev = vi.fn(), next = vi.fn();
    function Harness() {
      useStepKeys(true, prev, next);
      return <StepNav label="Step" position="2 / 3" prev={{ label: "Stripe", onGo: prev }} next={{ label: "GitHub", onGo: next }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Next: GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous: Stripe" }));
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "[" });
    expect(next).toHaveBeenCalledTimes(2);
    expect(prev).toHaveBeenCalledTimes(2);
  });
});
