import { describe, expect, it, vi } from "vitest";
import { JOURNEYS } from "./graph/journeys";
import { pathSlug } from "./graph/shareView";
import { clickEvent, createClient, parseConfig, readUrl, trackingAllowed, urlEvents } from "./analytics";

describe("parseConfig", () => {
  it("reads each provider, with an optional self-hosted origin", () => {
    expect(parseConfig("plausible:rushilrawat.github.io")).toEqual({ name: "plausible", site: "rushilrawat.github.io", origin: "https://plausible.io" });
    expect(parseConfig("goatcounter:techatlas")).toEqual({ name: "goatcounter", site: "techatlas", origin: "https://techatlas.goatcounter.com" });
    expect(parseConfig("umami:abc-123@https://stats.example.com")).toEqual({ name: "umami", site: "abc-123", origin: "https://stats.example.com" });
  });
  it("is off when unset or malformed", () => {
    for (const raw of [undefined, "", "  ", "ga:UA-1", "plausible:", "umami:x@http://insecure.example", "goatcounter:Bad Code"]) {
      expect(parseConfig(raw)).toBeNull();
    }
  });
});

describe("trackingAllowed", () => {
  const nav = (extra: object) => ({ doNotTrack: null, ...extra }) as unknown as Navigator;
  it("respects Do Not Track, Global Privacy Control and localhost", () => {
    expect(trackingAllowed(nav({}), "rushilrawat.github.io")).toBe(true);
    expect(trackingAllowed(nav({ doNotTrack: "1" }), "rushilrawat.github.io")).toBe(false);
    expect(trackingAllowed(nav({ globalPrivacyControl: true }), "rushilrawat.github.io")).toBe(false);
    expect(trackingAllowed(nav({}), "localhost")).toBe(false);
  });
});

describe("urlEvents", () => {
  const at = (path: string, search = "") => readUrl(path, search);
  it("reports a newly opened node once, ignoring camera-only URL changes", () => {
    const a = at("/TechAtlas/technology/react", "cx=0.1&cy=0.2&zoom=1");
    expect(urlEvents(at("/TechAtlas/"), a)).toEqual([["node_opened", { type: "technology", node: "react" }]]);
    expect(urlEvents(a, at("/TechAtlas/technology/react", "cx=0.5&cy=0.2&zoom=2"))).toEqual([]);
  });
  it("reports a guided path when it starts and when its last step is reached", () => {
    const j = JOURNEYS[0];
    const slug = pathSlug(j.title);
    const start = at("/TechAtlas/", `path=${slug}&step=0`);
    expect(urlEvents(at("/TechAtlas/"), start)).toEqual([["path_started", { path: slug }]]);
    const end = at("/TechAtlas/", `path=${slug}&step=${j.steps.length - 1}`);
    expect(urlEvents(start, end)).toEqual([["path_finished", { path: slug }]]);
    expect(urlEvents(end, end)).toEqual([]);
  });
  it("reports compare once both technologies are chosen", () => {
    const one = at("/TechAtlas/", "compare=technology:react");
    const two = at("/TechAtlas/", "compare=technology:react&compare=technology:vue");
    expect(urlEvents(at("/TechAtlas/"), one)).toEqual([]);
    expect(urlEvents(one, two)).toEqual([["compare_used"]]);
  });
  it("reports the about page", () => {
    expect(urlEvents(at("/TechAtlas/"), at("/TechAtlas/about"))).toEqual([["about_viewed"]]);
  });
});

describe("clickEvent", () => {
  it("names the controls we count and ignores the rest", () => {
    document.body.innerHTML = `
      <button class="hero-primary">Explore the atlas</button>
      <section class="compare-panel"><button id="c">Copy link</button></section>
      <aside class="details"><button id="n"><span>Copy link</span></button></aside>
      <button aria-label="Repo X-Ray"><svg></svg><span>Repo X-Ray</span></button>
      <button id="other">Zoom in</button>`;
    expect(clickEvent(document.querySelector(".hero-primary")!)).toEqual(["hero_explore"]);
    expect(clickEvent(document.querySelector("#c")!)).toEqual(["share_link_copied", { from: "compare" }]);
    expect(clickEvent(document.querySelector("#n span")!)).toEqual(["share_link_copied", { from: "node" }]);
    expect(clickEvent(document.querySelector("[aria-label='Repo X-Ray'] svg")!)).toEqual(["xray_opened"]);
    expect(clickEvent(document.querySelector("#other")!)).toBeNull();
  });
});

describe("createClient", () => {
  const loc = { origin: "https://rushilrawat.github.io", pathname: "/TechAtlas/technology/react", hostname: "rushilrawat.github.io" } as Location;
  it("posts Plausible events without the query string", () => {
    const send = vi.fn();
    createClient({ name: "plausible", site: "rushilrawat.github.io", origin: "https://plausible.io" }, send, loc)
      .event("path_started", { path: "how-the-web-works" });
    const [url, body] = send.mock.calls[0];
    expect(url).toBe("https://plausible.io/api/event");
    expect(JSON.parse(body)).toMatchObject({ name: "path_started", domain: "rushilrawat.github.io",
      url: "https://rushilrawat.github.io/TechAtlas/technology/react", props: { path: "how-the-web-works" } });
  });
  it("sends GoatCounter events as named paths", () => {
    const send = vi.fn();
    createClient({ name: "goatcounter", site: "techatlas", origin: "https://techatlas.goatcounter.com" }, send, loc)
      .event("search_no_results", { query: "htmx alpine" });
    const url = new URL(send.mock.calls[0][0]);
    expect(url.pathname).toBe("/count");
    expect(url.searchParams.get("p")).toBe("search_no_results/htmx alpine");
    expect(url.searchParams.get("e")).toBe("true");
  });
  it("posts Umami pageviews as JSON", () => {
    const send = vi.fn();
    createClient({ name: "umami", site: "abc", origin: "https://cloud.umami.is" }, send, loc).pageview();
    const [url, body, json] = send.mock.calls[0];
    expect(url).toBe("https://cloud.umami.is/api/send");
    expect(json).toBe(true);
    expect(JSON.parse(body).payload).toMatchObject({ website: "abc", url: "/TechAtlas/technology/react" });
    expect(JSON.parse(body).payload.name).toBeUndefined();
  });
});
