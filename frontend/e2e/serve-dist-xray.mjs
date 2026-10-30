// Minimal static server that serves ../dist-xray under the /TechAtlas/ base path and
// falls back to index.html for unknown paths (the SPA 404 behavior Pages uses).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, "..", "dist-xray");
const BASE = "/TechAtlas";
const PORT = 4179;
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
}).listen(PORT, () => console.log(`serving dist at http://localhost:${PORT}${BASE}/`));
