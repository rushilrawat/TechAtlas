import { test, expect, type Page } from "@playwright/test";

// Both themes on the six key states (atlas, node, role, app, X-Ray, paths). The X-Ray
// light-theme bug (dark legend on a light page, unreadable text) shipped because only
// the dark theme was ever screenshotted. Each state is screenshotted in both themes (as
// test attachments for review) and every open panel must actually be light in the light
// theme and dark in the dark theme, with readable text on it.

type Rgb = [number, number, number];
const parse = (c: string): Rgb | null => {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const lum = ([r, g, b]: Rgb) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: Rgb, b: Rgb) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PANELS = ".details, .xray-panel, .xray-legend, .stack-panel, .paths-library, .legend, .compare-panel";

async function checkPanels(page: Page, theme: "dark" | "light") {
  const found = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)]
    .filter((el) => el.offsetWidth > 0)
    .map((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      // Text samples: headings, buttons and paragraphs inside the panel.
      const texts = [...el.querySelectorAll<HTMLElement>("h2, h3, p, button, li, span")].filter((t) => t.offsetWidth > 0 && t.textContent?.trim())
        .slice(0, 40).map((t) => ({ text: t.textContent!.trim().slice(0, 30), color: getComputedStyle(t).color, bg: (() => {
          let n: HTMLElement | null = t;
          while (n && n !== el) { const b = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; n = n.parentElement; }
          return bg;
        })() }));
      return { cls: el.className, bg, texts };
    }), PANELS);
  expect(found.length, "at least one panel is open").toBeGreaterThan(0);
  for (const p of found) {
    const bg = parse(p.bg);
    if (!bg) continue;
    if (theme === "light") expect(lum(bg), `${p.cls} background in light theme`).toBeGreaterThan(0.6);
    else expect(lum(bg), `${p.cls} background in dark theme`).toBeLessThan(0.1);
    for (const t of p.texts) {
      const fg = parse(t.color), tb = parse(t.bg);
      if (!fg || !tb) continue;
      expect(contrast(fg, tb), `"${t.text}" in ${p.cls} (${theme})`).toBeGreaterThanOrEqual(3);
    }
  }
}

const STATES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "atlas", open: async (page) => { await page.getByRole("button", { name: "Fields", exact: true }).click(); } },
  { name: "node", open: async (page) => { await page.goto("technology/react"); } },
  { name: "role", open: async (page) => { await page.goto("?role=backend-engineer"); } },
  { name: "app", open: async (page) => { await page.goto("?app=discord"); } },
  { name: "xray", open: async (page) => {
    await page.getByRole("button", { name: "Repo X-Ray" }).click();
    await page.getByRole("button", { name: /vercel\/next\.js/ }).first().click();
    await expect(page.locator(".xray-headline")).toBeVisible({ timeout: 15_000 });
  } },
  { name: "paths", open: async (page) => { await page.getByRole("button", { name: "Guided paths" }).click(); } },
];

for (const theme of ["dark", "light"] as const) {
  for (const state of STATES) {
    test(`${state.name} reads correctly in the ${theme} theme`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript((t) => window.localStorage.setItem("techatlas-theme", t), theme);
      await page.goto("./");
      await expect(page.getByText(/[\d,]+ nodes · [\d,]+ edges/)).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Explore the atlas" }).click().catch(() => undefined);
      await state.open(page);
      await expect(page.getByText(/[\d,]+ nodes · [\d,]+ edges/)).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      await info.attach(`${state.name}-${theme}.png`, { body: await page.screenshot(), contentType: "image/png" });
      await checkPanels(page, theme);
    });
  }
}
