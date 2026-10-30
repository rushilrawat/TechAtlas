# Tasks — TechAtlas Phase 1.5: Repo X-Ray

Derived from `requirements.md` and `design.md`, mirroring the spec's 1.5A–D roadmap.
**No task starts until the reviewer approves this spec** and resolves the open questions
(static-deploy strategy, sync-vs-background, GITHUB_TOKEN availability, cache storage,
Isolated Stack View scope).

## Conventions

- Overlay only: never rebuild/relayout the graph or mutate canonical node/edge data.
- Deterministic static analysis; no LLM; never execute repo code or install deps.
- GitHub token server-side; scans bounded + commit-keyed cached; results may be partial.
- Fetchers tested against **mocked** GitHub responses; no live network in CI.
- Additive + backward compatible; existing Phase 0–1D tests stay green.
- `[ ]` not started. `_Requirements:` tags reference `requirements.md`.

## Gating

- **Phase 1.5A: DONE** (approved; 5 decisions finalized). 1.5B–D remain planned.

---

## Phase 1.5A — Scanner foundation (backend; no UI redesign)

### 1. Scan result schema + models
- [x] Pydantic `RepoScan`, `ScanRepository`, `Detection`, `Evidence`, `ScanCoverage`,
      `UnmappedPackage` in `backend/app/scanner/models.py`; mirror in `types.ts` later.
- _Requirements: 2.2, 10 (status categories), 11 (data model)_

### 2. GitHub client (bounded, server-side)
- [x] `scanner/github_client.py`: injectable httpx client, auth header from `GITHUB_TOKEN`,
      request budget, retry, primary+secondary rate-limit detection, clear errors.
- [x] Tests against mocked responses incl. rate-limit + error paths.
- _Requirements: 7.2, 7.3, 7.5, NFR-2, NFR-4_

### 3. Repository resolver (validate + commit identity)
- [x] `scanner/repository_resolver.py`: normalize URL variants → owner/repo; server-side
      allowlist (reject non-GitHub/IP/local/malformed/query-host); confirm public via API;
      resolve default branch → commit SHA.
- [x] Unit tests incl. the rejection cases and dotted/hyphenated names.
- _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.6_

### 4. Tree inspection + relevant-file selection
- [x] `scanner/tree_inspector.py`: recursive tree fetch; handle `truncated` (selective
      subtree fetch); select manifests/lockfiles/configs + bounded source set; exclude
      binary/vendored/generated; enforce file/byte/count budgets; mark partial.
- [x] Tests incl. truncated tree + budget cutoff → partial.
- _Requirements: 2.1, 7.2, 10.4_

### 5. Manifest parsers — JS/TS + Python (MVP)
- [x] `scanner/manifest_parsers/{js.py,python.py}`: parse deps/lockfiles/configs; direct vs
      transitive where supported; emit raw detections + evidence (declared/confirmed).
- [x] Source import scan in `scanner/source_analyzer.py` for confirmed usage.
- [x] Tests incl. direct-vs-transitive and name normalization (torch, opencv-python, sklearn).
- _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7_

### 6. Docker + GitHub Actions detection
- [x] `scanner/manifest_parsers/{docker.py,ci.py}`: Dockerfile*/compose*, `.github/workflows/*`.
- _Requirements: 2.5, 3.1, 3.3_

### 7. Canonical matching (reuse Phase 1D data)
- [x] `scanner/technology_matcher.py`: reverse indexes from node `package`/`repo`/`aliases`
      via GraphService; priority resolution; ecosystem-qualified (no loose substring);
      unmapped → `UnmappedPackage`.
- [x] Tests incl. negative cases (substring, README-only) and unmapped.
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 2.7_

### 8. Concept inference (conservative)
- [x] `scanner/concept_inference.py`: evidence-backed rules → existing concept nodes only;
      no capability→concept leaps.
- [x] Tests: Dockerfile→containerization; AI-SDK ↛ RAG; PyTorch ↛ training.
- _Requirements: 3.1, 3.2, 3.3, 3.4_

### 9. Evidence + orchestrator
- [x] `scanner/evidence_service.py` (consolidate; commit-pinned source URLs) +
      `scanner/scan_orchestrator.py` (pipeline, budgets, timeout, assemble `RepoScan`).
- [x] End-to-end backend test on fixtures (no network).
- _Requirements: 2.2, 6.2, 7.2, 7.4_

**1.5A deliverable: DELIVERED.** `POST /api/v1/repository-scans` returns evidence-backed,
canonically-matched detections with coverage + caching. 120 backend tests pass
(36 scanner), ruff clean. See docs/development-setup.md 'Repo X-Ray scanner'.

---

## Phase 1.5B — Graph highlight integration (frontend overlay)

### 10. Scan API wiring + state
- [x] `/api/v1/repository-scans` routes in `main.py`; `api/client.ts` `scanRepository` +
      `getScan`; `types.ts` models; `mode` + `scanState` in `App.tsx`.
- _Requirements: 5.7, 8.3_

### 11. Entry point + input + loading/error
- [x] `RepoXrayPanel.tsx` entry in header (gated on `VITE_SCANNER_API`); input with
      client-side validation; real lifecycle labels / indeterminate loader (no fake %);
      error states per spec §16.
- _Requirements: 1.1, 4 (input), 7.4, 7.5, 7.7_

### 12. Reducer-based overlay
- [x] Extend `GraphCanvas` reducers to read `scanState`: status outline/halo (separate
      channel; domain color preserved), dim non-scan, highlight existing edges between
      detected nodes; reduced-motion-aware reveal; no relayout/mutation.
- [x] Camera "Focus on Stack" + fit with padding; "Back to Universe" restores state+camera.
- [x] Vitest: highlight set applied, domain color unchanged, exit restores, no relayout.
- _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 8.1_

### 13. Summary panel
- [x] Categorized detected-stack summary; click row → focus node; unmapped section.
- _Requirements: 5 (summary), 6.4, 4.4_

**1.5B deliverable: DELIVERED.** Repo X-Ray UI overlays detections on the existing
graph (status rings, dimming, highlighted existing edges), with a summary panel, evidence
in the detail panel, Focus Stack, and exit/restore. Gated on VITE_SCANNER_API. 33 unit +
7 Playwright e2e tests; real GitHub scan validated on expressjs/express.

---

## Phase 1.5C — Evidence & accuracy

### 14. Evidence inspector in detail panel
- [ ] "Found in this repository" section in `NodeDetailsPanel.tsx`: status + evidence list
      with commit-pinned GitHub links; accurate declared-vs-confirmed language.
- [ ] Frontend tests (present/absent/link correctness).
- _Requirements: 6.1, 6.2, 6.3, 6.4_

### 15. Coverage, more parsers, monorepo, false-positive tests
- [ ] Coverage reporting surfaced in UI; Rust/Java/Go parser modules (graceful absence);
      per-component path association for monorepos; alias improvements; false-positive tests.
- _Requirements: 2.5, 2.4, 10.4, 19, 21_

**1.5C deliverable:** explainable, evidence-backed detection.

---

## Phase 1.5D — Production hardening

### 16. Cache + rate limits + budgets + resilience
- [ ] `scanner/scan_cache.py` (commit-keyed JSON cache, gitignored); anonymous-submission
      rate limiting; timeouts/budgets enforced; truncated-tree handling; background
      execution if needed; GitHub error handling; abuse protection; large-repo + mobile
      tests; docs + deploy/validate.
- _Requirements: 7.1, 7.2, 7.3, 7.6, 18, 8.1_

**1.5D deliverable:** production-ready Repo X-Ray integrated into TechAtlas.

---

## Done-definition (MVP acceptance, spec §24)

Existing features unchanged; paste public repo → validated → metadata+commit recorded →
languages + JS/TS + Python deps + Docker + Actions detected → mapped to canonical nodes →
highlighted with domain colors preserved and unrelated dimmed → categorized summary →
click node shows evidence with correct commit-pinned links → unmapped handled → partial
labeled → loading/error states → exit restores graph → no code executed → token
server-side → scans bounded → parser + frontend tests pass → desktop + mobile → docs
updated. No fabricated detections/edges/nodes/percentages.
