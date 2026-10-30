# Implementation Plan: TechAtlas Phase 1.5 UI/UX Refinement

## Overview

This plan refines the existing TechAtlas frontend **in place** — no rebuild, no new
rendering engine, no backend/scanner/dataset change. Every task reuses and re-tunes the
already-audited modules (`buildGraph.ts`, `GraphCanvas.tsx`, `scanOverlay.ts`,
`semanticZoom.ts`, `RepoXrayPanel.tsx`, `NodeDetailsPanel.tsx`, `FilterPanel.tsx`,
`XrayLegend.tsx`, `App.tsx`, and `styles.css` tokens).

The work is sequenced in the spec's phase order — **UI-A (graph clarity, highest
priority) → UI-B (sidebar hierarchy) → UI-C (layout) → UI-D (responsive + a11y) →
UI-E (verification)** — with a mandatory validation checkpoint between phases that
**includes a browser screenshot capture and review**, because passing tests alone do not
prove the spiderweb is gone or that labels/panels read correctly.

Each implementation task is paired with tests and references the design's **12 Correctness
Properties** (P1–P12) and the requirement ids it satisfies. Property-based tests target the
pure logic (`semanticZoom.ts` label priority, `scanOverlay.ts` contextual edges, the
camera-fit helper); component tests target `RepoXrayPanel`/`NodeDetailsPanel`; Playwright
smoke/xray e2e are extended on **both** `dist` and `dist-xray` builds.

### Standing acceptance notes (apply to EVERY task)

- **Edges:** never delete a canonical base-graph edge; never render an edge absent from the
  base graph; the overlay never fabricates edges (P1). _Requirements: 1.3, 1.4, 4.3, 4.4_
- **Channels:** domain fill (`node.color`) is never replaced by a detection-status color;
  status lives only on the ring (P2). _Requirements: 9.1, 9.2, 9.3_
- **Coordinates:** `x`/`y` never mutate on selection or scan; no relayout on
  hover/select/filter/scan; rebuild Sigma only on `data`/`onSelect` identity change
  (P3, P11). _Requirements: 11.3, 13.4, 30.2, 32.1, 32.2_
- **Truth preservation:** partial scans are always visibly flagged (P4); unmapped is never
  discarded (P5); concept/tool split is presentation-only (P9); classification shown only
  when the scanner emits it (P10). _Requirements: 23.*, 20.2, 20.3, 18.*, 19.*_
- **No regressions:** do not change backend/scanner/dataset/canonical ids/relationships/
  popularity; preserve search, domain filters, Wikipedia summaries, documentation/evidence
  URLs, deep links, both deployment builds and deploy config, rate limiting, and caching.
  _Requirements: 31.1, 31.2, 31.3, 31.4_
- **WebGL labels only:** all graph node labels are rendered by the Sigma WebGL engine, never
  as per-node DOM elements. _Requirements: 7.3, 30.3_
- **Scope hold:** Phase 1E and Phase 2 remain on hold and are out of scope. _Requirements: 31.5_
- **Visual validation is mandatory:** every checkpoint requires a browser screenshot capture
  and human review at representative viewports — not just green tests.

## Tasks

- [ ] 1. UI-A — Quiet background edges in the graph build
  - [ ] 1.1 Lower base-graph edge styling in `buildGraph.ts`
    - Replace the `size: 0.6, color: "rgba(140,150,170,0.18)"` base edge styling with the
      quiet defaults (`BASE_EDGE_SIZE ≈ 0.4`, `BASE_EDGE_COLOR ≈ rgba(140,150,170,0.06)`)
      so an unpromoted background edge lands in the 0.04–0.10 opacity band
    - Preserve every canonical edge (skip only edges whose endpoints are missing, as today);
      do not delete or invent edges; leave node attributes unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 1.2 Unit test quiet-background-edge invariants
    - Assert built-graph default edge alpha ∈ [0.04, 0.10]; assert edge count equals the
      base-graph edge count (no deletion) and no edge id outside the base set exists
    - **Validates: Property 1, Property 12 (Universe background band)**
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. UI-A — Contextual-edge classification in the overlay
  - [ ] 2.1 Extend `ScanOverlay` with `contextualEdges` in `scanOverlay.ts`
    - Add `contextualEdges: Set<string>` (exactly one endpoint detected) to the overlay;
      in the single existing edge loop, add both-detected → `highlightEdges`, one-detected →
      `contextualEdges`, none → neither
    - Classify only edge ids already present in the base graph; keep `detectedBounds()`
      unchanged; omit detections whose `node_id` is absent from the graph without creating a node
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 2.2 Property test overlay edge integrity over random detected subsets
    - Over randomized detected subsets: `highlightEdges ∪ contextualEdges ⊆ base edge ids`;
      both-detected ⇒ highlight; exactly-one ⇒ contextual; a detection id absent from the
      graph never appears and never creates a node
    - **Validates: Property 1**
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 3. UI-A — Per-state edge and node opacity bands in `GraphCanvas.tsx`
  - [ ] 3.1 Re-tune reducer constants and wire the contextual-edge branch
    - Set Explore constants (active edge ~0.50–0.60; non-touching ≤ 0.05) and X-Ray
      constants (`SCAN_HILITE_EDGE` 0.60–0.80, new `SCAN_CONTEXT_EDGE` 0.15–0.30,
      `SCAN_DIM_EDGE` ≤ 0.02, `SCAN_DIM_NODE` into 0.10–0.20); add the contextual-edge branch
      to the edge reducer reading a new `scanContextEdges` ref
    - Node reducer: detected nodes render at opacity 1.0 with domain fill unchanged and status
      only on the ring; non-detected nodes dim to 0.10–0.20; keep source size; emphasize
      selection without resizing; never mutate coordinates
    - Pass `overlay.contextualEdges` from `App.tsx` into `GraphCanvas` alongside the existing
      overlay sets
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_
  - [ ]* 3.2 Unit test per-state edge-opacity bands
    - Drive the edge reducer per state and assert each class falls in its target band
      (Universe background ≤ 0.10; Explore touching 0.50–0.60, non-touching ≤ 0.05; verified
      0.60–0.80; contextual 0.15–0.30; unrelated ≤ 0.02)
    - **Validates: Property 12**
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 3.3_
  - [ ]* 3.3 Unit test node channel orthogonality and sizing
    - Assert a detected node's reducer `color` equals its domain `color` and status appears
      only on `borderColor`; assert size is unchanged by selection/scan
    - **Validates: Property 2, Property 3**
    - _Requirements: 3.1, 3.2, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

- [ ] 4. UI-A — Label-priority engine and persistent detected labels in `semanticZoom.ts`
  - [ ] 4.1 Add `labelPriority` and `selectPersistentLabels`
    - Implement `LabelPriority`/`LabelContext` and `labelPriority(id, ctx)` ordering:
      selected > hovered > confirmed-primary (high popularity) > confirmed > declared >
      inferred > semantic-zoom tier; keep overview band prioritizing domain-tier labels
    - Implement `selectPersistentLabels(detectedIds, ctx, budget)` with `Label_Budget = 30`:
      sort by priority desc, then popularity desc, then node-id ascending (deterministic),
      take first budget; keep existing `bandOf`/`labelVisibleAtRatio` for Universe gating
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2_
  - [ ]* 4.2 Property test label priority ordering and bounded deterministic selection
    - Assert priority ordering holds; assert `selectPersistentLabels` size ≤ 24 for any
      detected set and that equal-priority/equal-popularity ties resolve by ascending node-id
      (reproducible across runs)
    - **Validates: Property 6**
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4_
  - [ ] 4.3 Consume persistent labels in the `GraphCanvas` node reducer
    - Compute `selectPersistentLabels` once per overlay change into a ref; in X-Ray, label a
      detected node iff it is in the persistent set (regardless of zoom band); apply
      `labelDensity`/`labelGridCellSize` collision avoidance; keep labels WebGL-only
    - _Requirements: 5.1, 7.3, 8.1, 8.2, 30.3, 30.4_
  - [ ]* 4.4 Unit test memoized label selection recompute boundary
    - Assert persistent-label selection recomputes only on overlay change, not per frame
      (memoization), consistent with no per-frame recomputation
    - **Validates: Property 6, Property 11**
    - _Requirements: 30.4_

- [ ] 5. UI-A — Viewport-aware camera framing and Focus on Stack
  - [ ] 5.1 Add a pure camera-fit helper (sidebar-offset aware)
    - Create a pure `computeFit({ bounds, fullSpread, sidebarWidthPx, viewportWidthPx,
      viewportHeightPx, padding })` returning normalized `{ x, y, ratio }`: usable width =
      viewport − sidebar, shift center left by half the sidebar's normalized width, clamp
      ratio away from `minCameraRatio` and at/below the universe ratio; return null when
      detected nodes lack coordinates
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3_
  - [ ]* 5.2 Unit test camera-fit offset and clamp bounds
    - Assert a non-zero `sidebarWidthPx` shifts center left and the ratio never leaves the
      clamp bounds; assert null-coordinate detected sets return null (skip fit)
    - **Validates: Property 3 (no relayout implied), fit clamp invariant**
    - _Requirements: 11.2, 12.1, 12.3_
  - [ ] 5.3 Wire initial universe fit and sidebar-aware X-Ray fit in `App.tsx`/`GraphCanvas.tsx`
    - On load, frame the full node spread with padding using precomputed coordinates (no
      relayout), clamped so labels stay readable; on scan completion, fit the detected-region
      bounding box within the usable viewport (width − `Sidebar_Width`), biasing center clear
      of the open sidebar; pass live sidebar width from `App.tsx`
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 32.2_
  - [ ] 5.4 Make Focus on Stack primary and re-runnable; keep camera stable
    - Keep the `fitSignal` nonce so Focus on Stack re-executes the bounding-box fit on each
      activation; selection animates to the node without triggering a relayout; render Focus
      on Stack with primary visual prominence among panel actions
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [ ] 6. UI-A checkpoint — graph clarity validation
  - Run typecheck, eslint, and the UI-A unit/property tests; then **capture and review
    browser screenshots** (Universe edge quietness — confirm the spiderweb is gone; Explore
    neighborhood prominence; X-Ray rings/persistent labels; Focus-on-Stack clears the sidebar)
  - Confirm coordinates unchanged and no relayout occurred; ensure all tests pass, ask the
    user if questions arise.

- [ ] 7. UI-B — Additive optional scan field and overlay wiring
  - [ ] 7.1 Add optional `dependency_classification` to `ScanDetection` in `api/types.ts`
    - Add `dependency_classification?: "direct" | "transitive" | "undetermined" | null`
      (frontend-only, optional, nullable); make no other type or backend change
    - _Requirements: 19.1, 19.2, 19.3, 31.4_

- [ ] 8. UI-B — Repo X-Ray sidebar sections A–G in `RepoXrayPanel.tsx`
  - [ ] 8.1 Restructure the panel into sections A–G with an independent scroll region
    - Render in order: header (A), repo identity (B: owner/name link, description, primary
      language, commit SHA, branch from `scan.repository`, truncating long descriptions),
      summary metrics (C), primary actions (D), grouped detected stack (E), unmapped (F),
      coverage/partial banner (G); give the panel its own vertical scroll so the canvas does
      not move
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 21.1_
  - [ ] 8.2 Source-backed summary metrics and action hierarchy
    - Metrics read strictly from `scan.summary.matched_technology_count`,
      `matched_concept_count`, `unmapped_package_count` (never fabricate a count); actions are
      Focus on Stack (primary emphasis), Open GitHub, Analyze Another, Back to Universe
      (secondary); Back to Universe resets the overlay and returns to Universe_State
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3_
  - [ ] 8.3 Grouped stack with presentation-only concept/tool split and classification badge
    - Group rows by `node.primary_domain`; split into a tools group
      (`detection.node_type === "technology"`) rendered before a concepts group
      (`node_type === "concept"`); render the union of rows equal to `scan.detections`
      (no drop/dup/reorder beyond a stable in-group sort); never alter status/evidence/
      identity; render a classification badge only when `dependency_classification` is a
      non-null string, showing the exact value; activating a row focuses the node and opens
      the detail panel
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 19.1, 19.2, 19.3, 22.1, 22.2_
  - [ ] 8.4 Always-visible partial banner and non-discarding unmapped collapse
    - When `scan.status === "partial"`, render an always-visible warning-styled partial banner
      in the coverage section surfacing `coverage.notes` (never suppressed); render the
      unmapped section collapsed by default with a count equal to `scan.unmapped.length`,
      capping display only while retaining the full list with a note that evidence is retained,
      showing ecosystem and direct/transitive where evidence supports
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 23.1, 23.2, 23.3_
  - [ ]* 8.5 Component tests for sidebar hierarchy and truth-preserving presentation
    - Assert sections render in A–G order; partial banner appears iff `status === "partial"`
      (P4); unmapped shows full count and retains the list when capped (P5); classification
      badge renders iff the field is a non-null string (P10); the concept/tool split renders
      every detection exactly once with unchanged status (P9); metrics match `scan.summary`
    - **Validates: Property 4, Property 5, Property 9, Property 10**
    - _Requirements: 15.1, 16.1, 16.2, 16.3, 18.1, 18.3, 18.4, 19.1, 19.2, 20.2, 20.3, 23.1_

- [ ] 9. UI-B — Summary→detail→back without stacked panels in `NodeDetailsPanel.tsx`/`App.tsx`
  - [ ] 9.1 Present node detail on the same right-edge surface and return to summary on close
    - Opening a detected row shows the detail on the same right-edge surface as the X-Ray
      panel (no second floating panel layered); closing the detail returns to the X-Ray summary;
      status rows carry a text label in addition to color
    - _Requirements: 21.1, 21.2, 28.4_
  - [ ]* 9.2 Component test back-nav and status-text presence
    - Assert opening and closing a detected row never stacks two panels and returns to the
      summary; assert every status indicator has adjacent text
    - **Validates: Property 8**
    - _Requirements: 21.1, 21.2, 28.4_

- [ ] 10. UI-B checkpoint — sidebar hierarchy validation
  - Run typecheck, eslint, and UI-B component tests; then **capture and review browser
    screenshots** of the X-Ray sidebar (A–G order, source-backed metrics, action hierarchy,
    concept/tool split, classification badges, partial banner, collapsed unmapped, summary→
    detail→back on one surface)
  - Confirm no detection dropped/duplicated/reordered and no scanner values altered; ensure
    all tests pass, ask the user if questions arise.

- [ ] 11. UI-C — Collapsible filter and compact legend chrome
  - [ ] 11.1 Make `FilterPanel.tsx` collapsible and auto-minimized in X-Ray with a reopen control
    - Support collapsed and expanded modes; auto-minimize when X-Ray_State is entered; while
      minimized, present a control to reopen the filter
    - _Requirements: 24.1, 24.2, 24.3_
  - [ ] 11.2 Make `XrayLegend.tsx` a compact floating/popover with text-not-color status
    - Present Confirmed/Declared/Inferred/Related as a compact floating/popover element; render
      interactive controls visually distinct from non-interactive labels; convey each status
      with a text label in addition to color
    - _Requirements: 25.1, 25.2, 25.3_
  - [ ] 11.3 Toolbar/header spacing, panel borders/typography, and framing-responds-to-panels
    - Add the `:root` CSS token scale from the design (elevation/surfaces, text scale, status
      tokens matching `STATUS_RING`, classification tokens, radii/spacing) without removing or
      re-hueing existing tokens; tighten header/toolbar spacing, panel borders and typography;
      ensure graph framing recomputes against the open-panel width
    - _Requirements: 15.4, 12.1, 12.2_
  - [ ] 11.4 Hover/selection transition polish (rAF-coalesced; single animated camera move)
    - Hover feedback refreshes at most once per frame via requestAnimationFrame coalescing; a
      selection change performs a single animated camera transition (500–600 ms when motion is
      allowed) with the ratio clamped throughout and no recenter when selection is unchanged;
      scan completion plays a single 500–600 ms completion animation without recentering
    - _Requirements: 26.1, 26.2, 26.3, 26.4_
  - [ ]* 11.5 Component test filter collapse/auto-min and legend text labels
    - Assert the filter collapses and auto-minimizes when X-Ray opens and offers a reopen
      control; assert each legend status carries adjacent text
    - **Validates: Property 8**
    - _Requirements: 24.1, 24.2, 24.3, 25.3_
  - [ ]* 11.6 Optional camera controls (zoom in/out, reset-to-universe)
    - Add small overlay buttons wired to existing Sigma camera APIs; reset animates to the
      initial universe fit with `Sidebar_Width` treated as 0; respect reduced motion
    - _Requirements: 14.1, 14.2, 14.3_

- [ ] 12. UI-C checkpoint — layout validation
  - Run typecheck, eslint, and UI-C component tests; then **capture and review browser
    screenshots** (collapsible/auto-minimized filter with reopen control, compact legend
    popover, refined toolbar/panel spacing, framing adjusting to the open panel, hover/selection
    transition smoothness)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. UI-D — Responsive breakpoints and mobile surface
  - [ ] 13.1 Implement desktop/tablet/mobile layout at the 1024px and 640px breakpoints
    - ≥1024px: graph-first with side panels 360–420px; 640–1023px: collapsible side panels
      360–420px when expanded and 0px when collapsed; <640px: full-screen graph with a floating
      search control, a bottom-sheet repo-results surface, and touch navigation; critical info
      is persistently visible (no hover/focus/tap required to reveal it)
    - _Requirements: 27.1, 27.2, 27.3, 27.4_
  - [ ]* 13.2 Optional tablet refinement and beside-node label placement
    - Refine the 640–1023px panel transitions; enable beside-node label placement only in
      dense clusters to reduce collisions
    - _Requirements: 8.3, 27.2_

- [ ] 14. UI-D — Accessibility and reduced motion
  - [ ] 14.1 Keyboard operability, visible focus, ARIA listbox search, SR-reachable findings
    - Make every interactive control keyboard-reachable/operable (Tab/Shift+Tab/Enter/Space/
      arrows); show a visible focus indicator at ≥3:1 contrast; expose search suggestions with
      ARIA listbox/option semantics; expose each repository finding with a programmatic name/
      role and make it keyboard-reachable without direct graph interaction; toggle a focused
      sidebar category on Enter/Space and expose its expanded/collapsed state
    - _Requirements: 28.1, 28.2, 28.3, 28.6, 28.7_
  - [ ] 14.2 Reduced-motion compliance across camera and choreography
    - When `prefers-reduced-motion: reduce`, use animation duration 0 for all camera moves
      (selection and scan completion) and suppress non-essential transition/choreography
      animations; ensure text contrast meets 4.5:1 (3:1 for large text and UI/graphic
      boundaries)
    - _Requirements: 26.5, 26.6, 28.5, 29.1, 29.2_
  - [ ]* 14.3 Unit/component test reduced motion and status-text accessibility
    - Assert camera animation duration is 0 under reduced motion for selection and scan
      completion; assert each status is conveyed with a persistent text label
    - **Validates: Property 7, Property 8**
    - _Requirements: 28.4, 29.1, 29.2_

- [ ] 15. UI-D checkpoint — responsive + a11y validation
  - Run typecheck, eslint, and UI-D tests; then **capture and review browser screenshots** at
    desktop/tablet/mobile widths (mobile bottom-sheet + floating search); perform a keyboard-only
    pass (focus visibility, ARIA listbox search, category toggle, findings reachable) and a
    reduced-motion pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. UI-E — Final verification and regression pass
  - [ ] 16.1 Extend Playwright smoke + xray e2e on both builds
    - Extend the existing Playwright suite: `dist` smoke (padded universe fit, select→Explore,
      clear→Universe) and `dist-xray` xray e2e (detected rings + persistent labels, Focus on
      Stack frames clear of the sidebar, a partial-scan fixture shows the banner, summary→detail
      →back without stacked panels) on both builds
    - _Requirements: 22.1, 22.2, 22.3, 30.1, 30.5, 31.3_
  - [ ]* 16.2 Full-dataset performance check
    - With the full 417-node / 900-edge dataset and realistic scan overlays, assert interactive
      rendering, no relayout on hover/select/filter/scan, WebGL-only labels, and memoized
      neighborhood/persistent-label lookups
    - **Validates: Property 11**
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 32.1_
  - [ ] 16.3 Mandatory screenshot review at representative viewports
    - Capture and review before/after screenshots for: universe, hover, select, x-ray complete,
      x-ray node selected, evidence, focus-stack, and mobile; tune open-question values (base
      edge alpha, label density/grid, persistent-label budget, band values, fit padding) against
      the real output before finalizing
    - _Requirements: 1.1, 3.3, 5.1, 12.1, 27.3_
  - [ ] 16.4 Regression and deploy confirmation
    - Confirm no graph-behavior regression: search, domain filters, Wikipedia summaries,
      documentation/evidence URLs, deep links, popularity sizing, canonical ids/relationships,
      and the 417-node base graph are all unchanged; confirm both builds (`dist`, `dist-xray`)
      and the GitHub Pages deploy remain functional; confirm Phase 1E and Phase 2 remain on hold
    - _Requirements: 22.3, 31.1, 31.2, 31.3, 31.4, 31.5_

- [ ] 17. Final checkpoint — ship-readiness
  - Ensure typecheck, eslint, vitest unit, component tests, and Playwright smoke + xray e2e all
    pass on both builds; confirm the mandatory screenshot review is complete and the spiderweb
    is visibly gone; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional: the required path delivers the edge-clutter fix, labels,
  camera framing, the sidebar hierarchy (partial/classification/unmapped), a11y basics, and
  verification. Optional tasks deepen polish (optional camera controls 11.6, tablet refinement
  and beside-node labels 13.2) and add the property/component/performance test depth
  (1.2, 2.2, 3.2, 3.3, 4.2, 4.4, 5.2, 8.5, 9.2, 11.5, 14.3, 16.2).
- Each task references specific requirements for traceability and, where it validates one, the
  design's numbered correctness property (P1–P12).
- Checkpoints between phases are mandatory and each includes a **browser screenshot capture and
  review** — passing tests alone do not satisfy a checkpoint.
- Non-negotiables (standing acceptance notes above) apply to every task: never delete/fabricate
  edges; domain fill never replaced by status color; coordinates never mutate; partial always
  flagged; unmapped never discarded; presentation-only concept/tool split; no backend/scanner/
  dataset/canonical changes; preserve search/filters/Wikipedia/deep-links/popularity/evidence
  URLs/deploy config; WebGL-only labels; verify against the full dataset.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.2", "4.3", "5.2", "5.3", "8.1"] },
    { "id": 3, "tasks": ["4.4", "5.4", "8.2", "8.3", "8.4"] },
    { "id": 4, "tasks": ["8.5", "9.1", "11.1", "11.2", "11.3"] },
    { "id": 5, "tasks": ["9.2", "11.4", "11.5", "11.6", "13.1"] },
    { "id": 6, "tasks": ["13.2", "14.1", "14.2"] },
    { "id": 7, "tasks": ["14.3", "16.1", "16.3", "16.4"] },
    { "id": 8, "tasks": ["16.2"] }
  ]
}
```
