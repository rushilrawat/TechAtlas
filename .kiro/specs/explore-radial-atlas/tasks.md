# Implementation Plan: Explore-view Radial Atlas Redesign

## Overview

This plan implements the two-level radial cluster layout redesign for TechAtlas in a safe, incremental order that keeps the full test suite green at every merge point. The implementation proceeds in four phases:

1. **Research gate** — confirm `@sigma/edge-curve` availability before writing any code (Task 1).
2. **Python layout algorithm** — new `generate()` function with geometry (Task 2) and edge-tier scoring (Task 3), fully covered by property tests before touching anything frontend-facing.
3. **API threading** — `edge_tiers` and `ring` fields flow from `layout.json` through the backend models and static build (Task 4) and then through the frontend TypeScript types and `buildGraph.ts` (Task 5).
4. **Renderer** — LOD aggregate system removed and ring-opacity applied (Task 6), curved edges registered (Task 7), edge-tier visibility wired into the `edgeReducer` (Task 8), visual-proof harness updated (Task 9), and a full verification gate (Task 10) before screenshots and commit (Tasks 11–12).

No frontend code is modified until Tasks 5–8. No visual-proof assertions are changed until the implementation is verified in Task 10.

---

## Tasks

- [ ] 1. Research: Confirm `@sigma/edge-curve` package availability
  - Run `npm info @sigma/edge-curve` and record: existence, license, weekly downloads, gzipped bundle size.
  - Decision gate: if the package exists, is MIT licensed, has ≥1000 weekly downloads, and gzipped size ≤15 KB → plan to use it in Task 7a.
  - Otherwise → plan to implement the fallback `edgeCurveProgram.ts` in Task 7b.
  - Document the decision as a comment at the top of `frontend/src/graph/buildGraph.ts` (e.g. `// curved-edge strategy: @sigma/edge-curve` or `// curved-edge strategy: fallback edgeCurveProgram.ts`).
  - No code changes beyond the one-line comment. This is a decision gate for Task 7.
  - _Requirements: 6.1, 6.3, 15.4_

- [ ] 2. Python layout algorithm — core geometry (TDD: tests first, then implementation)
  - [ ] 2.1 Write property tests for core geometry in `backend/tests/test_layout_radial.py`
    - **Property 1: Coordinate completeness** — assert all 607 node IDs appear in `output["coordinates"]` with finite, non-NaN `x` and `y`.
    - **Property 2: Layout determinism** — call `generate(dataset)` twice; assert outputs are bit-identical after JSON round-trip.
    - **Property 3: Ring assignment monotonicity** — for each domain, assert nodes with `intra_deg >= RING1_THRESH` are in Ring 1; nodes with `intra_deg < RING2_THRESH` are in Ring 3.
    - **Property 4: MacroRing anchor placement** — for each top-level domain anchor, assert `abs(hypot(x, y) - MACRO_RING_R) <= OVERLAP_MARGIN + 10`.
    - **Property 5: Angular collision freedom** — for a sample of ≥3 domains, assert min angular gap × ring radius ≥ `2*r_i + 2*r_{i+1} + GAP_PX` for each adjacent pair in each ring.
    - _Requirements: 1.1, 2.2, 2.3, 2.4, 2.5, 4.3, 4.4, 5.1, 5.2_

  - [ ] 2.2 Implement the new `generate()` function in `scripts/generate_layout.py`
    - Replace the existing `generate()` body with the ten-step two-level-radial-cluster pipeline (Steps 1–6 from the design: domain classification, macro-ring placement, cluster radii, ring assignment, subdomain sub-clusters, angular assignment).
    - Add new configurable constants: `MACRO_RING_R`, `CLUSTER_R1`, `CLUSTER_R2`, `CLUSTER_R3`, `RING1_THRESH`, `RING2_THRESH`, `GAP_PX`.
    - Preserve unchanged: `_resolve_overlaps()`, `sizing.py` imports, `main()`, `DATASET` / `OUTPUT` path constants.
    - Remove old helpers: `_bh_force`, `_QuadNode`, `_order_domains`, `_build_overview_aggregates`.
    - Output `layout.json` with `"layout_algorithm": "two-level-radial-cluster"`, `coordinates` with `ring` field per node, `"edge_tiers": {}` (left empty — filled in Task 3), `"overview_aggregates": []`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 12.1, 12.2_

  - [ ]* 2.3 Run tests and verify output
    - Run `pytest backend/tests/test_layout_radial.py` → all new property tests must pass.
    - Run full backend pytest suite → all existing tests must still pass.
    - Run `ruff check scripts/generate_layout.py` → no violations.
    - Run `python scripts/generate_layout.py` → confirm `data/layout.json` has 607 coordinate entries, each with a `ring` field; confirm `edge_tiers` is `{}` and `overview_aggregates` is `[]`.
    - _Requirements: 14.1_

- [ ] 3. Python layout algorithm — edge priority scoring and tier assignment (TDD)
  - [ ] 3.1 Write property tests for edge tier assignment in `backend/tests/test_layout_radial.py`
    - **Property 6: Edge tier completeness and exclusivity** — assert `len(output["edge_tiers"]) == 1116` and all values ∈ `{"TierA", "TierB", "TierC", "TierD"}`.
    - **Property 7: TierA assignment correctness** — for every `has_subdomain` edge, assert tier is `"TierA"`; for every `belongs_to_domain` edge whose target is in Ring 1, assert tier is `"TierA"`.
    - **TierC cap** — assert total TierC edge count ≤ `TIER_C_CAP` (20).
    - **Overview visible edge count** — assert TierA + TierB + TierC count is between 100 and 170 inclusive.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

  - [ ] 3.2 Implement Step 7 (EdgePriority scoring and tier assignment) in `generate_layout.py`
    - Add `EP_W1`–`EP_W5`, `TIER_C_THRESHOLD`, `TIER_C_CAP`, `TIER_B_PER_DOMAIN` configurable constants.
    - Compute `EdgePriority` per edge using the five-component formula from the design.
    - Tier assignment pass: TierA first (first match wins), then TierB (top `TIER_B_PER_DOMAIN` intra-domain by EdgePriority), then TierC (top `TIER_C_CAP` cross-domain by EdgePriority above threshold), TierD remainder.
    - Write `edge_tiers: {"e0": "TierX", ...}` to `layout.json` output alongside existing fields.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 3.3 Run tests and regenerate layout
    - Run `pytest backend/tests/test_layout_radial.py` → all tests (geometry + tier) pass.
    - Run full backend pytest suite → all pass.
    - Run `ruff check scripts/` → clean.
    - Regenerate: `python scripts/generate_layout.py` → confirm `data/layout.json` `edge_tiers` has exactly 1116 entries; confirm tier distribution looks reasonable (at least some TierA, TierB, TierC, TierD).
    - _Requirements: 7.8, 14.1_

- [ ] 4. Thread `edge_tiers` and `ring` through the backend API
  - [ ] 4.1 Write backend API tests for new fields
    - Test that `GraphResponse` serializes `edge_tiers` dict correctly (non-empty when layout provides it).
    - Test that `GraphNode` serializes `ring` field (integer 0–3).
    - Test that `graph_service.overview_aggregates()` returns `[]` for the new layout.
    - _Requirements: 1.2, 7.2_

  - [ ] 4.2 Update `backend/app/models.py`
    - Add `edge_tiers: dict[str, str] = Field(default_factory=dict)` to `GraphResponse`.
    - Add `ring: int = 0` to `GraphNode`.
    - _Requirements: 1.2, 7.2_

  - [ ] 4.3 Update `backend/app/graph_service.py`
    - In `_load()`: read `self._edge_tiers: dict[str, str] = layout.get("edge_tiers", {})`.
    - In `_to_graph_node()`: read `ring` from `coord.get("ring", 0)` and include it in the returned `GraphNode`.
    - Expose `self._edge_tiers` in the `GraphResponse` construction (route handler or inline in `graph()` method).
    - `overview_aggregates()` returns `[]` for new layouts (empty `overview_aggregates` in layout.json).
    - _Requirements: 1.2, 7.2_

  - [ ] 4.4 Update `scripts/build_static_api.py`
    - In `main()`, extend the `graph_payload` dict with `"edge_tiers": svc._edge_tiers`.
    - Ensure the `ring` field on `GraphNode` is serialized into the static `nodes` array.
    - _Requirements: 7.2_

  - [ ]* 4.5 Run backend gate and verify static payload
    - Run `pytest` → all pass including new tests.
    - Run `ruff check backend/ scripts/` → clean.
    - Run `python scripts/build_static_api.py` → inspect `frontend/public/api/graph.json`: confirm top-level `edge_tiers` key is present with 1116 entries; confirm node objects include `ring` field.
    - _Requirements: 14.1_

- [ ] 5. Thread `edge_tiers` and `ring` through frontend types and `buildGraph.ts` (TDD)
  - [ ] 5.1 Write vitest unit tests for `buildGraph` new fields
    - Assert that Graphology edges receive a `tier` attribute equal to the value from `data.edge_tiers`; when `edge_tiers` is absent, `tier` defaults to `"TierD"`.
    - Assert that Graphology nodes receive a `ring` attribute from the payload; absent `ring` defaults to `0`.
    - Assert that graph invariants hold: `graph.order === 607` and `graph.size === 1116`.
    - _Requirements: 7.10, 13.1_

  - [ ] 5.2 Update `frontend/src/api/types.ts`
    - Add `edge_tiers?: Record<string, string>` to `GraphResponse`.
    - Add `ring?: number` to `GraphNode`.
    - _Requirements: 7.2_

  - [ ] 5.3 Update `frontend/src/graph/buildGraph.ts`
    - In the edge loop, add `tier: (data.edge_tiers ?? {})[key] ?? "TierD"` to Graphology edge attributes.
    - In the node loop, add `ring: n.ring ?? 0` to Graphology node attributes.
    - After both loops, detect parallel edge pairs and assign distinct `curvature` offsets (placeholder values; finalised in Task 7).
    - Keep `aggregateMemberIds()` and the `isAggregate` block (backward-compatible; empty `overview_aggregates` means the loop is a no-op for new layouts).
    - _Requirements: 7.10_

  - [ ]* 5.4 Run frontend gate
    - Run `tsc --noEmit` → no TypeScript errors.
    - Run `eslint` → no new violations.
    - Run `vitest --run` → all tests pass including new buildGraph tests.
    - _Requirements: 14.2, 14.3, 14.4_

- [ ] 6. Frontend — Remove LOD aggregate system and apply ring-based node opacity
  - [ ] 6.1 Remove the LOD aggregate system from `GraphCanvas.tsx`
    - Remove refs: `sectorMarkerIdsRef`, `memberToDomainRef`, `aggregateIdsRef`, `aggregateLabelRef`, `suppressedLabelsRef`, `labelSettleRef`, `recomputeLabelsRef`.
    - Simplify `activeDomainRef` — keep for domain selection highlight, strip aggregate-specific logic.
    - Remove the "Overview LOD precompute" block inside `useEffect([data, onSelect])`.
    - Remove the `recomputeOverviewLabels()` function.
    - Remove the "Overview LOD" section of the `nodeReducer` (`isAgg` check, sector collapse, marker show/hide logic).
    - Remove the `labelSettleRef` timeout in the camera `updated` handler.
    - Update `fitExplore()`: remove the `hasMarkers` / aggregate-marker extent branch; always frame all 607 nodes directly (simplify to the existing `!hasMarkers` branch).
    - _Requirements: 1.2, 1.3, 1.6_

  - [ ] 6.2 Add ring-based node opacity in the `nodeReducer` "no active" branch
    - Add `hexWithAlpha(hex, alpha)` inline helper that converts `#RRGGBB` to `rgba(r,g,b,a)`.
    - Read `ring` from `dataIn.ring`; apply opacity per ring: `ring=0` → full color (1.0), `ring=1` → 0.90, `ring=2` → 0.75, `ring=3` → 0.50.
    - Apply via `hexWithAlpha` only for non-domain nodes (ring > 0) with `#`-prefixed color values.
    - Apply z-index hierarchy: `ring=0` → 2, `ring=1` → 1, `ring=2, ring=3` → 0.
    - _Requirements: 1.4, 1.5_

  - [ ] 6.3 Update label strategy for the new layout
    - At overview band (≤1): DomainAnchor labels always shown; Subdomain labels checked with `placeLabels()` from `overviewLod.ts` (≤3 subdomain candidates); Concept / Technology labels hidden unless hovered or selected.
    - Remove the `isAggregate` force-label path from the `labelVisible()` inner function.
    - Preserve all existing hover and selection label behavior unchanged.
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 6.4 Update sector backplate computation in `GraphCanvas.tsx`
    - For each domain, use the DomainAnchor's own Graphology position as `(gx, gy)` rather than computing member centroid.
    - Compute `gr` as the mean distance from the anchor to its Ring 2 members × 1.2 (padding); fall back to `CLUSTER_R2 * 1.1` when no Ring 2 members are present.
    - _Requirements: 11.1, 11.2_

  - [ ]* 6.5 Run frontend gate after LOD removal
    - Run `tsc --noEmit` → clean.
    - Run `eslint` → clean.
    - Run `vitest --run` → all pass (update any aggregate-dependent unit test expectations to match the simplified code).
    - Build the test-hooks bundle (`dist-xray-test`) → no build errors.
    - Manually confirm the graph loads and all 607 nodes are visible with straight edges (curves follow in Task 7).
    - _Requirements: 14.2, 14.3, 14.4_

- [ ] 7. Curved edge rendering
  - [ ] 7.1 Install or implement the curved edge program
    - **Path A (preferred — use if Task 1 confirmed availability):** Run `npm install @sigma/edge-curve` in `frontend/`; import `EdgeCurveProgram` from `@sigma/edge-curve`.
    - **Path B (fallback — use if Task 1 found the package unavailable or oversized):** Create `frontend/src/graph/edgeCurveProgram.ts` (~80 lines) implementing Sigma's `AbstractEdgeProgram` with a WebGL quadratic Bézier shader. Control point: `midpoint + offset * perpendicular_normal` where `offset = curvature * edge_length`.
    - _Requirements: 6.1, 6.3, 15.3, 15.4_

  - [ ] 7.2 Register the curved edge program in `GraphCanvas.tsx`
    - In the `new Sigma(graph, container, settings)` call, set `defaultEdgeType: "curved"` and `edgeProgramClasses: { curved: EdgeCurveProgram }` (or the fallback program class name).
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ] 7.3 Set `curvature` attribute per edge in `buildGraph.ts`
    - After the edge attribute loop, assign `curvature` per tier: TierA → `0.25`, TierB → `0.20`, TierC → `0.12`, TierD → `0.20`.
    - Detect parallel edge pairs; assign distinct curvature offsets: `0.15 + idx * 0.15` for each edge in a parallel group (idx = 0, 1, …).
    - Always set a `curvature` attribute (never leave it undefined) so the edge program never falls back to a straight line at runtime.
    - _Requirements: 6.1, 6.2, 6.5_

  - [ ]* 7.4 Run frontend gate and verify curves in production build
    - Run `tsc --noEmit` → clean.
    - Run `eslint` → clean.
    - Run `vitest --run` → all pass (add a `buildGraph` test asserting parallel edges have distinct `curvature` values — **Property 10**).
    - Build production bundle (`npm run build`) → confirm `@sigma/edge-curve` (or fallback) is included; confirm `__ta_sigma` count in deploy bundle is 0.
    - Load the test-hooks bundle in a browser and confirm edges render as curves (not straight lines) in both OverviewState and SelectionState.
    - _Requirements: 6.1, 6.2, 6.4, 14.8_

- [ ] 8. Frontend — Edge tier visibility in the `edgeReducer`
  - [ ] 8.1 Add `edgeTiersRef` and populate it in `GraphCanvas.tsx`
    - Add `edgeTiersRef = useRef<Map<string, string>>(new Map())` to the component.
    - Inside `useEffect([data, onSelect])`, after `buildGraph()`: iterate `graph.forEachEdge()` and populate `edgeTiersRef.current` from each edge's `tier` attribute.
    - _Requirements: 7.7_

  - [ ] 8.2 Rewrite the `edgeReducer` "no active" branch with tier-aware visibility
    - Add new color constants: `TIERA_EDGE = "rgba(160,180,220,0.45)"`, `TIERB_EDGE = "rgba(140,160,200,0.25)"`, `TIERCE_EDGE = "rgba(220,180,120,0.18)"`.
    - Overview band (≤1): TierD → `hidden: true`; TierC → `TIERCE_EDGE`, size 0.25, zIndex 0; TierA → `TIERA_EDGE`, size 0.5, zIndex 1; TierB → `TIERB_EDGE`, size 0.35, zIndex 0.
    - Detail zoom (band 2): show all tiers; preserve the existing `belongs_to_domain` / `has_subdomain` hide logic.
    - Selection branch: unchanged (all incident edges at full `ACTIVE_EDGE` visibility regardless of tier).
    - _Requirements: 7.7, 7.9, 8.1, 8.2, 8.3, 9.1, 9.5_

  - [ ]* 8.3 Run frontend gate and verify edge counts
    - Run `tsc --noEmit` → clean.
    - Run `eslint` → clean.
    - Run `vitest --run` — update any `edgeReducer` tests that previously asserted old overview-edge behavior.
    - Build test-hooks bundle. Load in a browser or run the visual-proof harness manually; confirm visible edge count is between 100 and 170.
    - _Requirements: 7.8, 14.2, 14.3, 14.4_

- [ ] 9. Update visual-proof harness and interaction regression tests
  - [ ] 9.1 Update node-accounting assertions in `frontend/e2e/overview-visual-proof.spec.ts`
    - Change: `expect(m.visibleIndividualNodes).toBe(607)`.
    - Change: `expect(m.visibleMarkers).toBe(0)`.
    - Change: `expect(m.aggregatedNodeCount).toBe(0)`.
    - Add (desktop only): `expect(m.visibleCircleIntersections).toBeLessThanOrEqual(50)`.
    - Change (desktop only): `expect(m.ordinaryEdgesVisible).toBeGreaterThanOrEqual(100)` and `.toBeLessThanOrEqual(170)`.
    - Keep unchanged: `expect(m.priorityLabelCollisions).toBe(0)` and `expect(m.importantContentBehindPanels).toBe(0)`.
    - _Requirements: 1.2, 1.6, 7.8, 14.7_

  - [ ] 9.2 Update interaction regression tests
    - "Robotics expands" / domain-select test: change `before.markers === 14` to `before.individuals === 607`.
    - "Zoom progressive disclosure" test: update to confirm non-domain node labels are visible at detail zoom (nodes were already visible at overview); confirm TierD edges become visible on zoom.
    - _Requirements: 1.6, 7.9, 14.7_

  - [ ]* 9.3 Run the updated visual-proof harness
    - Build the test-hooks bundle (`dist-xray-test`).
    - Run `playwright test -c playwright.overview.config.ts` → all 7 tests must pass with the updated assertions.
    - _Requirements: 14.7_

- [ ] 10. Full gate verification
  - Run `pytest backend/` + `ruff check backend/ scripts/` → all pass, zero linting violations.
  - Run `tsc --noEmit` + `eslint --max-warnings=0` → clean.
  - Run `vitest --run` → all frontend unit / property tests pass.
  - Run `python3 scripts/validate_dataset.py --require-targets` → 607 nodes / 1116 edges, 0 warnings.
  - Rebuild all bundles: `dist` (deploy), `dist-xray-test` (test-hooks). Verify `__ta_sigma` count in deploy bundle is 0.
  - Run Stack View regression: `playwright test` on `dist-xray-test:4180` → 18 tests pass.
  - Run smoke + X-Ray e2e suites → smoke 5 pass (1 skipped), xray 4 pass.
  - Run overview visual-proof harness → 7 tests pass (updated assertions from Task 9).
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

- [ ] 11. Capture before / after screenshots (handoff — no deployment)
  - Capture screenshots of the new layout at five resolutions: 1440×900, 1920×1080, 768×1024, 390×844, 390×667.
  - For each resolution capture: OverviewState (full atlas), AI/ML domain selected, Robotics domain selected, Systems domain selected, a zoomed-in cluster view.
  - Capture one mobile domain-selection screenshot via the legend UI.
  - Verify in screenshots: domain anchors centered in clusters, children visible on all sides (360°), edges render as curves, all nodes represented (not 14-dot ring), ring-based opacity gradient visible.
  - Present side-by-side comparison: current 14-marker ring (before) vs. new radial clusters (after).
  - Do NOT deploy to GitHub Pages. Await user review.
  - _Requirements: 1.1, 1.2, 2.1, 2.4, 6.1, 6.2_

- [ ] 12. Commit the redesign
  - Stage all changed and new files: `scripts/generate_layout.py`, `data/layout.json`, `backend/app/models.py`, `backend/app/graph_service.py`, `scripts/build_static_api.py`, `frontend/src/api/types.ts`, `frontend/src/graph/buildGraph.ts`, `frontend/src/components/GraphCanvas.tsx`, any new test files, `frontend/e2e/overview-visual-proof.spec.ts`, and (if Path A) `frontend/package.json` / `frontend/package-lock.json`.
  - Commit message: `"Explore redesign: two-level radial cluster layout, curved edges, edge backbone"`.
  - Do NOT push to `main` until the user approves the screenshots in Task 11.
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

---

## Notes

- Tasks marked with `*` are optional test/verification steps and can be skipped for a faster MVP pass; however, core tests (pytest, tsc, vitest) must still pass before moving to the next task group.
- Task 1 is a **decision gate**: its output (Path A vs. Path B) determines the implementation branch for Task 7. Do not start Task 7 without completing Task 1.
- Tasks 11 and 12 are **final handoff tasks**. No deployment is attempted without explicit user sign-off on the screenshots produced in Task 11.
- Each task references specific requirements for traceability; all 15 requirements are covered.
- The Python property tests (Tasks 2–3) cover Properties 1–7, 9, 13 from the design's Correctness Properties section.
- The frontend property tests (Tasks 5, 7) cover Properties 8, 10, 11, 12 from the design.
- `data/layout.json` is regenerated twice: after Task 2 (coordinates only) and after Task 3 (coordinates + edge_tiers). The second regeneration is the canonical artifact committed in Task 12.
- `overview_aggregates` is always `[]` in the new layout; the existing API field and deserialization code are kept for backward compatibility but will produce 0 aggregate nodes.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3", "4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3"] },
    { "id": 7, "tasks": ["4.4"] },
    { "id": 8, "tasks": ["4.5", "5.1"] },
    { "id": 9, "tasks": ["5.2", "5.3"] },
    { "id": 10, "tasks": ["5.4", "6.1"] },
    { "id": 11, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 12, "tasks": ["6.5", "7.1"] },
    { "id": 13, "tasks": ["7.2", "7.3"] },
    { "id": 14, "tasks": ["7.4", "8.1"] },
    { "id": 15, "tasks": ["8.2"] },
    { "id": 16, "tasks": ["8.3", "9.1", "9.2"] },
    { "id": 17, "tasks": ["9.3"] },
    { "id": 18, "tasks": ["10"] },
    { "id": 19, "tasks": ["11"] },
    { "id": 20, "tasks": ["12"] }
  ]
}
```
