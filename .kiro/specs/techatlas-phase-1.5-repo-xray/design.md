# Design — TechAtlas Phase 1.5: Repo X-Ray

**Status:** Design proposal for review. Realizes `requirements.md` under `architecture.md`.
No implementation authorized yet.

## 0. Principles

Overlay not rebuild · deterministic static analysis (no LLM) · reuse the canonical graph
and its Phase 1D `package`/`repo`/`aliases` data · never execute repo code · server-side
GitHub with bounds + commit-keyed cache · never fabricate detections/edges/nodes/percentages
· keep Explore Mode working and the static Pages site unbroken.

## 1. Backend pipeline (`backend/app/scanner/`)

`scan_orchestrator.run(url)`:
1. `repository_resolver` — normalize + validate URL (server-side), confirm public via
   `GET /repos/{owner}/{repo}`, resolve default branch → **commit SHA**.
2. `scan_cache` — key `repo+sha+scanner_version+mapping_version`; hit → return.
3. `tree_inspector` — `GET …/git/trees/{sha}?recursive=1`; if `truncated`, selective
   subtree fetches; pick relevant files (manifests, lockfiles, configs, a bounded set of
   source files), excluding vendored/generated/binary; enforce file/byte/count budgets.
4. `manifest_parsers/*` + `source_analyzer` — parse selected files into raw detections +
   evidence (declared vs confirmed; direct vs transitive where the format allows).
5. `technology_matcher` — map packages → canonical node ids (ecosystem+name → repo →
   name → alias → heuristic → unmapped), reusing GraphService indexes.
6. `concept_inference` — evidence-backed rules → existing concept nodes only.
7. `evidence_service` — consolidate (one detection per node, many evidence), build
   commit-pinned `source_url`s.
8. assemble `RepoScan` (+ `coverage.partial`/`truncated`), cache, return.

Budgets/timeout enforced throughout; partial results labeled, never silently "complete".

### Parser coverage (MVP → later)
- **MVP:** JS/TS (`package.json`, `package-lock`/`pnpm-lock`/`yarn.lock`/`bun.lock`,
  `vite.config.*`, `tsconfig.json`, selected imports), Python
  (`pyproject.toml`/`requirements*.txt`/`poetry.lock`/`uv.lock`/`Pipfile*`, selected
  imports), Docker (`Dockerfile*`, `compose*.y*ml`), CI (`.github/workflows/*`).
- **Later (independent modules, graceful absence):** Rust (Cargo), Java/Kotlin
  (pom/gradle), Go (go.mod), then Ruby/PHP/.NET/Dart/Swift/C-C++.

### Name normalization examples (into existing nodes)
`torch`→pytorch · `opencv-python`→opencv · `scikit-learn`→scikit-learn (import `sklearn`)
· `@angular/core`→angular · ecosystem-qualified, never loose substring.

## 2. API (additive, under `/api/v1`)

- `POST /repository-scans` `{repository_url}` → `{scan_id, status}` (cache hit may return
  `completed` immediately).
- `GET /repository-scans/{scan_id}` → full `RepoScan` (status, repository, summary,
  coverage, detections, evidence, unmapped).
- Graph highlights derived in the frontend from `detections` + existing graph (no extra
  endpoint for MVP, per spec §12.2).

Pydantic models: `RepoScan`, `Detection`, `Evidence`, `ScanCoverage`, `UnmappedPackage`,
`ScanRepository`. Mirrored in `frontend/src/api/types.ts`.

## 3. Frontend

- **`RepoXrayPanel.tsx`** — entry point in the header; opens a compact input ("Analyze a
  GitHub Repository", placeholder `https://github.com/owner/repository`, "Public repos
  only"); after scan, a categorized summary (Languages/Frontend/Backend/Databases/AI/
  Infra/Testing/Security/Dev Tools/Concepts) with compact interactive rows; clicking a row
  focuses that node. "Focus on Stack" + "Back to Universe" controls. Unmapped section.
- **`App.tsx`** — adds `mode` ("explore" | "xray") and `scanState` (scan id, status, repo
  meta, `Map<nodeId, DetectionStatus>`, previous camera). Reuses existing state approach;
  no new state library.
- **`GraphCanvas.tsx`** — reducers read `scanState`: status outline/halo on a separate
  channel, domain color preserved; dim non-scan nodes/edges; highlight existing edges
  between detected nodes; `prefers-reduced-motion`-aware reveal; exit restores prior
  appearance + camera. No relayout, no canonical mutation.
- **`NodeDetailsPanel.tsx`** — adds a "Found in this repository" section (status + evidence
  list with commit-pinned links) when the open node is in `scanState`.
- **`api/client.ts`** — `scanRepository(url)` + `getScan(id)`; entry point gated on
  `VITE_SCANNER_API` so the static Pages build hides it cleanly.

Loading uses real lifecycle labels (spec §4.4) or an indeterminate indicator — no fake %.
Camera fits matched nodes with padding + readability (spec §5.7). Optional Isolated Stack
View = a filtered view of the same graph (deferred for MVP).

## 4. Caching & execution

On-disk JSON cache at `data/cache/scans/<repo>/<sha>.json` (gitignored, like Phase 1C),
keyed with scanner+mapping versions. MVP runs synchronously within budgets; the `scan_id`
+ polled-status API shape allows a later bounded background job without a frontend change.

## 5. Security (spec §17) — enforced in code

Owner/repo regex allowlist server-side; only GitHub API base; no arbitrary fetch / no SSRF
/ no unknown-host redirects; never execute or install; bounded requests/files/bytes/time;
exclude binaries + vendored/generated dirs; safe TOML/JSON/YAML parsing (no unsafe
deserialization); don't persist full source or likely-secret lines; anonymous-submission
rate limiting; repo content treated as untrusted everywhere.

## 6. Testing (CI-safe, offline) — spec §20

- **Unit:** URL validate/normalize, alias/ecosystem resolution, each manifest parser,
  status classification, direct-vs-transitive, evidence aggregation (one detection, many
  evidence), concept rules, result serialization.
- **Integration (mocked GitHub):** metadata, tree, **truncated tree**, missing manifests,
  rate-limit, multi-framework repo, monorepo, unsupported ecosystem, partial scan, cache
  hit/miss, changed SHA. No live GitHub in CI.
- **Negative (spec §20.5):** README mention ≠ confirmed; `react`-containing package name ≠
  React; AI SDK ≠ RAG; transitive ≠ direct.
- **Frontend:** open panel, validate input, start scan, loading/error, categorized results,
  node highlighting via reducers, evidence inspector, focus node, clear scan, return to
  Explore. Reuses the testing-library setup from Phase 1C.
- **Fixtures:** React+TS, Python+FastAPI, Python+PyTorch, Rust+Cargo, Java+Spring, Docker+
  Actions, FE/BE monorepo, unknown-package repo, insufficient-evidence repo, ambiguous-name
  repo.

## 7. Dependencies

`httpx` (already runtime since 1C) for GitHub calls. TOML parsing via stdlib `tomllib`
(3.11+); YAML for compose/workflows via a safe loader (add `pyyaml` pinned, or a minimal
targeted parser to avoid a new dep — decide in 1.5A). No frontend deps expected.

## 8. Rollout (mirrors spec §23)

- **1.5A — Scanner foundation:** schema/models, github_client, resolver, tree_inspector,
  JS/TS + Python parsers, Docker + Actions detection, matcher (reusing 1D data), evidence,
  backend tests. Deliverable: URL → normalized detections + evidence (no UI redesign).
- **1.5B — Graph highlight integration:** entry point, input, loading/error, scan API wiring,
  `scanState`, reducer-based halos + dimming + edge highlight, camera focus, summary panel,
  exit/reset.
- **1.5C — Evidence & accuracy:** detail-panel evidence + commit-pinned links, status
  labels, unmapped section, coverage reporting, alias/monorepo improvements, more parsers,
  false-positive tests, responsive polish.
- **1.5D — Production hardening:** commit cache, server-side rate limits, timeouts/budgets,
  truncated-tree handling, background execution if needed, GitHub error handling, abuse
  protection, large-repo + mobile tests, docs, deploy/validate.

## 9. Open items (from requirements)

Static-deploy strategy (hide unless `VITE_SCANNER_API` set — proposed), sync-vs-background
(sync+cache for MVP — proposed), backend `GITHUB_TOKEN` availability (needed for real use),
cache storage (JSON pattern — proposed), Isolated Stack View (deferred — proposed). Confirm
before 1.5A starts.
