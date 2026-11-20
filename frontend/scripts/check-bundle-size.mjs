/* global process, console */
// Fails the build when the entry bundle or the graph payload grows past its budget
// (gzip bytes). Run after `vite build`: node scripts/check-bundle-size.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// graph: the payload every visitor downloads before the atlas draws. The static API
// snapshot is checked when it has been rendered, otherwise the compiled dataset (which
// is about the same size gzipped). ~113 KB at dataset 0.7.0 / 1,194 nodes; ~258 KB (snapshot)
// and ~271 KB (data/graph.json) at 0.9.0 / 3,122 nodes. Past this, load a light index first.
// js: the entry chunk embeds data/seed/apps.json, which grew with the 0.8.0 app stacks.
const BUDGETS = { js: 172_000, css: 15_000, woff2: 60_000, graph: 280_000 };
const dir = join(process.cwd(), "dist", "assets");
let failed = false;
const totals = { js: 0, css: 0, woff2: 0 };
for (const file of readdirSync(dir)) {
  const ext = file.split(".").pop();
  if (!(ext in totals)) continue;
  const buf = readFileSync(join(dir, file));
  // Only the entry chunk counts for JS; lazy chunks load on demand.
  if (ext === "js" && !file.startsWith("index-")) continue;
  const size = ext === "woff2" ? statSync(join(dir, file)).size : gzipSync(buf).length;
  totals[ext] += size;
}
const graphFile = [join(process.cwd(), "public", "api", "v1", "graph.json"), join(process.cwd(), "..", "data", "graph.json")]
  .find((f) => existsSync(f));
if (graphFile) totals.graph = gzipSync(readFileSync(graphFile)).length;
for (const [ext, size] of Object.entries(totals)) {
  const ok = size <= BUDGETS[ext];
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${ext.padEnd(5)} ${(size / 1024).toFixed(1)} KB (budget ${(BUDGETS[ext] / 1024).toFixed(0)} KB)`);
}
process.exit(failed ? 1 : 0);
