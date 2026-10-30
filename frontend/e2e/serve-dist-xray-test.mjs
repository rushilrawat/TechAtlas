// Static server for the TEST-HOOKS build (dist-xray-test), served under /TechAtlas/ on a
// dedicated port so it never collides with the deploy-parity server (serve-dist-xray.mjs,
// port 4179). This build is produced with VITE_TEST_HOOKS=true, which exposes a window
// renderer handle used by the Stack View regression suite to assert ACTUAL rendering
// (viewport-coordinate checks), not just DOM presence. The handle is tree-shaken out of
// the real deploy build.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, "..", "dist-xray-test");
const BASE = "/TechAtlas";
const PORT = 4180;
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.startsWith(BASE)) p = p.slice(BASE.length) || "/";
  if (p === "/") p = "/index.html";
  let file = normalize(join(DIST, p));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file)) file = join(DIST, "index.html"); // SPA fallback
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, () => console.log(`serving test-hooks dist at http://localhost:${PORT}${BASE}/`));
