# Atlas Overview Collision-Free Bugfix Design

## Overview

The default Explore overview (initial full-atlas view, pre-interaction) of TechAtlas renders with three visual defects — overlapping node circles, an ordinary-edge web, and colliding/clipped/panel-occluded labels — across five viewports (1440x900, 1920x1080, 768, 390x844, 390x667). This design corrects those defects at the default overview and adds a browser-level visual-proof harness that measures the fix against the actual rendered output through the existing `window.__ta_sigma` test hook.

The fix strategy is deliberately layered to the render pipeline that already exists in `frontend/src/components/GraphCanvas.tsx` (Sigma + Graphology), and is designed so that **every MUST-PRESERVE item in the approved `bugfix.md` is left byte-for-byte intact**:

1. **Collision-free circles** — a deterministic, CI-reproducible **overview Level-of-Detail (LOD) aggregation** computed at layout-generation time per domain sector, so dense domains (Robotics, AI/ML) never cram circles into a narrow arc. Individual canonical coordinates are preserved untouched; the LOD markers are an *additional* precomputed artifact. A render-time screen-space verification confirms zero intersections at every viewport. Aggregation gives way to individual nodes on zoom. The 14-domain ring stays intact, and the fix never relies on zooming out until bubbles are unreadably tiny.
2. **Zero ordinary edges at overview** — a Sigma edge-reducer state gate that hides ALL ordinary relationship edges when the view is at the overview band with no selection, while keeping all 1116 canonical edges in the dataset so they reappear on interaction. No edges are deleted.
3. **Collision-free priority labels** — a measured screen-space label-placement layer driven through the node reducer's `forceLabel`/suppression, with an explicit priority order, hide-lower-on-conflict resolution, and sidebar/viewport rectangle exclusion. Labels are never force-rendered en masse.
4. **Sector backplate non-overlap** — opacity/placement tuning of the accepted SVG backdrop so the map does not become a color splash.
5. **Visual-proof harness** — a Playwright suite reading the live renderer via `window.__ta_sigma`, measuring six metrics per viewport, asserting all four overview metrics = 0 on desktop and the no-overlap principle on the mobile LOD representation. It reuses the `dist-xray-test` bundle on port 4180 with `PW_CHANNEL=chrome`; the hook stays tree-shaken (0 occurrences) in the deploy bundle.

No code changes are made in this document — it defines the design only.

## Glossary

- **Bug_Condition (C)**: The condition `isBugCondition(X)` from `bugfix.md` — a rendered default-overview observation X at viewport V exhibits `visibleCircleIntersections(X) > 0 OR ordinaryEdgesVisible(X) > 0 OR priorityLabelCollisions(X) > 0 OR importantContentBehindPanels(X) > 0`.
- **Property (P)**: The desired behavior for buggy overview states — all four metrics = 0, with all 607 nodes accounted for (`visibleCount + aggregatedCount = 607`), the 14-domain ring preserved, and aggregate markers carrying accurate counts that expand on zoom/focus.
- **Preservation**: The accepted aesthetics, canonical graph truth (607/1116, IDs, membership, members-only counts, deterministic layout), all interactions, and all test gates that MUST remain unchanged for all non-buggy inputs (`¬C(X)`).
- **Screen space**: Pixel coordinates obtained from `renderer.graphToViewport({x, y})`; all overlap/label geometry is measured here, never in stored layout coordinates.
- **renderedRadius(n)**: The on-screen pixel radius of a node/marker as Sigma actually draws it, read from `renderer.getNodeDisplayData(id).size` (Sigma's size in screen pixels at the current camera ratio).
- **visualGap**: The target breathing room between rendered circles, ~6–10px in screen space.
- **LOD marker / aggregate marker**: A precomputed overview-only representation standing in for a group of underlying member nodes within a domain sector when the individual circles cannot fit with spacing. Carries an accurate member list and count; expands to individual nodes above a camera-ratio threshold.
- **`buildGraph` / `domainMemberIds`**: The Graphology construction (`frontend/src/graph/buildGraph.ts`) and the members-only id helper (same definition as the sidebar count).
- **`fitExplore`**: The sidebar-aware initial framing in `GraphCanvas.tsx` that frames the whole atlas in the usable canvas at camera ratio ~1 (overview band).
- **`__ta_sigma`**: The test-only renderer handle in `GraphCanvas.tsx`, compiled in ONLY when `import.meta.env.VITE_TEST_HOOKS === "true"`, tree-shaken out of the deploy build.
- **Overview band**: `bandOf(ratio) <= 1` from `semanticZoom.ts` (`RATIO_UNIVERSE = 1.1`) — the zoom range at which the default atlas is framed (ratio ~1) and no node has been selected.

## Bug Details

### Bug Condition

The bug manifests when the default Explore overview is rendered at any of the five measured viewports. The overview rendering pipeline (circle placement, edge rendering, label placement) either (a) places member circles so densely that their screen-space circles intersect, especially in dense domains whose members are crammed into a narrow arc; (b) draws ordinary relationship edges (intra-domain, cross-domain, membership, subdomain-structural) that clutter the view; or (c) places priority labels so they collide with each other or with nodes, extend behind the left navigator / right filter panel, or are clipped by the viewport edge.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT:  X of type RenderedOverviewObservation (viewport V in
          {1440x900, 1920x1080, 768, 390x844, 390x667}; all geometry in SCREEN SPACE
          via graphToViewport + rendered radii / measured label boxes)
  OUTPUT: boolean

  RETURN  visibleCircleIntersections(X)   > 0
      OR  ordinaryEdgesVisible(X)         > 0
      OR  priorityLabelCollisions(X)      > 0
      OR  importantContentBehindPanels(X) > 0
END FUNCTION
```

Where, measured in screen space:
- `visibleCircleIntersections(X)` = count of visible node/LOD-marker pairs A,B with `distance(A,B) < renderedRadius(A) + renderedRadius(B) + visualGap` (visualGap ~= 6–10px).
- `ordinaryEdgesVisible(X)` = count of rendered intra-domain, cross-domain, membership, or subdomain structural edges at the overview.
- `priorityLabelCollisions(X)` = count of visible priority-label pairs whose bounding boxes overlap, plus visible labels intersecting another important label or a node.
- `importantContentBehindPanels(X)` = count of important labels/markers extending behind the left navigator or right filter panel, or clipped by the viewport.

### Examples

- **Dense-domain overlap (Robotics, 29 members + anchor):** Expected — member circles fan outward with >= 6–10px gaps or collapse into a single counted aggregate marker. Actual — members crammed into the Robotics wedge overlap each other (screen distance < sum of rendered radii).
- **Edge web at overview:** Expected — zero ordinary relationship edges visible on the initial atlas. Actual — intra-domain / cross-domain / membership / subdomain edges render and clutter the map.
- **Colliding domain labels:** Expected — no two visible priority labels' bounding boxes overlap. Actual — adjacent domain labels (e.g. two neighboring sectors) overlap in screen space.
- **Label behind a panel (edge case):** Expected — no important label extends under the left navigator or right filter panel, none clipped by the viewport. Actual — a rim-domain label extends behind the left legend or off the viewport edge.
- **Mobile (390x844) overlap (edge case):** Expected — whatever LOD representation is shown has 0 intersections. Actual — reduced representation still overlaps.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors (MUST NOT change for any non-buggy input `¬C(X)`):**
- The soft colored domain-sector backgrounds (SVG backdrop in `GraphCanvas.tsx`) CONTINUE to display — additionally ensuring the backplates themselves do not overlap into a color splash (adjustment that only *reduces* overlap, never removes an accepted sector).
- The restrained center "TechAtlas" identity and the exact 14-color palette (`DOMAIN_COLORS` in `graph_service.py`) remain unchanged.
- The refined left domain navigator with nested subdomain hierarchy and corrected members-only counts (Robotics = 29, anchor shown separately), and the right filter panel, continue to function unchanged.
- Navigation and Repo X-Ray behavior — including Stack View projection and restore-to-default-atlas on return — behave exactly as before.
- The canonical dataset contains exactly 607 nodes and 1116 edges with unchanged node IDs and domain membership; the deterministic/CI-reproducible layout remains reproducible and uncorrupted.
- Members-only domain counts remain exact (Robotics = 29, anchor separate) and the 14-domain ring is preserved.
- Progressive zoom reveal continues: zooming in reveals individual nodes and additional labels.
- Domain selection highlights members (Robotics 29, AI/ML full set) WITHOUT a membership-edge web; technology selection reveals genuine canonical relationships from the retained 1116 edges.
- Pan/zoom/reset/resize preserve correct visuals with the sector backdrop and center branding camera-synced.
- Every existing test gate stays green (backend pytest 205 + ruff; frontend tsc + eslint `--max-warnings=0` + vitest 73; dataset validate `--require-targets` 607/1116; Stack View playwright 18; smoke playwright 5; xray e2e playwright 4).
- The production deploy bundle tree-shakes `window.__ta_sigma` out entirely (0 occurrences); the hook is present only in the `VITE_TEST_HOOKS=true` build (`dist-xray-test`).
- The $0 infrastructure budget is respected: no new paid services, no unnecessary new dependencies, no Phase 2 work.

**Scope:**
All inputs that do NOT involve the default-overview visual defect are completely unaffected by this fix. This includes: any post-interaction state (a node/domain selected, a filter applied, Repo X-Ray / Stack View active), zoomed-in bands (individual nodes revealed), and all non-rendering concerns (dataset, API, counts, search, deep links).

> The actual expected correct behavior for buggy states is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change (Property 2).

## Hypothesized Root Cause

Based on the bug analysis in `bugfix.md` and inspection of the live pipeline, the most likely issues are:

1. **Dense-sector circle packing at a fixed overview camera ratio.** `generate_layout.py` fans each sector's members outward in shells (`SHELL0`, `SHELL_STEP`, `PER_SHELL_BASE`) and resolves overlap in *graph units* (`_resolve_overlaps`, `OVERLAP_MARGIN = 4.0`). But `fitExplore` frames the whole atlas at camera ratio ~1, so graph-unit spacing collapses to only a few screen pixels for 607 nodes. Overlap is resolved in graph space, not the screen space the defect is measured in; at overview zoom the rendered radii (5–26px, `sizing.py`) sum to more than the shrunk screen distance. Dense wedges (Robotics, AI/ML) are the worst because their arc is narrow relative to member count.

2. **No overview aggregation / LOD.** There is no deliberate overview representation; the pipeline always draws all 607 individual circles, so at any viewport that cannot fit them with spacing it must either overlap or over-zoom.

3. **Ordinary edges drawn at rest.** The `edgeReducer` already hides `belongs_to_domain`/`has_subdomain` spokes at rest and dims cross-node edges to `REST_EDGE` (`rgba(130,140,160,0.03)`), but "barely-there" is not zero — accumulated faint edges still register as visible ordinary edges at overview, and the structural-edge hiding is keyed on relationship type rather than on an explicit "overview, no selection" state.

4. **Label collisions only coarsely gated.** Labels are gated by Sigma's `labelGridCellSize`/`labelDensity` and by `semanticZoom` bands, which *reduce* collisions statistically but do not *guarantee* zero screen-space overlaps, and do not account for the left navigator / right filter panel rectangles or the viewport edge. Rim-domain labels can extend behind a panel or clip.

5. **Sector backplate opacity stacking.** The SVG radial-gradient sectors (`stopOpacity` 0.16/0.07/0) are sized to each cluster's projected radius; where sectors are close on the ring their gradients compound into a color wash.

## Correctness Properties

Property 1: Bug Condition — Collision-Free, Edge-Free, Clean-Label Overview

_For any_ rendered default-overview observation X at any of the five viewports where the bug condition holds (`isBugCondition(X)` returns true), the fixed overview pipeline SHALL produce a rendering in which, measured in screen space via `graphToViewport` and rendered radii / measured label boxes: `visibleCircleIntersections = 0`, `ordinaryEdgesVisible = 0`, `priorityLabelCollisions = 0`, and `importantContentBehindPanels = 0`; AND every one of the 607 nodes is accounted for (`visibleNodeCount + aggregatedNodeCount = 607`, none silently discarded); AND the 14-domain ring is preserved; AND every aggregate marker carries accurate membership/count information and expands to its underlying nodes on zoom or focus.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**

Property 2: Preservation — Non-Overview-Defect Behavior Unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition(X)` returns false) — accepted aesthetics, canonical graph truth, interactions, and test gates — the fixed code SHALL produce exactly the same result as the original code, preserving: soft (now non-overlapping) sector backgrounds, center "TechAtlas" identity, the 14-color palette, the refined left navigator with nested subdomains and corrected members-only counts (Robotics = 29, anchor separate), the right filter panel, navigation and Repo X-Ray behavior including restore-on-return, the immutable 607/1116 dataset and deterministic layout, the 14-domain ring, progressive zoom reveal, domain-select highlighting without membership-edge webs (Robotics 29, AI/ML full set), technology-select genuine canonical relationships, pan/zoom/reset/resize correctness with camera-synced backdrop and branding, every existing test gate, the tree-shaken `window.__ta_sigma` hook (0 occurrences in the deploy bundle), and the $0 budget / no new deps / no Phase 2 constraints.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14**

## Fix Implementation

### Overview of the Approach

The fix is layered. Each layer maps to one defect term in `isBugCondition` and is independently verifiable by the harness. The guiding principle: **never mutate canonical truth.** The canonical 607 coordinates and 1116 edges stay exactly as `generate_layout.py` and `graph.json` produce them; everything the fix adds is either (a) an *additional* precomputed overview artifact that is deterministic and reproducible, or (b) a render-time view transform in the reducers/overlays that is reversed the instant the user interacts.

---

### Layer 1 — Collision-free overview circles via deterministic LOD aggregation

**Decision: aggregation is computed at layout-generation time (deterministic, CI-reproducible), NOT as a per-frame render-time relayout.**

Justification:
- The defect is measured in screen space at a *fixed* overview camera ratio (`fitExplore` frames the whole atlas at ratio ~1, and on narrow viewports with extra padding). At that ratio the five viewports differ only by canvas pixel size and the padding fraction — the mapping from graph units to screen pixels is deterministic given the camera state. So the set of "which individual circles cannot fit with spacing" is deterministic and can be decided offline per sector without a live DOM.
- A per-frame screen-space relaxation of 607 nodes (O(n^2) or grid-based each frame) would risk the performance budget (perf R30) and would be non-deterministic to assert in CI. Precomputing keeps the frontend's "load coordinates, don't simulate" contract (spec §5.2) intact.
- Determinism and canonical truth are preserved because the aggregation is an **additive artifact**: the individual coordinates are not changed, not removed, and not reordered. The layout file still contains all 607 individual coordinates; the aggregates are emitted alongside them.

**What an LOD aggregate is.** Within each domain sector, after the existing shell-fan + overlap pass, the generator computes — for the overview camera ratio — whether the sector's member circles can all be shown with `>= renderedRadius(A)+renderedRadius(B)+visualGap` spacing in screen space. Sectors (or outer shells of sectors) that cannot are collapsed into one or more **aggregate markers**: a precomputed marker positioned at the sector/shell centroid, carrying `{ domainId, memberIds[], count, radius }`. The domain anchor itself always stays an individual node on the ring (ring preserved); aggregation applies to *members*, matching the members-only count definition.

**Where the aggregates live.** `generate_layout.py` emits a new top-level key in `data/layout.json`, e.g. `"overview_aggregates"`, keyed by the same `layout_version`:
```
"overview_aggregates": [
  { "domain_id": "domain:robotics",
    "markers": [
      { "id": "agg:domain:robotics:0", "x": ..., "y": ..., "radius": ...,
        "member_ids": [...29 ids...], "count": 29 }
    ] }
]
```
`member_ids` union across all markers of a domain exactly equals `domainMemberIds` for that domain (the members-only set — so `count` equals the sidebar count; Robotics = 29, anchor excluded and shown separately). The union across ALL markers plus all individually-shown nodes equals all 607 ids — guaranteeing `visibleCount + aggregatedCount = 607` with nothing discarded.

**Determinism.** Aggregation uses only: the committed individual coordinates, the shared radii from `sizing.py`, the fixed `fitExplore` framing parameters (ring radius, pad fractions), and a fixed target overview ratio and visualGap constant. No randomness beyond the existing seeded jitter (which is already deterministic). Re-running `generate_layout.py` with the committed `layout.json` present reproduces identical output (the existing cross-version pinning path reuses the committed individual coordinates; the aggregates are recomputed from them deterministically). The dataset validator's 607/1116 and `--require-targets` checks are untouched because `graph.json` is not modified.

**Frontend consumption.** `buildGraph.ts` keeps building all 607 individual nodes + 1116 edges exactly as today (canonical graph unchanged). The LOD markers are added as a **separate overview layer**, consumed by `GraphCanvas.tsx`:
- When `bandOf(ratio) <= 1` AND no selection AND not in Repo X-Ray/Stack View: the node reducer hides the *aggregated* member nodes (`res.hidden = true`) and the overview renders the aggregate markers instead. Markers are drawn either as additional Graphology nodes tagged `isAggregate` (simplest, reuses Sigma's node program and hit-testing so click/hover expands them) or as a dedicated marker layer; the design prefers **aggregate nodes added to the graph with an `isAggregate` attribute and their own `member_ids`/`count`**, because that reuses the existing reducer, label, and click plumbing with no new render program.
- Aggregate markers are sized/placed from the precomputed `radius`/`x`/`y`. Because placement was solved for the overview ratio, their rendered circles satisfy the spacing guarantee in screen space.
- **Expansion:** when the camera ratio crosses below the overview band (zoom in) OR the user clicks/focuses an aggregate (or its domain in the legend), the reducer stops hiding that domain's member nodes and hides the aggregate marker — individual nodes appear (progressive zoom reveal preserved, 3.7). The threshold is the existing `RATIO_UNIVERSE`/`RATIO_DOMAIN` band boundary from `semanticZoom.ts` (reused, no new magic numbers): aggregation applies in band 0/1 overview only; band 2 (detail) always shows individuals.

**Dense domains (Robotics, AI/ML).** These are exactly the sectors whose members cannot fit with spacing at overview ratio, so they aggregate first — eliminating the "crammed narrow arc" defect (2.2) while keeping the ring intact (anchor stays on the ring; the aggregate sits in the wedge).

**No over-zoom escape hatch.** Because aggregation makes the overview fit at ratio ~1, the fix does NOT solve overlap by zooming out until bubbles are tiny — `fitExplore` continues to frame at ratio ~1 and markers are legibly sized.

**Mobile (390x844, 390x667).** The same precomputed aggregates apply; because the narrow-viewport `fitExplore` uses a larger pad fraction, MORE sectors aggregate (fewer individual circles fit). The no-overlap guarantee applies to the aggregate representation that is actually shown (2.6), verified by the harness at both mobile sizes.

---

### Layer 2 — Zero ordinary edges at overview via a reducer state gate

**Decision: edge-reducer `hidden` state driven by view/selection state. No edges are deleted; all 1116 remain in the Graphology graph.**

Extend the existing `edgeReducer` in `GraphCanvas.tsx` with an explicit overview predicate rather than relying on per-relationship-type hiding + near-zero alpha:

- **Exact hide condition (overview, no selection):** `scanStatus == null` (not in Repo X-Ray) AND `activeRef.current == null` (nothing selected/hovered) AND `bandOf(ratioRef.current) <= 1` (overview band) → return `{ ...dataIn, hidden: true }` for ALL ordinary edges (every `relationship_type`: intra-domain, cross-domain, `belongs_to_domain`, `has_subdomain`). This yields `ordinaryEdgesVisible = 0` (2.3) — true hidden state, not faint alpha, so the harness counts zero.
- **Show conditions (unchanged behavior):**
  - **Technology selected:** the existing active-edge branch stands — edges incident to the active node render as `ACTIVE_EDGE`, revealing that node's genuine canonical relationships from the retained 1116 edges (3.10).
  - **Domain selected:** `recomputeActive` already highlights all members via `domainMemberIds` WITHOUT adding membership edges; the edge reducer must continue to NOT draw a `belongs_to_domain`/`has_subdomain` web for the selected domain (3.8, 3.9). Only genuine incident relationships of the *anchor* (if any) follow the normal active-edge rule; membership spokes stay hidden.
  - **Zoomed in (band 2) with no selection:** optional — may keep the current faint `REST_EDGE` behavior for cross-node edges since the defect is specified only at the overview band. To stay strictly within the overview fix and avoid changing zoomed-in appearance, the gate is scoped to `bandOf(ratio) <= 1`.
- All 1116 edges remain present (`buildGraph.ts` unchanged), so they reappear on interaction and on zoom (2.3 retention clause, 3.5).

---

### Layer 3 — Collision-free priority labels via measured screen-space placement

**Decision: a deterministic priority + conflict-resolution pass that sets `forceLabel`/suppression per node in the reducer, accounting for sidebar rects and the viewport. Labels are never force-rendered en masse.**

- **Label priority at overview.** Reuse/extend `semanticZoom.labelPriority`. At the overview band the priority order is: selected > hovered > domain anchors (by members-only count desc, then id asc) > aggregate markers (by count desc) > large hubs (`size >= 18`, matching existing `labelVisibleAtRatio`) > everything else (priority 0, not labelled). Deterministic tie-breaks (count/size desc, then node-id asc) keep the chosen label set stable and CI-reproducible.
- **Conflict resolution (hide lower priority).** A placement pass, run when the overview label set or camera changes (NOT per frame), walks candidate labels in priority order, projecting each node to screen via `graphToViewport` and computing its label bounding box (text width via a measured/estimated glyph metric at `labelSize = 12`, box anchored per Sigma's label offset). It keeps a label only if its box does not overlap (a) any already-kept label box, (b) any visible node's rendered circle, or (c) the left-navigator / right-filter-panel rectangles or the viewport bounds. On conflict the lower-priority label is dropped. The kept set is written to the reducer: kept labels get `forceLabel = true` (bypassing Sigma's statistical grid so the guarantee holds), suppressed labels get `res.label = ""`. This yields `priorityLabelCollisions = 0` and `importantContentBehindPanels = 0` (2.4, 2.5) and does NOT force-render all labels merely because their nodes exist.
- **Sidebar + viewport exclusion.** The panel rectangles are read from the DOM the same way `fitExplore` already does (`.legend`, `#graph-filters, .filter-panel`) plus the container `getBoundingClientRect()`. A label box intersecting a panel rect, or extending past the viewport edge, is treated as a conflict and the label is dropped (never clipped, never behind a panel).
- **Integration point.** This composes with Layer 1: aggregate markers are label candidates with their domain name + count; individual aggregated members are hidden so they never contribute label boxes at overview. It integrates with Sigma via the node reducer's `forceLabel`/`label` fields (the mechanism already used for Repo X-Ray persistent labels) — no new render program required. If per-glyph measurement proves necessary for exactness, a lightweight canvas `measureText` at the known font (`Inter, 12px`) is used (no new dependency).

---

### Layer 4 — LOD aggregation details (membership integrity + expansion)

This layer is the data/behavior contract behind Layer 1, called out explicitly because `bugfix.md` 2.7 requires it when 607 circles cannot fit.

- **Aggregate marker contents:** `{ id, x, y, radius, domain_id, member_ids[], count }` with `count == member_ids.length` and `member_ids` ⊆ that domain's members-only set.
- **Accurate counts:** a marker's `count` and its label (e.g. "Robotics · 29" when a single marker covers the whole sector, or per-shell counts summing to the domain's members-only count) are derived from `member_ids`, so they always agree with the sidebar count and `domainMemberIds` (count/highlight correctness preserved; Robotics = 29).
- **Expansion on zoom/focus:** crossing below the overview band, or clicking/focusing the marker or selecting its domain in the legend, reveals the individual members (reducer stops hiding them, hides the marker). This is the same selection/zoom plumbing already present.
- **No silent discard:** a generation-time assertion (and a dataset/layout check) verifies `union(all aggregate member_ids) ∪ {individually shown ids} == all 607 ids` and that each id appears exactly once (aggregated XOR individual). The harness independently verifies `visibleNodeCount + aggregatedNodeCount == 607` at runtime (2.7, 2.9).
- **Same no-overlap guarantee for markers, incl. mobile:** marker placement is solved against the overview ratio for each viewport class (wide vs narrow `fitExplore` padding), so the markers themselves satisfy the spacing inequality at desktop and at both mobile sizes (2.6).

---

### Layer 5 — Sector backplate non-overlap

Tune the accepted SVG backdrop in `GraphCanvas.tsx` + `styles.css` so overlapping sector gradients do not wash into a color splash (3.1), WITHOUT removing any sector or changing the palette (3.2):
- Reduce the radial-gradient outer-stop opacities (currently `0.16 / 0.07 / 0` at `0% / 55% / 100%`) and/or tighten each sector's projected radius (the `gr = maxd + 60` graph-space padding) so adjacent sectors overlap less.
- Optionally apply a max-opacity cap so N overlapping gradients cannot compound beyond a ceiling.
- These are presentation-only constants; the sectors, their colors, and camera-sync behavior are otherwise unchanged (3.11).

---

### Files to Change

- **`frontend/src/components/GraphCanvas.tsx`** — overview LOD layer (hide aggregated members, render aggregate markers, expand on zoom/focus); edge-reducer overview state gate (Layer 2); measured priority-label placement pass (Layer 3); backdrop opacity/placement tuning (Layer 5). All changes scoped so interaction/Stack View/X-Ray paths are untouched.
- **`frontend/src/graph/buildGraph.ts`** — ingest `overview_aggregates` and add aggregate markers as `isAggregate` nodes (canonical 607 nodes + 1116 edges still built exactly as today); possibly a helper mirroring `domainMemberIds` for marker membership.
- **`frontend/src/graph/semanticZoom.ts`** — extend `labelPriority` for the overview priority order (reuse existing band thresholds; no new magic ratios).
- **`frontend/src/styles.css`** — sector backplate opacity/placement, aggregate marker + label styling, consistent with accepted aesthetics.
- **`scripts/generate_layout.py`** — emit `overview_aggregates` deterministically (additive; individual coordinates unchanged); add the membership-integrity assertion.
- **`data/layout.json`** — regenerated to include `overview_aggregates` (individual coordinates and `layout_version` unchanged; regeneration must be idempotent and reproduce the committed individual coordinates exactly).
- **`scripts/validate_dataset.py`** (if touched) — only to assert `union(aggregate member_ids) ∪ individual == 607` and members-only agreement; MUST NOT change the 607/1116 `--require-targets` contract.
- **`frontend/e2e/overview-visual-proof.spec.ts`** (new) — the visual-proof harness (Layer 6 below).
- **`frontend/playwright.overview.config.ts`** (new, or extend an existing config) — points at `dist-xray-test` on port 4180, `PW_CHANNEL=chrome`, reusing `serve-dist-xray-test.mjs`.
- **`frontend/package.json`** — a script entry (e.g. `e2e:overview`) mirroring `e2e:stackview`. No new dependencies.

No backend (`graph_service.py`) runtime change is required: it already serves 607/1116, members-only counts, `parent_id`, and the layout radii. (It is listed only to confirm it is intentionally left unchanged.)

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the defect on the UNFIXED code via the harness (confirming the root-cause hypotheses), then verify the fix drives all overview metrics to zero and preserves all non-buggy behavior. Property-based thinking is applied to preservation (the fix must equal the original for all `¬C(X)` inputs), realized through the existing green test gates plus the new harness.

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples demonstrating the defect BEFORE implementing the fix; confirm or refute the root-cause analysis (dense-sector screen-space packing, no LOD, faint-but-nonzero edges, un-guaranteed label placement, backplate wash). If refuted, re-hypothesize.

**Test Plan:** Run the new visual-proof harness against the current (unfixed) `dist-xray-test` build at all five viewports, reading `window.__ta_sigma` and measuring the six metrics. Observe non-zero values.

**Test Cases:**
1. **Desktop overlap (1440x900, 1920x1080):** measure `visibleCircleIntersections` → expect > 0 on unfixed code (dense sectors).
2. **Ordinary edges visible:** count edges whose `getEdgeDisplayData` is not hidden at overview → expect > 0 on unfixed code.
3. **Priority-label collisions:** measure overlapping visible label boxes and label-behind-panel → expect > 0 on unfixed code.
4. **Mobile overlap (390x844, 390x667) [edge case]:** measure intersections on the shown representation → expect > 0 on unfixed code.

**Expected Counterexamples:**
- Overlapping rendered circles in Robotics/AI-ML sectors at overview ratio.
- Non-zero ordinary edges and colliding/clipped labels.
- Possible causes: graph-space-only overlap resolution at a fixed screen ratio; no LOD; faint edges not fully hidden; labels gated only statistically and not panel/viewport-aware.

### Fix Checking

**Goal:** For all inputs where the bug condition holds, the fixed overview produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO        // X = overview at viewport V in the five sizes
  result := renderDefaultOverview_fixed(X)
  ASSERT visibleCircleIntersections(result)   = 0
     AND ordinaryEdgesVisible(result)         = 0
     AND priorityLabelCollisions(result)      = 0
     AND importantContentBehindPanels(result) = 0
     AND visibleNodeCount(result) + aggregatedNodeCount(result) = 607
     AND ringPreserved(result)                        // 14 domain anchors on the ring
     AND aggregateMarkersCarryAccurateCounts(result)  // count == |member_ids|, matches sidebar
END FOR
```

### Preservation Checking

**Goal:** For all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderOriginal(X) = renderFixed(X)
END FOR
```

**Testing Approach:** Property-based testing is recommended for preservation because it generates many inputs across the domain, catches edge cases, and gives strong guarantees that behavior is unchanged for all non-buggy inputs. Here the "input domain" spans post-interaction states (selection, filter, zoom band, Repo X-Ray/Stack View) and viewports; preservation is enforced concretely by keeping every existing test gate green and by the harness only asserting overview-state metrics.

**Test Plan:** Observe behavior on UNFIXED code for non-overview states (selection reveals edges, domain highlight has no membership web, Stack View restore, zoomed-in individuals), then ensure the fix leaves them identical.

**Test Cases:**
1. **Edge reappearance preservation:** Observe that selecting a technology reveals its canonical edges on unfixed code; verify identical after fix (3.10) — edges still present in the dataset, shown on selection.
2. **Domain highlight preservation:** Observe Robotics select highlights 29 members with no membership web on unfixed code; verify identical after fix (3.8, 3.9), anchor shown separately.
3. **Stack View / restore preservation:** Observe Repo X-Ray Stack View projection and restore-to-default-atlas on return on unfixed code; verify the existing 18 Stack View playwright assertions still pass (3.4, 3.11, 3.12).
4. **Counts & ring preservation:** Verify members-only counts (Robotics = 29) and 14-domain ring unchanged in sidebar and on the ring (3.6).
5. **Deploy-bundle hook preservation:** Verify `dist-xray` (deploy) still contains 0 occurrences of `__ta_sigma` (3.13).

### Unit Tests

- `semanticZoom` label-priority ordering is deterministic (priority desc, count/size desc, id asc).
- LOD membership helper: aggregate `member_ids` for a domain equal `domainMemberIds` (Robotics = 29); union of aggregated + individual ids = all 607, no duplicates, no discard.
- `buildGraph` still builds 607 nodes + 1116 edges with aggregates added as separate `isAggregate` nodes (canonical graph unchanged).
- Backdrop opacity/placement constants stay within the accepted band (sectors present, palette unchanged).

### Property-Based Tests

- Generate random overview-eligible marker/node sets and assert the placement pass yields zero overlapping label boxes and zero node-overlap for the kept/shown set (screen-space inequality holds for all generated configurations).
- Generate random selection states and assert edges are hidden iff (overview band AND no selection AND not X-Ray), and shown otherwise (preservation of reappearance).
- Generate random viewport sizes within the five classes and assert `visibleCount + aggregatedCount = 607` always holds (no node discarded).

### Integration Tests — Visual-Proof Harness (Layer 6)

A new Playwright suite (`frontend/e2e/overview-visual-proof.spec.ts`) that, for each viewport in `{1440x900, 1920x1080, 768, 390x844, 390x667}`, loads the default Explore overview, waits for `window.__ta_sigma`, lets `fitExplore` settle (overview band, no selection), and measures via the live renderer:

- **visibleNodeCount** — count of graph nodes whose `getNodeDisplayData(id)` is defined, not hidden, and (at overview) not an aggregated member; aggregate markers count as shown.
- **aggregatedNodeCount** — sum of `member_ids.length` across active aggregate markers (the members currently represented by a marker rather than drawn individually). Assert `visibleNodeCount(individual members+anchors) + aggregatedNodeCount == 607` (accounts for all nodes; 2.7, 2.9).
- **visibleCircleIntersections** — for every pair of visible nodes/markers A,B: project centers with `renderer.graphToViewport(getNodeDisplayData(id))`, read screen radius from display data `size`, count pairs with `distance < rA + rB + visualGap` (visualGap ~= 8px). Spatial-grid the candidates (not naive O(n^2) across 607) for performance. Assert `= 0`.
- **priorityLabelCollisions** — enumerate labels Sigma actually renders at overview (nodes with a non-empty effective label / `forceLabel`), compute each screen-space box (project center, measure text at `Inter 12px`), count overlapping label-label pairs plus label-node intersections. Assert `= 0`.
- **importantContentBehindPanels** — read `.legend` and `#graph-filters, .filter-panel` `getBoundingClientRect()` and the container rect; count rendered labels/markers whose box intersects a panel rect or extends past the viewport. Assert `= 0`.
- **ordinaryEdgesVisible** — count edges whose `renderer.getEdgeDisplayData(key)` is not `hidden` at overview. Assert `= 0`.

**Desktop acceptance assertions (1440x900 and 1920x1080):** all four overview metrics = 0 — `visibleCircleIntersections = 0`, `priorityLabelCollisions = 0`, `ordinaryEdgesVisible = 0`, `importantContentBehindPanels = 0` (2.8).

**Mobile assertions (390x844, 390x667):** the no-overlap principle holds on whatever LOD representation is shown — `visibleCircleIntersections = 0` among the visible representation — and `visibleCount + aggregatedCount = 607` (2.6, 2.7).

**Harness infrastructure:** reuses the existing `dist-xray-test` bundle (built by `build:xray-test`, `VITE_TEST_HOOKS=true`) served on port 4180 by `serve-dist-xray-test.mjs`, with a new `playwright.overview.config.ts` modeled on `playwright.stackview.config.ts` (`PW_CHANNEL=chrome`, swiftshader GL args, `reuseExistingServer`). The hook remains tree-shaken from `dist-xray` (verified by the existing deploy-bundle check; 3.13). No new dependency is added (`@playwright/test` already present).

**Full-flow / context-switch / visual-feedback integration:**
- Full flow: load overview (collision-free), zoom in → aggregates expand to individuals (progressive reveal, 3.7).
- Context switch: enter Repo X-Ray → Stack View (existing behavior), return → default collision-free atlas restored (3.4); existing Stack View suite stays green.
- Visual feedback: selecting a domain highlights members without a membership web; selecting a technology reveals its canonical edges (3.8–3.10).

## Risks

- **Determinism of the layout change.** `overview_aggregates` must be reproduced byte-identically on regeneration. Mitigation: aggregation derives only from the committed individual coordinates + fixed constants + shared `sizing.py` radii; no new randomness; idempotence covered by a regenerate-and-diff check in CI (same discipline as the current layout determinism gate).
- **Screen-space collision checks at 607 nodes.** Naive pairwise is O(n^2). Mitigation: the harness and any render-time verification use a spatial grid (as `_resolve_overlaps` already does offline); the frontend does NOT run a per-frame 607-node relaxation (aggregation is precomputed), protecting the performance budget (perf R30).
- **Mobile LOD correctness.** Narrow `fitExplore` padding changes how many sectors aggregate; markers must still satisfy spacing and counts at 390x844 and 390x667. Mitigation: the harness asserts both mobile sizes explicitly; aggregation is solved against the narrow-viewport framing parameters.
- **Label measurement fidelity.** Text-box estimation vs Sigma's actual glyph layout could under/over-count collisions. Mitigation: measure with canvas `measureText` at the exact font (`Inter 12px`); treat near-misses as conflicts (conservative), and assert zero in the harness against the live render.
- **Interaction regressions.** The overview gates must be strictly scoped to (overview band AND no selection AND not X-Ray). Mitigation: the existing 18 Stack View + 5 smoke + 4 xray playwright gates and 73 vitest gates must stay green (3.12); preservation test cases above target exactly these paths.
- **Budget.** No new paid services or dependencies; all work reuses Sigma/Graphology/Playwright already present, keeping the $0 constraint (3.14) and staying out of Phase 2.
