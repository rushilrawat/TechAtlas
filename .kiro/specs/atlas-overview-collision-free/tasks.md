# Implementation Plan

This plan fixes the three default-overview visual defects (overlapping circles, ordinary-edge web, colliding/clipped/panel-occluded labels) via the five fix layers + the visual-proof harness described in `design.md`, using the exploratory bugfix methodology: surface the defect with a failing measurement harness FIRST, establish the preservation baseline, THEN implement the layered fix and verify both the fix and every preserved behavior.

- Bug Condition (C): `isBugCondition(X) = visibleCircleIntersections(X) > 0 OR ordinaryEdgesVisible(X) > 0 OR priorityLabelCollisions(X) > 0 OR importantContentBehindPanels(X) > 0`, measured in screen space via `window.__ta_sigma`.
- Property 1 (Fix-Checking): for all buggy overview states, all four metrics = 0, all 607 nodes accounted for, 14-domain ring preserved, aggregate markers carry accurate counts.
- Property 2 (Preservation): for all non-buggy inputs (`¬C(X)`), fixed output equals original — accepted aesthetics, canonical 607/1116 truth, interactions, and all test gates unchanged.

---

- [x] 1. Write bug condition exploration test (visual-proof harness, run on UNFIXED code)
  - **Property 1: Bug Condition** - Collision-Free, Edge-Free, Clean-Label Overview
  - **CRITICAL**: This test MUST FAIL on the current (unfixed) overview — failure confirms the defect exists. **DO NOT attempt to fix the test or the code when it fails here.**
  - **NOTE**: This harness encodes the expected overview behavior; it becomes the fix validator in task 8.2 when it passes after implementation.
  - **GOAL**: Surface counterexamples that demonstrate `isBugCondition(X)` is true at the default Explore overview.
  - **Scoped PBT Approach**: The bug is deterministic per viewport class, so scope the property to the five concrete measured viewports: 1440x900, 1920x1080, 768, 390x844, 390x667. For each, the property "all four overview metrics = 0" must hold — on unfixed code at least one is > 0.
  - Create `frontend/e2e/overview-visual-proof.spec.ts` and `frontend/playwright.overview.config.ts` (modeled on `playwright.stackview.config.ts`): point at the `dist-xray-test` bundle on port 4180, `PW_CHANNEL=chrome`, swiftshader GL args, `reuseExistingServer`, reusing `serve-dist-xray-test.mjs`. Add a `frontend/package.json` script `e2e:overview` mirroring `e2e:stackview`. No new dependencies.
  - For each viewport: load the default Explore overview, wait for `window.__ta_sigma`, let `fitExplore` settle (overview band, no selection), and measure via the live renderer (Design → Testing Strategy → Integration Tests, Layer 6):
    - `visibleNodeCount` — nodes with defined `getNodeDisplayData`, not hidden, not an aggregated member; markers count as shown.
    - `aggregatedNodeCount` — sum of `member_ids.length` across active aggregate markers.
    - `visibleCircleIntersections` — for every visible pair A,B project centers with `graphToViewport` and read screen radius from display `size`; count pairs with `distance < rA + rB + visualGap` (visualGap ~= 8px); spatial-grid the candidates (not naive O(n^2)).
    - `priorityLabelCollisions` — overlapping rendered-label boxes (measured `Inter 12px`) + label-node intersections.
    - `importantContentBehindPanels` — rendered labels/markers whose box intersects `.legend` / `#graph-filters, .filter-panel` rects or extends past the viewport.
    - `ordinaryEdgesVisible` — edges whose `getEdgeDisplayData(key)` is not `hidden` at overview.
  - Assert (the eventual fix target): desktop (1440x900, 1920x1080) all four metrics = 0; mobile (390x844, 390x667) `visibleCircleIntersections = 0` on the shown representation; all viewports `visibleNodeCount + aggregatedNodeCount = 607`.
  - Build/serve the CURRENT unfixed `dist-xray-test` and run `e2e:overview`.
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists).
  - Document counterexamples found to understand root cause (expect: overlapping rendered circles in Robotics/AI-ML sectors at overview ratio; non-zero ordinary edges; colliding/clipped labels — confirming the Hypothesized Root Cause).
  - Mark task complete when the harness is written, run on unfixed code, and the failures/counterexamples are documented.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Overview-Defect Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — record actual behavior on UNFIXED code for non-buggy (`¬C(X)`) inputs, then assert it so the fix cannot change it.
  - Establish the baseline by running the full existing gate on UNFIXED code and recording results (these are the preservation oracle):
    - backend `pytest` (205) + `ruff` on `app tests ../scripts`.
    - frontend `tsc` + `eslint --max-warnings=0` + `vitest` (73).
    - dataset `validate --require-targets` (607/1116).
    - Stack View regression playwright (18, `dist-xray-test` on 4180, `PW_CHANNEL=chrome`).
    - smoke playwright (5, `dist` on 4178).
    - xray e2e playwright (4, `dist-xray` on 4179).
    - deploy-bundle check: `__ta_sigma` occurs 0 times in `dist-xray` (deploy) bundle.
  - Observe and record specific non-buggy behaviors on unfixed code (to re-assert identically after the fix):
    - Selecting a technology reveals its canonical incident edges from the 1116 (3.10).
    - Selecting Robotics highlights 29 members, anchor shown separately, NO membership-edge web (3.6, 3.8); AI/ML highlights full members-only set, no web (3.9).
    - Repo X-Ray → Stack View projection and restore-to-default-atlas on return (3.4, 3.11).
    - Sidebar members-only counts (Robotics = 29) and the 14-domain ring (3.6).
  - Add/extend property-based preservation units (vitest) capturing universal `¬C(X)` properties:
    - For random selection states: edges hidden iff (overview band AND no selection AND not X-Ray), shown otherwise (reappearance preserved, 3.5, 3.10).
    - For random viewport sizes in the five classes: `visibleCount + aggregatedCount = 607` always (no node discarded, 2.7) — initially trivially true pre-fix (all individual), must stay true post-fix.
  - Run these tests + the full gate on UNFIXED code.
  - **EXPECTED OUTCOME**: All pass (this confirms the baseline behavior to preserve).
  - Mark task complete when the preservation tests/baseline are written, run, and green on unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [x] 3. Fix Layer 1 (data) — deterministic LOD aggregation in the layout generator
  - _Design: Fix Implementation → Layer 1 + Layer 4; Files to Change → `scripts/generate_layout.py`, `data/layout.json`, `scripts/validate_dataset.py`_

  - [x] 3.1 Add unit tests for `overview_aggregates` generation + membership integrity (TDD, write first)
    - Assert the generator emits an ADDITIVE top-level `overview_aggregates` key; the 607 individual coordinates and `layout_version` are byte-for-byte unchanged.
    - Assert per domain: union of all marker `member_ids` equals that domain's members-only set (`domainMemberIds`); each marker `count == len(member_ids)`; Robotics members-only = 29 with the anchor excluded and kept as an individual node on the ring.
    - Assert global integrity: `union(all aggregate member_ids) ∪ {individually-shown ids} == all 607`, each id appearing exactly once (aggregated XOR individual), none discarded.
    - Assert determinism/idempotence: regenerating with the committed `layout.json` present reproduces identical output (regenerate-and-diff).
    - Run tests → expect FAIL (feature not yet implemented).
    - _Requirements: 2.7, 3.5, 3.6_

  - [x] 3.2 Implement `overview_aggregates` emission in `scripts/generate_layout.py`
    - After the existing shell-fan + `_resolve_overlaps` pass, decide per sector/outer-shell (for the fixed overview camera ratio, using shared `sizing.py` radii + `fitExplore` framing params + fixed target ratio and visualGap) which members cannot fit with `>= rA + rB + visualGap` spacing in screen space; collapse those into aggregate markers `{ id, x, y, radius, domain_id, member_ids[], count }` positioned at the sector/shell centroid.
    - Keep each domain anchor as an individual node on the ring (ring preserved); aggregate MEMBERS only.
    - Emit `overview_aggregates` as an additive key keyed by the same `layout_version`; DO NOT change, remove, or reorder any individual coordinate; DO NOT modify `graph.json`.
    - Add the generation-time membership-integrity assertion (3.1's global/per-domain invariants) inside the generator so corruption fails the build.
    - Use only deterministic inputs (committed coordinates + fixed constants + seeded jitter already deterministic); no new randomness.
    - _Bug_Condition: isBugCondition(X) — `visibleCircleIntersections(X) > 0` from dense-sector packing at overview ratio_
    - _Expected_Behavior: Property 1 — aggregation yields 0 intersections, all 607 accounted for, ring preserved, markers carry accurate counts_
    - _Preservation: canonical 607/1116, IDs, membership, members-only counts, deterministic layout unchanged (Property 2)_
    - _Requirements: 2.1, 2.2, 2.7, 3.5, 3.6_

  - [x] 3.3 Regenerate `data/layout.json` and (if touched) extend `scripts/validate_dataset.py`
    - Regenerate `data/layout.json` so it contains `overview_aggregates` with individual coordinates and `layout_version` unchanged; verify idempotence (regenerate again → no diff).
    - If `scripts/validate_dataset.py` is touched, ONLY add an assertion that `union(aggregate member_ids) ∪ individual == 607` and members-only agreement; MUST NOT change the `607/1116 --require-targets` contract.
    - Run task 3.1 unit tests → expect PASS. Run dataset `validate --require-targets` (607/1116) → expect PASS.
    - _Requirements: 2.7, 3.5, 3.6, 3.12_

- [x] 4. Fix Layer 1 (frontend data) — ingest aggregates in `buildGraph.ts`
  - _Design: Fix Implementation → Layer 1 "Frontend consumption"; Files to Change → `frontend/src/graph/buildGraph.ts`_
  - [x] 4.1 Add vitest unit coverage for aggregate ingestion (TDD, write first)
    - Assert `buildGraph` still builds exactly 607 individual nodes + 1116 edges (canonical graph unchanged).
    - Assert each `overview_aggregates` marker is added as a separate node with `isAggregate = true`, carrying its `member_ids`/`count`; a members helper mirrors `domainMemberIds` for markers.
    - Assert union of aggregated + individual ids = 607, no duplicates.
    - Run → expect FAIL.
    - _Requirements: 2.7, 3.5, 3.6_
  - [x] 4.2 Implement aggregate-marker ingestion in `buildGraph.ts`
    - Build all 607 canonical nodes + 1116 edges exactly as today; additionally add aggregate markers as `isAggregate` nodes with `member_ids`/`count` so Sigma's existing node program, hit-testing, label, and click plumbing are reused (no new render program).
    - Run task 4.1 units → expect PASS.
    - _Bug_Condition: isBugCondition(X) — overlap when 607 individuals cannot fit_
    - _Expected_Behavior: Property 1 — markers available for overview, all 607 accounted for_
    - _Preservation: 607/1116 canonical graph unchanged (Property 2)_
    - _Requirements: 2.2, 2.7, 3.5_

- [x] 5. Fix Layer 1 (render) — overview LOD behavior + expansion in `GraphCanvas.tsx`
  - **Property 1: Expected Behavior** - Collision-free overview via LOD markers
  - _Design: Fix Implementation → Layer 1 render behavior + Layer 4 expansion; Files to Change → `frontend/src/components/GraphCanvas.tsx`, `frontend/src/graph/semanticZoom.ts`_
  - In the node reducer: when `bandOf(ratioRef.current) <= 1` AND no selection (`activeRef.current == null`) AND not Repo X-Ray/Stack View (`scanStatus == null`), set `res.hidden = true` for aggregated member nodes and render the aggregate markers instead (sized/placed from precomputed `radius`/`x`/`y`).
  - Expansion: when the camera ratio crosses below the overview band (zoom in), OR the user clicks/focuses an aggregate, OR selects its domain in the legend, stop hiding that domain's members and hide the marker — individual nodes appear (progressive zoom reveal preserved). Reuse existing `RATIO_UNIVERSE`/`RATIO_DOMAIN` band thresholds from `semanticZoom.ts`; introduce NO new magic ratios.
  - Keep `fitExplore` framing at ratio ~1 (no over-zoom escape hatch); markers legibly sized. Dense domains (Robotics, AI/ML) aggregate first — eliminating the crammed-narrow-arc defect while keeping the ring intact (anchor on ring, marker in wedge).
  - Scope strictly so interaction / Stack View / X-Ray paths are untouched.
  - _Bug_Condition: isBugCondition(X) — `visibleCircleIntersections(X) > 0`, dense-sector crowding (1.1, 1.2, 1.6, 1.7)_
  - _Expected_Behavior: Property 1 — 0 intersections at overview, markers expand on zoom/focus, 607 accounted for, ring preserved (2.1, 2.2, 2.6, 2.7)_
  - _Preservation: progressive zoom reveal, domain highlighting without webs, pan/zoom/reset/resize (3.7, 3.8, 3.9, 3.11)_
  - _Requirements: 2.1, 2.2, 2.6, 2.7, 3.7, 3.11_

- [x] 6. Fix Layer 2 — zero ordinary edges at overview via edge-reducer state gate
  - **Property 1: Expected Behavior** - Edge-free overview
  - _Design: Fix Implementation → Layer 2; Files to Change → `frontend/src/components/GraphCanvas.tsx`_
  - [x] 6.1 Extend/refresh vitest coverage for the edge gate predicate (TDD, write/adjust first)
    - Assert: for random states, ALL ordinary edges (every `relationship_type`: intra-domain, cross-domain, `belongs_to_domain`, `has_subdomain`) are `hidden` iff `scanStatus == null` AND `activeRef.current == null` AND `bandOf(ratioRef.current) <= 1`; shown/active otherwise.
    - Run → expect FAIL (or adjust from task 2's baseline property).
    - _Requirements: 2.3, 3.5, 3.10_
  - [x] 6.2 Implement the overview edge gate in the `edgeReducer`
    - At overview-no-selection, return `{ ...dataIn, hidden: true }` for all ordinary edges (true hidden, not faint alpha → `ordinaryEdgesVisible = 0`).
    - Preserve show conditions: technology selected → incident edges render as `ACTIVE_EDGE` (genuine canonical relationships); domain selected → highlight members via `domainMemberIds` with NO `belongs_to_domain`/`has_subdomain` web; only the anchor's genuine incident edges follow the normal active rule. Scope the gate to `bandOf(ratio) <= 1` so zoomed-in appearance is unchanged.
    - All 1116 edges remain in the Graphology graph (nothing deleted); they reappear on interaction/zoom.
    - Run task 6.1 units → expect PASS.
    - _Bug_Condition: isBugCondition(X) — `ordinaryEdgesVisible(X) > 0` (1.3)_
    - _Expected_Behavior: Property 1 — `ordinaryEdgesVisible = 0` at overview, 1116 retained (2.3)_
    - _Preservation: reappearance on selection/zoom, no membership web (3.5, 3.8, 3.9, 3.10)_
    - _Requirements: 2.3, 3.5, 3.8, 3.9, 3.10_

- [x] 7. Fix Layer 3 — collision-free priority labels via measured screen-space placement
  - **Property 1: Expected Behavior** - Clean, panel-aware labels
  - _Design: Fix Implementation → Layer 3; Files to Change → `frontend/src/graph/semanticZoom.ts`, `frontend/src/components/GraphCanvas.tsx`_
  - [x] 7.1 Add tests for label priority ordering + conflict resolution (TDD, write first)
    - Unit: `semanticZoom.labelPriority` overview order is deterministic — selected > hovered > domain anchors (members-only count desc, id asc) > aggregate markers (count desc) > large hubs (`size >= 18`) > others (not labelled); deterministic tie-breaks.
    - Property-based: for random overview marker/node sets, the placement pass yields ZERO overlapping kept-label boxes and zero label-node intersections (screen-space inequality holds for all generated configs).
    - Run → expect FAIL.
    - _Requirements: 2.4, 2.5_
  - [x] 7.2 Implement the placement pass and reducer integration
    - Extend `labelPriority` for the overview order above. On overview label-set/camera change (NOT per frame), walk candidates in priority order, projecting each to screen via `graphToViewport`, compute the label box (canvas `measureText` at `Inter 12px`), and keep a label only if its box does not overlap any kept label box, any visible node's rendered circle, the `.legend` / `#graph-filters, .filter-panel` rects (read as `fitExplore` does), or the viewport bounds; drop the lower-priority label on conflict. Kept labels get `forceLabel = true`; suppressed get `res.label = ""`. Never force-render all labels. Aggregate markers are candidates (domain name + count); hidden aggregated members contribute no boxes.
    - Run task 7.1 tests → expect PASS.
    - _Bug_Condition: isBugCondition(X) — `priorityLabelCollisions(X) > 0` and `importantContentBehindPanels(X) > 0` (1.4, 1.5)_
    - _Expected_Behavior: Property 1 — `priorityLabelCollisions = 0`, `importantContentBehindPanels = 0` (2.4, 2.5)_
    - _Preservation: no force-render-all; progressive label reveal on zoom (3.7)_
    - _Requirements: 2.4, 2.5, 3.7_

- [x] 8. Fix Layer 5 — sector backplate non-overlap (presentation only)
  - _Design: Fix Implementation → Layer 5; Files to Change → `frontend/src/components/GraphCanvas.tsx`, `frontend/src/styles.css`_
  - [x] 8.1 Tune the SVG backdrop so adjacent sector gradients do not wash into a color splash
    - Reduce the radial-gradient outer-stop opacities (from `0.16 / 0.07 / 0`) and/or tighten each sector's projected radius (`gr = maxd + 60`); optionally cap max compounded opacity. Presentation-only constants; keep all sectors, the 14-color palette, and camera-sync behavior unchanged. Add/extend a vitest assertion that backdrop constants stay within the accepted band (sectors present, palette unchanged).
    - _Bug_Condition: isBugCondition-adjacent — backplate wash degrades the overview_
    - _Expected_Behavior: softer non-overlapping backplates (supports Property 1 clean overview)_
    - _Preservation: palette + sectors + camera sync unchanged (3.1, 3.2, 3.11)_
    - _Requirements: 3.1, 3.2, 3.11_

- [x] 9. Verify bug condition exploration test now passes + preservation holds
  - [x] 9.1 Re-run the SAME visual-proof harness from task 1 (do NOT write a new test)
    - **Property 1: Expected Behavior** - Collision-Free, Edge-Free, Clean-Label Overview
    - Build/serve the FIXED `dist-xray-test` on 4180 and run `e2e:overview` across all five viewports.
    - **EXPECTED OUTCOME**: Test PASSES — desktop (1440x900, 1920x1080) `visibleCircleIntersections = 0`, `priorityLabelCollisions = 0`, `ordinaryEdgesVisible = 0`, `importantContentBehindPanels = 0`; mobile (390x844, 390x667) `visibleCircleIntersections = 0` on the LOD representation; all viewports `visibleNodeCount + aggregatedNodeCount = 607`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_
  - [x] 9.2 Re-run the SAME preservation tests from task 2 (do NOT write new tests)
    - **Property 2: Preservation** - Non-Overview-Defect Behavior Unchanged
    - **EXPECTED OUTCOME**: All preservation tests still PASS (no regressions) — edge reappearance, domain highlight without webs, Stack View restore, counts/ring, deploy-bundle hook absence all identical to the task-2 baseline.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [x] 10. Checkpoint — run the full existing gate green (verification/QA-only)
  - Run and confirm ALL pass (ask the user if questions arise):
    - backend `pytest` (205) + `ruff` on `app tests ../scripts`.
    - frontend `tsc` + `eslint --max-warnings=0` + `vitest` (73).
    - dataset `validate --require-targets` (607/1116).
    - Stack View regression playwright (18, `dist-xray-test` on 4180, `PW_CHANNEL=chrome`).
    - smoke playwright (5, `dist` on 4178).
    - xray e2e playwright (4, `dist-xray` on 4179).
    - new overview visual-proof playwright (5 viewports, `dist-xray-test` on 4180, `PW_CHANNEL=chrome`).
    - deploy-bundle check: `__ta_sigma` occurs 0 times in the `dist-xray` (deploy) bundle (3.13).
  - _Requirements: 3.12, 3.13, 3.14_

- [x] 11. Capture before/after evidence, hold deploy, commit separately (verification + handoff)
  - Capture actual desktop (1440x900, 1920x1080) and mobile (390x844, 390x667) screenshots of the default overview for before/after review; attach the harness metric report (six metrics per viewport).
  - **DO NOT deploy** — await explicit user review/approval of the collision-free correction.
  - Commit this collision-free correction SEPARATELY from commits `40fdb24` and `01a6cae` (keep the accepted aesthetic redesign history intact).
  - _Requirements: 2.8, 2.9, 3.14_

---

## Task Dependency Graph

```
1 (exploration harness — FAILS on unfixed)   2 (preservation baseline — PASSES on unfixed)
        \                                       /
         \                                     /
          v                                   v
        3 (Layer 1 data: generate_layout + layout.json)
          |
          v
        4 (Layer 1 frontend data: buildGraph ingest)
          |
          v
        5 (Layer 1 render: GraphCanvas LOD + expansion)
          |
   +------+-----------------------------+
   |              |                      |
   v              v                      v
 6 (Layer 2    7 (Layer 3            8 (Layer 5
   edges)        labels)               backplate)
   |              |                      |
   +------+-------+----------+-----------+
          |                  |
          v                  v
        9.1 (re-run        9.2 (re-run
         task 1 harness      task 2 preservation
         → PASSES)           → still PASSES)
          \                  /
           \                /
            v              v
             10 (full gate green — QA only)
                     |
                     v
             11 (screenshots, hold deploy, separate commit)
```

### Execution Waves

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "dependsOn": [] },
    { "wave": 2, "tasks": ["3"], "dependsOn": ["1", "2"] },
    { "wave": 3, "tasks": ["4"], "dependsOn": ["3"] },
    { "wave": 4, "tasks": ["5"], "dependsOn": ["4"] },
    { "wave": 5, "tasks": ["6", "7", "8"], "dependsOn": ["5"] },
    { "wave": 6, "tasks": ["9"], "dependsOn": ["6", "7", "8"] },
    { "wave": 7, "tasks": ["10"], "dependsOn": ["9"] },
    { "wave": 8, "tasks": ["11"], "dependsOn": ["10"] }
  ]
}
```

Dependency notes:
- Tasks **1** and **2** are independent and come FIRST (exploration + preservation baseline on unfixed code).
- Layer 1 is sequential: **3 → 4 → 5** (data generation → frontend ingest → render behavior) because each consumes the previous artifact.
- Layers **6, 7, 8** depend on **5** (overview-state render scaffolding) but are independent of each other and may proceed in parallel.
- **9.1 / 9.2** require all fix layers (**5, 6, 7, 8**) complete.
- **10** (QA-only) requires **9.1/9.2**; **11** (handoff) requires **10**.

Task classification:
- Implementation: **3.2, 3.3, 4.2, 5, 6.2, 7.2, 8.1**.
- Test-authoring (TDD, write before/with impl): **1, 2, 3.1, 4.1, 6.1, 7.1**.
- Verification / QA-only: **9.1, 9.2, 10**.
- Handoff (evidence + commit, no code change): **11**.
- Optional: extending `scripts/validate_dataset.py` in **3.3** is optional (only if touched) and MUST NOT change the 607/1116 `--require-targets` contract.
