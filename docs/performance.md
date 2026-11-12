# TechAtlas performance verification

## Targets

- Largest Contentful Paint (LCP) below 2.0 seconds on a real phone over a representative mobile connection.
- Zoom and pan near 60 frames per second on that phone, with no sustained frames above 16.7 ms.

## Current automated baseline

The Playwright overview suite measures ten synchronous Sigma full renders in desktop Chrome with software WebGL. On November 12, 2026, the five viewport runs produced approximately 14–23 ms on desktop, 50 ms on tablet, and 40–49 ms on mobile-size viewports. These are **full refresh costs in desktop headless Chrome**, not phone frame times or Lighthouse scores. The suite also verifies that all 607 nodes render and no important content sits behind panels.

## Real-device procedure

1. Deploy the static build over HTTPS and clear the browser cache.
2. On a mid-range Android phone and an iPhone, open the atlas over normal mobile data. Record the phone model, browser, connection, and deployment commit.
3. For Android, enable USB debugging, connect the phone, and forward its Chrome debugging socket with `adb forward tcp:9222 localabstract:chrome_devtools_remote`. Run Lighthouse against the deployed URL with `--port=9222 --screenEmulation.disabled --throttling.cpuSlowdownMultiplier=1 --throttling-method=provided` ([official real-device instructions](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md#testing-on-a-mobile-device)). Record LCP, its element, and the full trace. Repeat five cold loads and report the median and range.
4. Record a browser performance trace while continuously pinching and panning the atlas for 10 seconds. Count slow frames and note whether domain headings, filters, or labels cause spikes.
5. Repeat in light theme, with a domain selected, and after a Repo X-Ray scan in Universe View. Keep the raw reports alongside the release notes.

The release target is not certified until these real-device runs are recorded. Prioritize label/edge disclosure and canvas rendering if zoom misses the frame target; prioritize font and graph asset loading if LCP misses 2 seconds.
