// Privacy-friendly, cookieless usage analytics.
//
// Off unless the build sets VITE_ANALYTICS (the deploy reads the ANALYTICS repo
// variable). Supported providers, all cookieless with no personal data stored:
//   plausible:<site domain>[@<self-hosted origin>]   e.g. plausible:rushilrawat.github.io
//   goatcounter:<site code>                         e.g. goatcounter:techatlas
//   umami:<website id>[@<self-hosted origin>]        e.g. umami:4fb7…   (Umami Cloud by default)
//
// Nothing is sent when the visitor has Do Not Track or Global Privacy Control on, on
// localhost, or in the e2e test build. No cookies, no localStorage, no IDs: each
// provider counts visits from the request itself, and no script is loaded from a
// third party (events are plain HTTPS requests).
//
// Events are derived without touching component code, so feature branches don't collide:
//   - the URL (the app already mirrors selection, guided paths and compare into it),
//   - delegated clicks and form submits on a few well-known controls,
//   - the search box (results vs. no results, after the search settles).
// Call track() directly for anything that has no URL or DOM signal.
import { JOURNEYS } from "./graph/journeys";
import { pathSlug } from "./graph/shareView";

export type Props = Record<string, string | number | boolean>;

export interface Provider {
  name: "plausible" | "goatcounter" | "umami";
  site: string;
  origin: string;
}

type Sender = (url: string, body?: string, json?: boolean) => void;

export function parseConfig(raw: string | undefined): Provider | null {
  const value = raw?.trim();
  if (!value) return null;
  const m = /^(plausible|goatcounter|umami):([^@\s]+)(?:@(https:\/\/[^\s/]+))?$/.exec(value);
  if (!m) return null;
  const [, name, site, origin] = m;
  const fallback = { plausible: "https://plausible.io", umami: "https://cloud.umami.is",
    goatcounter: `https://${site}.goatcounter.com` }[name as Provider["name"]];
  if (name === "goatcounter" && !/^[a-z0-9-]+$/.test(site)) return null;
  return { name: name as Provider["name"], site, origin: origin ?? fallback };
}

export function trackingAllowed(nav: Navigator, host: string): boolean {
  const n = nav as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (n.doNotTrack === "1" || n.msDoNotTrack === "1" || n.globalPrivacyControl === true) return false;
  return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
}

/** Page URL without the query string: camera and filter params would split every page. */
function pageUrl(loc: Location): string {
  return `${loc.origin}${loc.pathname}`;
}

function defaultSender(url: string, body?: string, json = false): void {
  try {
    if (body === undefined) {
      new Image().src = url;
    } else if (!json && navigator.sendBeacon) {
      navigator.sendBeacon(url, body);
    } else {
      void fetch(url, { method: "POST", body, keepalive: true,
        headers: json ? { "Content-Type": "application/json" } : undefined }).catch(() => {});
    }
  } catch {
    /* analytics must never break the page */
  }
}

export function createClient(provider: Provider, send: Sender = defaultSender, loc: Location = window.location) {
  function emit(name: string | null, props?: Props): void {
    const url = pageUrl(loc);
    if (provider.name === "plausible") {
      send(`${provider.origin}/api/event`, JSON.stringify({
        name: name ?? "pageview", url, domain: provider.site, referrer: document.referrer || null,
        props: props && Object.keys(props).length ? props : undefined,
      }));
    } else if (provider.name === "umami") {
      send(`${provider.origin}/api/send`, JSON.stringify({ type: "event", payload: {
        website: provider.site, hostname: loc.hostname, url: loc.pathname, title: document.title,
        language: navigator.language, screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
        referrer: document.referrer || undefined, ...(name ? { name, data: props } : {}),
      } }), true);
    } else {
      // GoatCounter counts events as named paths; fold the main prop into the name.
      const detail = props ? Object.values(props)[0] : undefined;
      const path = name ? `${name}${detail !== undefined ? `/${detail}` : ""}` : loc.pathname;
      const q = new URLSearchParams({ p: path, t: name ? name : document.title, r: document.referrer,
        rnd: Math.random().toString(36).slice(2) });
      if (name) q.set("e", "true");
      send(`${provider.origin}/count?${q.toString()}`);
    }
  }
  return {
    pageview: () => emit(null),
    event: (name: string, props?: Props) => emit(name, props),
  };
}

type Client = ReturnType<typeof createClient>;
let client: Client | null = null;

/** Record a custom event. A no-op when analytics is off. */
export function track(name: string, props?: Props): void {
  client?.event(name, props);
}

// ---- URL-derived events ------------------------------------------------------

const NODE_PATH = /\/(technology|concept|domain)\/([a-z0-9-]+)\/?$/;

export interface UrlState { node: { type: string; slug: string } | null; about: boolean;
  path: string | null; step: number; compare: number }

export function readUrl(pathname: string, search: string): UrlState {
  const m = NODE_PATH.exec(pathname);
  const params = new URLSearchParams(search);
  return {
    node: m ? { type: m[1], slug: m[2] } : null,
    about: /\/about\/?$/.test(pathname),
    path: params.get("path"),
    step: Number(params.get("step")) || 0,
    compare: params.getAll("compare").length,
  };
}

const PATH_LENGTH = new Map(JOURNEYS.map((j) => [pathSlug(j.title), j.steps.length]));

/** Events implied by moving from one URL state to the next. */
export function urlEvents(prev: UrlState | null, next: UrlState): [string, Props?][] {
  const out: [string, Props?][] = [];
  if (next.node && (prev?.node?.slug !== next.node.slug || prev?.node?.type !== next.node.type)) {
    out.push(["node_opened", { type: next.node.type, node: next.node.slug }]);
  }
  if (next.about && !prev?.about) out.push(["about_viewed"]);
  if (next.path && next.path !== prev?.path) out.push(["path_started", { path: next.path }]);
  const last = next.path ? (PATH_LENGTH.get(next.path) ?? 0) - 1 : -1;
  if (next.path && last > 0 && next.step === last && !(prev?.path === next.path && prev.step === last)) {
    out.push(["path_finished", { path: next.path }]);
  }
  if (next.compare === 2 && (prev?.compare ?? 0) < 2) out.push(["compare_used"]);
  return out;
}

// ---- DOM-derived events ------------------------------------------------------

function accessibleName(el: Element): string {
  return (el.getAttribute("aria-label") || el.textContent || "").trim();
}

/** The event for a click on a control, if it is one we count. */
export function clickEvent(target: Element): [string, Props?] | null {
  const button = target.closest("button, a");
  if (!button) return null;
  const name = accessibleName(button);
  if (button.classList.contains("hero-primary")) return ["hero_explore"];
  if (button.classList.contains("hero-secondary")) return ["hero_scan"];
  if (name === "Copy link") {
    return ["share_link_copied", { from: button.closest(".compare-panel") ? "compare" : "node" }];
  }
  if (/^Repo X-Ray$/.test(name)) return ["xray_opened"];
  return null;
}

const SEARCH_INPUT = 'input[aria-label="Search the technology graph"]';
const SETTLE_MS = 1200;
const SLOW_MS = 3000;

function installSearchTracking(): void {
  let timer: number | undefined;
  let reported = "";
  document.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement | null;
    if (!input?.matches?.(SEARCH_INPUT)) return;
    window.clearTimeout(timer);
    const query = input.value.trim().toLowerCase();
    if (query.length < 2) return;
    const hasResults = () => document.querySelector('#search-results [role="option"]') !== null;
    timer = window.setTimeout(() => {
      if (input.value.trim().toLowerCase() !== query || query === reported) return;
      if (hasResults()) { reported = query; track("search_used"); return; }
      // The search index loads on the first query; give a slow network a second look.
      timer = window.setTimeout(() => {
        if (input.value.trim().toLowerCase() !== query || query === reported) return;
        reported = query;
        if (hasResults()) track("search_used");
        else track("search_no_results", { query: query.slice(0, 60) });
      }, SLOW_MS - SETTLE_MS);
    }, SETTLE_MS);
  }, true);
}

// ---- install -----------------------------------------------------------------

export function installAnalytics(raw: string | undefined = (import.meta.env as Record<string, string | undefined>).VITE_ANALYTICS): boolean {
  const provider = parseConfig(raw);
  if (!provider || import.meta.env.VITE_TEST_HOOKS === "true") return false;
  if (!trackingAllowed(navigator, window.location.hostname)) return false;
  client = createClient(provider);
  const c = client;

  let state = readUrl(window.location.pathname, window.location.search);
  c.pageview();
  for (const [name, props] of urlEvents(null, state)) c.event(name, props);

  const onUrl = () => {
    const next = readUrl(window.location.pathname, window.location.search);
    const prevPath = state.node?.slug ?? (state.about ? "about" : "");
    const nextPath = next.node?.slug ?? (next.about ? "about" : "");
    if (nextPath !== prevPath) c.pageview();
    for (const [name, props] of urlEvents(state, next)) c.event(name, props);
    state = next;
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      onUrl();
    };
  }
  window.addEventListener("popstate", onUrl);

  document.addEventListener("click", (e) => {
    const hit = e.target instanceof Element ? clickEvent(e.target) : null;
    if (hit) c.event(hit[0], hit[1]);
  }, true);
  document.addEventListener("submit", (e) => {
    if (e.target instanceof Element && e.target.matches(".xray-form")) c.event("scan_run");
  }, true);
  installSearchTracking();
  return true;
}
