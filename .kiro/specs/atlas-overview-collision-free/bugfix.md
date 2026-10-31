# Bugfix Requirements Document

## Introduction

TechAtlas is an interactive tech knowledge-graph atlas (React/TS/Vite + Sigma.js/Graphology frontend on GitHub Pages, FastAPI "Repo X-Ray" scanner on Render Free, dataset v0.4.0: 607 nodes / 1116 edges across 14 top-level domains in a "structured-atlas-ring+radial-fan" layout). A prior aesthetic redesign (commits `40fdb24` and `01a6cae`) shipped and is ACCEPTED: soft colored domain-sector backgrounds, the restrained center "TechAtlas" identity, the 14-color palette, the refined left domain navigator with nested subdomain hierarchy and corrected members-only counts, and the right filter panel.

Despite that redesign, the default Explore atlas homepage (the initial full-atlas overview, before any user interaction) still renders with three visual defects: node circles overlap each other, canonical relationship edges clutter the view, and domain/important labels collide, clip, or hide behind the sidebars. These defects degrade legibility of the overview and are visible across desktop, tablet, and mobile viewports.

This bugfix corrects only those remaining visual defects at the default overview and adds a browser-level measurement harness that proves them fixed against the actual rendered output (read through the existing `window.__ta_sigma` test hook present only in the `VITE_TEST_HOOKS=true` build). It must preserve all accepted aesthetic work, the immutable canonical graph truth (607 nodes, 1116 edges, node IDs, domain membership, members-only counts with Robotics = 29 and anchor shown separately, and the deterministic/CI-reproducible layout), every existing interaction, and every green test gate. No code changes are made in this document — it defines requirements only. The fix stays within the $0 infrastructure budget: no new paid services, no unnecessary new dependencies, no Phase 2 work.

Bug condition inputs X are observations of the live, actually-rendered default overview at a given viewport V, where V ranges over the five measured viewports: 1440x900 desktop, 1920x1080 desktop, 768px tablet, 390x844 mobile, and 390x667 mobile. All geometric quantities are measured in SCREEN SPACE using Sigma's coordinate transforms and the RENDERED node radii / measured label bounding boxes, not stored layout coordinates.

## Bug Analysis

### Current Behavior (Defect)

At the default Explore overview (initial full-atlas view, pre-interaction), for an observation X at viewport V:

1.1 WHEN the default overview is rendered at any of the five viewports THEN the system renders visible node circles whose screen-space circles intersect each other, so that for at least one pair of visible nodes A and B, screen distance(A, B) < renderedRadius(A) + renderedRadius(B) (visible circle intersections > 0).

1.2 WHEN a dense domain (e.g. Robotics, AI/ML) is rendered at the default overview THEN the system crams its member circles into a narrow arc without collision-aware packing, producing heavy overlap within the domain sector.

1.3 WHEN the default full-atlas overview is rendered THEN the system draws ordinary graph relationship edges (intra-domain, cross-domain, membership, and subdomain structural edges), so that the count of visible ordinary relationship edges at overview is greater than 0 and clutters the view.

1.4 WHEN the default overview is rendered THEN the system displays domain labels and other important labels that collide, so that at least one pair of visible priority labels has overlapping screen-space bounding boxes, and/or a visible label intersects another important label or a node (priority-label collisions > 0).

1.5 WHEN the default overview is rendered THEN the system allows an important label to extend behind the left domain navigator or the right filter panel, or to be clipped by the viewport edge (important content hidden behind panels / clipped > 0).

1.6 WHEN the default overview is rendered at mobile viewports (390x844, 390x667) THEN the system shows overlapping circles (or an overlapping reduced representation) under the same screen-space overlap defect as desktop.

1.7 WHEN the atlas cannot physically fit all 607 individual circles with sufficient spacing at a given viewport THEN the system has no deliberate overview aggregation / level-of-detail representation, so it either overlaps circles or would require zooming so far out that bubbles become unreadably tiny.

### Expected Behavior (Correct)

At the default Explore overview, for an observation X at viewport V, the fixed system SHALL satisfy:

2.1 WHEN the default overview is rendered at any of the five viewports THEN the system SHALL ensure that for every pair of visible nodes A and B, screen distance(A, B) >= renderedRadius(A) + renderedRadius(B) + visualGap, where visualGap targets approximately 6-10px of breathing room, yielding 0 visible circle intersections (overlap measured in screen space using Sigma coordinate transforms and rendered radii).

2.2 WHEN a dense domain is rendered at the default overview THEN the system SHALL use collision-aware packing for that domain's representation rather than cramming circles into a narrow arc, while keeping the 14-domain ring intact.

2.3 WHEN the default full-atlas overview is rendered THEN the system SHALL render ZERO ordinary graph relationship edges (intra-domain, cross-domain, membership, and subdomain structural edges all hidden), while retaining all 1116 canonical edges in the dataset so they reappear on interaction.

2.4 WHEN the default overview is rendered THEN the system SHALL ensure no two visible priority labels have overlapping screen-space bounding boxes, no visible label intersects another important label or a node, and SHALL hide the lower-priority label when two would conflict (priority-label collisions = 0); it SHALL NOT force-render all labels merely because their nodes exist.

2.5 WHEN the default overview is rendered THEN the system SHALL ensure no important label extends behind the left domain navigator or the right filter panel and no important label is clipped by the viewport (important content hidden behind panels / clipped = 0).

2.6 WHEN the default overview is rendered at mobile viewports THEN the system SHALL enforce the same no-overlap principle on whatever level-of-detail representation is actually shown (0 intersections among the visible representation).

2.7 WHEN all 607 individual circles cannot physically fit with sufficient spacing at a given viewport THEN the system SHALL introduce a deliberate overview aggregation / level-of-detail (LOD) representation in which every aggregate marker carries accurate membership/count information and expands to its underlying nodes on zoom or focus, and SHALL never silently discard any node (visible node count + hidden/aggregated node count accounts for all 607).

2.8 WHEN the default desktop overview (1440x900 and 1920x1080) is measured by the harness THEN the system SHALL meet the acceptance thresholds: 0 visible circle intersections, 0 priority-label collisions, 0 visible ordinary relationship edges, and 0 important content hidden behind panels.

2.9 WHEN the visual-proof harness runs at each of the five viewports THEN the system SHALL measure and report, against the actual rendering via the `window.__ta_sigma` hook: visible node count; hidden/aggregated node count; actual visible circle intersections; priority-label collisions; important content hidden by side panels; and ordinary relationship edges visible at overview.

### Unchanged Behavior (Regression Prevention)

The fix SHALL preserve all accepted aesthetic work, canonical graph truth, interaction behavior, and existing test gates:

3.1 WHEN the default overview is rendered THEN the system SHALL CONTINUE TO display the soft colored domain-sector backgrounds, additionally ensuring the sector backplates themselves do not overlap so heavily that the map becomes a color splash.

3.2 WHEN the atlas is displayed THEN the system SHALL CONTINUE TO show the restrained center "TechAtlas" identity and the 14-color palette unchanged.

3.3 WHEN the left domain navigator (legend) is displayed THEN the system SHALL CONTINUE TO show the refined navigator with its nested subdomain hierarchy and corrected members-only counts, and the right filter panel SHALL CONTINUE TO function unchanged.

3.4 WHEN the user interacts with navigation or Repo X-Ray THEN the system SHALL CONTINUE TO behave exactly as before, and returning from Repo X-Ray SHALL restore the default collision-free atlas.

3.5 WHEN the canonical dataset is loaded or validated THEN the system SHALL CONTINUE TO contain exactly 607 nodes and 1116 edges with unchanged node IDs and domain membership, and the deterministic/CI-reproducible layout SHALL CONTINUE TO be reproducible and uncorrupted.

3.6 WHEN members-only domain counts are computed THEN the system SHALL CONTINUE TO report exact counts (Robotics = 29 with its anchor shown separately) and the 14-domain ring SHALL CONTINUE TO be preserved.

3.7 WHEN the user zooms in from the overview THEN the system SHALL CONTINUE TO progressively reveal individual nodes and additional labels.

3.8 WHEN the user selects the Robotics domain THEN the system SHALL CONTINUE TO highlight all 29 members with the anchor shown separately, WITHOUT drawing a web of membership edges.

3.9 WHEN the user selects the AI/ML domain THEN the system SHALL CONTINUE TO highlight its complete members-only set, WITHOUT drawing a web of membership edges.

3.10 WHEN the user selects a technology node THEN the system SHALL CONTINUE TO reveal that node's genuine canonical relationships from the retained 1116 edges.

3.11 WHEN the user pans, zooms, resets the camera, or resizes the viewport THEN the system SHALL CONTINUE TO preserve correct visuals, and the sector backgrounds and center branding SHALL CONTINUE TO stay synchronized with the camera.

3.12 WHEN the existing test suites run THEN the system SHALL CONTINUE TO keep every gate green: backend pytest (205) + ruff on `app tests ../scripts`; frontend tsc + eslint (--max-warnings=0) + vitest (73); dataset validate --require-targets (607/1116); Stack View regression playwright (18, test-hooks bundle on 4180, PW_CHANNEL=chrome); smoke playwright (5, scanner-disabled dist on 4178); xray e2e playwright (4, dist-xray on 4179).

3.13 WHEN the production deploy bundle is built THEN the system SHALL CONTINUE TO tree-shake the `window.__ta_sigma` test hook out entirely (0 occurrences in the deploy bundle), with the hook present only in the `VITE_TEST_HOOKS=true` build (dist-xray-test) that the new visual-proof harness reads.

3.14 WHEN the fix is implemented THEN the system SHALL CONTINUE TO respect the $0 infrastructure budget: no new paid services, no unnecessary new dependencies, and no Phase 2 work.

## Bug Condition Derivation

**Definitions:**
- **F**: the original (unfixed) default-overview rendering pipeline (circle placement, edge rendering, label placement) as it exists before this fix.
- **F'**: the fixed rendering pipeline after applying the fix.
- **X**: an observation of the actually-rendered default overview at viewport V in {1440x900, 1920x1080, 768, 390x844, 390x667}, measured in screen space via the `window.__ta_sigma` hook.

**Bug Condition** — identifies overview states that exhibit the defect:

```pascal
FUNCTION isBugCondition(X)
  INPUT:  X = rendered default overview at viewport V
  OUTPUT: boolean

  RETURN  visibleCircleIntersections(X)   > 0
      OR  ordinaryEdgesVisible(X)         > 0
      OR  priorityLabelCollisions(X)      > 0
      OR  importantContentBehindPanels(X) > 0
END FUNCTION
```

Where, measured in screen space:
- `visibleCircleIntersections(X)` = count of visible node (or LOD marker) pairs A,B with distance(A,B) < renderedRadius(A) + renderedRadius(B) + visualGap (visualGap ~= 6-10px).
- `ordinaryEdgesVisible(X)` = count of rendered intra-domain, cross-domain, membership, or subdomain structural edges at the overview.
- `priorityLabelCollisions(X)` = count of visible priority-label pairs whose bounding boxes overlap, plus visible labels intersecting another important label or a node.
- `importantContentBehindPanels(X)` = count of important labels/markers extending behind the left navigator or right filter panel, or clipped by the viewport.

**Property — Fix Checking** (desired behavior for all buggy overview states):

```pascal
// Property: Fix Checking — collision-free, edge-free, clean-label overview
FOR ALL X WHERE isBugCondition(X) DO
  result <- F'(X)
  ASSERT visibleCircleIntersections(result)   = 0
     AND ordinaryEdgesVisible(result)         = 0
     AND priorityLabelCollisions(result)      = 0
     AND importantContentBehindPanels(result) = 0
     AND allNodesAccountedFor(result)                 // visibleCount + aggregatedCount = 607, none discarded
     AND ringPreserved(result)                        // 14-domain ring intact
     AND aggregateMarkersCarryAccurateCounts(result)  // LOD markers carry membership/count, expand on zoom/focus
END FOR
```

**Property — Preservation Checking** (non-buggy observations unchanged):

```pascal
// Property: Preservation Checking
// Non-buggy inputs = states not exhibiting the overview defect:
//   accepted aesthetics, canonical graph truth, interactions, and test gates.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Concretely, preservation covers: soft sector backgrounds (now also non-overlapping), center "TechAtlas" identity, 14-color palette, refined left navigator with nested subdomains and corrected members-only counts, right filter panel, navigation and Repo X-Ray behavior (including restore-on-return), the immutable 607/1116 dataset and deterministic layout, members-only counts (Robotics = 29, anchor separate) and the 14-domain ring, progressive zoom reveal, domain-select highlighting without membership-edge webs (Robotics 29, AI/ML full set), technology-select genuine canonical relationships, pan/zoom/reset/resize correctness with camera-synced backdrop and branding, every existing test gate, and the tree-shaken `window.__ta_sigma` hook (0 occurrences in the deploy bundle).
