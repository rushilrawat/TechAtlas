# Architecture — TechAtlas Phase 1.5: Repo X-Ray

**Status:** Proposal for review. Complements `docs/architecture.md`. No code authorized.

## 1. Guiding constraint (from the spec)

Repo X-Ray is an **overlay** on the existing knowledge graph, computed by **deterministic
static analysis** of a public GitHub repo, served by the existing FastAPI backend, and
rendered through the **existing Sigma reducers** — no new graph, no LLM, no code execution,
no node/edge fabrication, no relayout.

```
  base graph      G = (V, E)   (unchanged, canonical)
  scan result     S ⊆ V        + per-node detection status + evidence
  visualization   emphasize S, dim V∖S, highlight existing edges within S
```

## 2. System view

```
 Frontend (React + Sigma, existing)                 Backend (FastAPI, existing)
 ┌───────────────────────────────┐   POST /repository-scans   ┌────────────────────────┐
 │ RepoXrayPanel (input+summary)  │ ─────────────────────────► │ scan_orchestrator      │
 │ App: mode + scanState          │   GET  /…/{id}  (poll)     │  ├ repository_resolver │─► GitHub API
 │ GraphCanvas: reducers read     │ ◄───────────────────────── │  ├ github_client (budget/cache/retry)
 │   scanState refs (overlay)     │   scan result + evidence   │  ├ tree_inspector      │
 │ NodeDetailsPanel: +evidence    │                            │  ├ manifest_parsers/*  │
 └───────────────────────────────┘                            │  ├ source_analyzer     │
          │ reuses                                             │  ├ technology_matcher  │─► GraphService
          ▼                                                     │  ├ concept_inference   │   (+ repo/package/aliases)
   api/client.ts (typed)                                        │  ├ evidence_service    │
                                                                │  └ scan_cache (JSON)   │
                                                                └────────────────────────┘
```

## 3. Backend modules (new, under `backend/app/scanner/`)

Following existing conventions (narrow services, injectable clients, Pydantic models):

| Module | Responsibility | Mirrors / reuses |
|--------|----------------|------------------|
| `github_client.py` | GitHub REST calls, auth header, request budget, retry, rate-limit detection | `SummaryService`'s injectable-httpx-client pattern |
| `repository_resolver.py` | validate+normalize URL, confirm public repo, resolve default branch → commit SHA | — |
| `tree_inspector.py` | fetch git tree (recursive, handle `truncated`), select relevant paths within budget | — |
| `manifest_parsers/` | one module per ecosystem (js, python, docker, ci, …), pure functions over file text | parser-per-batch style from `scripts/expand/` |
| `source_analyzer.py` | bounded import/config pattern scan on selected files | — |
| `technology_matcher.py` | map detected packages → canonical node ids via node `package`/`repo`/`aliases` | **reuses GraphService data**, no 2nd catalog |
| `concept_inference.py` | evidence-backed rules → existing concept nodes only | — |
| `evidence_service.py` | consolidate provenance, build commit-pinned source URLs | — |
| `scan_orchestrator.py` | run the pipeline, enforce budgets/timeout, assemble result | `scan_cache` + others |
| `scan_cache.py` | read/write results keyed by repo+commit+scanner+mapping version | Phase 1C on-disk JSON cache pattern |
| `models.py` (extend or `scanner/models.py`) | Pydantic: `RepoScan`, `Detection`, `Evidence`, `ScanCoverage`, `UnmappedPackage` | existing `models.py` |

Routes added to `main.py` under `/api/v1/repository-scans` (additive).

## 4. Matching: reuse the Phase 1D data

The dataset already carries, per technology node: `package` ({ecosystem, name}),
`repo` ("owner/name"), and `aliases`. `technology_matcher` builds reverse indexes from
these at load time (ecosystem+name → node, repo → node, normalized alias → node) and
resolves by the priority order in requirements §4.2. This is the single source of truth;
no duplicate dictionary in the frontend (spec §9.1, §9.4). Packages with no match become
`UnmappedPackage` records (spec §6.4).

## 5. Frontend integration (reuse the reducers)

`GraphCanvas` already appearance-controls nodes/edges through `nodeReducer`/`edgeReducer`
driven by refs (used for Phase 1B filtering and hover/select). Repo X-Ray adds a
`scanState` (detected id set + per-node status) that the reducers read to:

- draw a status **outline/halo** (confirmed=green, declared=blue, inferred=amber,
  related=neutral) while keeping the node's **domain color** and position;
- dim nodes/edges not in the scan set;
- highlight existing edges between detected nodes.

No new renderer, no layout recompute, no mutation of canonical attributes — the same
discipline as the filter overlay. Exiting restores prior state and camera.

New frontend pieces: `RepoXrayPanel.tsx` (entry + input + summary), a small
`scanState`/hook in `App.tsx`, an evidence section in `NodeDetailsPanel.tsx`, and
`api/client.ts` methods for the scan endpoints. Everything keyboard-accessible + responsive.

## 6. Data contract

Scan result shape per spec §11 (scan_id, status, repository{owner,name,url,default_branch,
commit_sha}, summary counts, coverage{files_inspected,partial,truncated}, detections[]
{node_id,node_type,role,detection_status,evidence_ids,component_path?}, evidence[]
{id,type,file_path,description,source_url,rule,scanner_version}, unmapped[]). Pydantic
models mirror it; the frontend derives graph highlights from `detections` + existing graph
data (no separate highlight endpoint needed for MVP — spec §12.2).

## 7. Security / integrity posture (spec §17)

Server-side-only GitHub calls; strict owner/repo allowlisting; no general URL fetch / no
SSRF / no redirect-following to unknown hosts; never execute code or install deps; bounded
requests/files/bytes/time; exclude binaries and vendored/generated dirs; safe manifest
parsing (no unsafe deserialization); don't persist full source or likely-secret content;
rate-limit anonymous submissions. Repository content is untrusted data end to end.

## 8. Caching & lifecycle (spec §13, §12.3/§12.4)

Cache key = `repo_id + commit_sha + scanner_version + mapping_version`; hit → return stored
result; miss → bounded scan → store. Results stay tied to their commit (a newer default
branch does not overwrite an older result's identity). MVP execution is
synchronous-with-cache under short budgets, but the API is shaped as `scan_id` + polled
`status` so it can move to a bounded background job later with no frontend change.

## 9. Static-deploy reality

The public site is static GitHub Pages (no backend), so the scanner cannot run there. The
Repo X-Ray entry point is **hidden unless a scanner API base URL is configured**
(`VITE_SCANNER_API`); with the full backend (local/other host) it is enabled. This keeps the
live Pages site working and honest rather than showing a button that always errors.

## 10. What this architecture refuses

A second graph, duplicated node catalogs, auto-created nodes/edges, recoloring away domain
identity, layout changes during scans, LLM-based detection, code execution, frontend-held
tokens, and fabricated confidence/progress. Each is called out as a hard "do not" in the
spec (§25) and is excluded by construction here.
