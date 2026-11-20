# TechAtlas performance verification

## Targets

- Largest Contentful Paint (LCP) below 2.0 seconds on a real phone over a representative mobile connection.
- Zoom and pan near 60 frames per second on that phone, with no sustained frames above 16.7 ms.

## Current automated baseline

Re-measured on November 14, 2026 at dataset v0.7.0: **1,194 nodes and 3,517 edges, 20 top-level fields** (29 domains in all). The previous baseline (November 12) was taken at 607 nodes.

### Render cost (Playwright overview suite)

The suite (`npm run e2e:overview`) times ten synchronous Sigma full renders in headless Chromium with software WebGL (SwiftShader), and checks that every node renders with no circle overlaps at desktop fit, no heading collisions and no content behind panels.

| Viewport | ms per full render |
|---|---:|
| 1440×900 desktop | 79 |
| 1920×1080 desktop | 73 |
| 768×1024 tablet | 129 |
| 390×844 mobile | 119 |
| 390×667 mobile | 110 |

These are **full refresh costs on a CPU rasteriser in a cloud container**, not phone frame times or Lighthouse scores, and they are not comparable with the November 12 figures (14–23 ms desktop, 40–50 ms tablet/mobile), which came from a different machine. For reference, `main` at 1,189 nodes measured 82 ms at 1440×900 in the same container, so the change in dataset size between those two runs does not move the number. Sigma only does a full refresh on camera moves and selection, but on a real GPU these should be far lower; the real-device procedure below is still the source of truth.

The overview thresholds in `e2e/overview-visual-proof.spec.ts` were re-baselined for 29 domains: heading and member counts come from `data/graph.json`, the backbone budget is 55% of the node count (it keeps about half of each territory's members), and a desktop heading may graze at most four node circles.

### Payload

| Asset | Raw | Gzip | Budget (gzip) |
|---|---:|---:|---:|
| Entry JS (`index-*.js`, mostly Sigma + graphology) | 565 KB | 167 KB | 168 KB |
| CSS | 62 KB | 12 KB | 15 KB |
| Inter Latin subset (woff2) | 31 KB | n/a | 59 KB |
| Graph snapshot (`api/v1/graph.json`) | 2.2 MB | 219 KB | 239 KB |
| Search index (`api/v1/search-index.json`, loaded on first search) | 730 KB | 128 KB | none |
| Repo X-Ray chunk (lazy) | 16 KB | 5 KB | none |

`npm run size` enforces the budgets in CI. The graph budget checks the static API snapshot when it has been rendered and falls back to `data/graph.json` (about 234 KB gzipped) in the plain CI build. Measured at dataset 0.8.0 (2,681 nodes, 8,293 edges).

Dataset 0.8.0 more than doubled the node count, so the graph snapshot went from about 99 KB to about 219 KB gzipped, past the point (about 400 more nodes than 0.7.0) where this page said the graph should load a light index first. The budget was raised to fit 0.8.0 with a little headroom, not to invite more growth. The next step is to serve a light index (id, label, type, domain, position, importance) up front and fetch descriptions, links and edges per node on demand. The search index grew the same way and is still loaded on first search.

## Real-device procedure

1. Deploy the static build over HTTPS and clear the browser cache.
2. On a mid-range Android phone and an iPhone, open the atlas over normal mobile data. Record the phone model, browser, connection, and deployment commit.
3. For Android, enable USB debugging, connect the phone, and forward its Chrome debugging socket with `adb forward tcp:9222 localabstract:chrome_devtools_remote`. Run Lighthouse against the deployed URL with `--port=9222 --screenEmulation.disabled --throttling.cpuSlowdownMultiplier=1 --throttling-method=provided` ([official real-device instructions](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md#testing-on-a-mobile-device)). Record LCP, its element, and the full trace. Repeat five cold loads and report the median and range.
4. Record a browser performance trace while continuously pinching and panning the atlas for 10 seconds. Count slow frames and note whether domain headings, filters, or labels cause spikes.
5. Repeat in light theme, with a domain selected, and after a Repo X-Ray scan in Universe View. Keep the raw reports alongside the release notes.

The release target is not certified until these real-device runs are recorded. Prioritize label/edge disclosure and canvas rendering if zoom misses the frame target; prioritize font and graph asset loading if LCP misses 2 seconds.
