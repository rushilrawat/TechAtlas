# Analytics

TechAtlas can count how the public site is used, without cookies and without
personal data, so product decisions (paths vs. X-Ray vs. compare, what people
search for and don't find) rest on real usage. It is **off by default**.

## Turning it on

1. Create a site with one cookieless provider:
   - **[GoatCounter](https://www.goatcounter.com)**: free for non-commercial sites, open
     source. Pick a site code, e.g. `techatlas`.
   - **[Plausible](https://plausible.io)**: paid (or self-hosted). Register the site domain,
     e.g. `rushilrawat.github.io`, and enable custom properties for `path`, `node`,
     `type`, `query` and `from`.
   - **[Umami](https://umami.is)**: Umami Cloud has a free tier, or self-host. Copy the
     website ID.
2. In GitHub: **Settings → Secrets and variables → Actions → Variables**, add a repository
   variable `ANALYTICS` with one of:

   | Provider | Value |
   |---|---|
   | GoatCounter | `goatcounter:techatlas` |
   | Plausible | `plausible:rushilrawat.github.io` (self-hosted: `plausible:<domain>@https://plausible.example.com`) |
   | Umami | `umami:<website-id>` (self-hosted: `umami:<website-id>@https://umami.example.com`) |

3. Re-run **Deploy to GitHub Pages**. Remove the variable to turn analytics off again.

The build reads it as `VITE_ANALYTICS`; set the same variable locally to try it
(requests from `localhost` are never sent, so test on another host name).

## Privacy

- No cookies, `localStorage` or identifiers. No third-party script is loaded; events are
  plain HTTPS requests to the provider.
- Nothing is sent when the browser has **Do Not Track** or **Global Privacy Control** on,
  from `localhost`, or from the e2e test build.
- Page URLs are sent without their query string (camera, filter and compare parameters).
- The only free text sent is a **search query that returned no results**, lower-cased and
  cut to 60 characters, so missing technologies can become the content backlog.

## What is counted

| Event | When | Properties |
|---|---|---|
| pageview | First load, and when the node or About page in the URL changes | – |
| `hero_explore` / `hero_scan` | The hero's "Explore the atlas" / "Scan a repo" | – |
| `search_used` | A search settles with results | – |
| `search_no_results` | A search still has no results after 3 s | `query` |
| `node_opened` | A node is selected (by click, search, path or link) | `type`, `node` |
| `path_started` / `path_finished` | A guided path is opened / its last step is reached | `path` |
| `compare_used` | Two technologies are being compared | – |
| `share_link_copied` | "Copy link" in the node panel or Compare | `from` |
| `xray_opened` / `scan_run` | Repo X-Ray is opened / a repository is submitted | – |
| `about_viewed` | The About page | – |

GoatCounter has no event properties, so it records the first property in the event
name, e.g. `path_started/how-a-web-request-works`.

## How it works

`frontend/src/analytics.ts` is installed once from `main.tsx`. It derives events from
signals the app already produces instead of calls inside components:

- the URL, which the app keeps in sync with the selected node, guided path and compare
  pair (`history.replaceState`/`pushState` are observed);
- delegated clicks and submits on a few controls (identified by class or accessible name);
- the search box: after typing settles, it checks whether the results list has options.

For anything without a URL or DOM signal, import `track(name, props)` and call it; it is
a no-op when analytics is off. If a control's label or class changes, update
`clickEvent()` and its test in `analytics.test.ts`.
