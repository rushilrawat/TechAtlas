# Requirements Document

## Introduction

The Explore-view Radial Atlas is a major redesign of TechAtlas's primary visualization — the interactive knowledge-graph atlas that maps 607 technology nodes across 14 top-level computing domains. The redesign replaces the current "structured ring + one-sided radial fan" layout (which relies on aggregate/LOD markers to hide most individual nodes at the overview) with a full visible-node radial-cluster layout. Every node is represented in the default overview. Each domain anchor becomes the center of its own cluster, children radiate outward in full 360° concentric rings, edges are rendered as curves, and visible edge count is controlled by a principled multi-tier backbone/scoring method. The result should read as a premium, map-like constellation of computing domains — structured, legible, and screenshot-worthy at first load.

The project is a React/TypeScript/Vite frontend (Sigma.js + Graphology) deployed to GitHub Pages, with a FastAPI Repo X-Ray scanner on Render Free. All existing interactions — selection, zoom, domain highlight, Repo X-Ray stack view, search, filters, mobile navigation — must remain fully functional. Layout generation stays offline (no browser-side physics). The $0 budget and no-new-paid-services constraint are hard limits.

---

## Glossary

- **Atlas**: The TechAtlas interactive knowledge-graph visualization and its backing dataset.
- **LayoutGenerator**: The offline Python script (`generate_layout.py`) that pre-computes node coordinates and radii and writes them to `data/layout.json`.
- **GraphCanvas**: The React component (`GraphCanvas.tsx`) that owns the Sigma.js renderer instance.
- **Sigma**: The Sigma.js WebGL graph renderer used by GraphCanvas.
- **Node**: A single entry in the graph dataset with a unique `id`, a `node_type` (domain, concept, or technology), and associated metadata.
- **DomainAnchor**: A node whose `node_type` is `"domain"`. There are 17 domain nodes: 14 top-level and 3 nested subdomains.
- **TopLevelDomain**: One of the 14 domain nodes that are not nested inside another domain via a `has_subdomain` edge from a non-root domain. They form the macro ring at Level 1.
- **Subdomain**: One of the 3 domain nodes that are children of another non-root domain via a `has_subdomain` edge. They are: `computer-architecture` and `embedded` (under `systems`), and `computer-graphics` (under `gamedev`).
- **Concept**: A node whose `node_type` is `"concept"`.
- **Technology**: A node whose `node_type` is `"technology"`.
- **Member**: Any non-domain node whose `primary_domain` field resolves to a given top-level domain (or to one of that domain's subdomains).
- **Cluster**: The spatial region owned by a single DomainAnchor, containing that anchor at its center, its members radiating outward in concentric rings, and any subdomain sub-clusters within its territory.
- **SubCluster**: A self-contained radial cluster centered on a Subdomain anchor, nested within the parent Cluster's territory.
- **MacroRing**: The conceptual large circular arrangement of Cluster centers (i.e. DomainAnchor positions) across the full atlas at Level 1.
- **RadialRing**: A concentric ring of member nodes at a fixed radial distance from the DomainAnchor (or Subdomain anchor) at Level 2. Ring 0 = anchor itself; Ring 1 = closest ring of children; Ring 2 = second ring; Ring 3 = outermost ring.
- **BackboneEdge**: An edge selected for display at the default overview using the EdgePriority scoring method. Not all 1116 edges are backbone edges; backbone edges are a curated visible subset.
- **EdgePriority**: A scalar score computed per edge using the formula defined in Requirement 7, used to rank and filter edges for overview display.
- **TierA_Edge**: A structural edge that is always displayed (parent→subdomain, parent→first-ring child).
- **TierB_Edge**: A local-cluster backbone edge shown at overview.
- **TierC_Edge**: A cross-domain bridge edge — very few shown at rest.
- **TierD_Edge**: An edge revealed only on zoom or interaction, not shown in the default overview.
- **CurvedEdge**: An edge rendered as a circular arc, quadratic Bézier curve, or spline — never a straight line.
- **OverviewState**: The default camera state showing the full atlas with all 607 nodes visible.
- **ZoomState**: Any camera state in which the viewport covers a sub-region of the atlas (ratio above the overview threshold).
- **SelectionState**: The state in which a single node is selected; that node's full canonical edge set is revealed, all curved.
- **DomainSelectionState**: The state in which a domain anchor is selected; all members are highlighted and internal backbone edges are brightened.
- **SectorBackplate**: The SVG atmospheric tint/glow behind each domain territory.
- **CenterIdentity**: The "TechAtlas" title and concentric ring decoration rendered at the geometric center of the atlas.
- **StackView**: The Repo X-Ray projection that redraws detected nodes into domain clusters.
- **CanonicalGraph**: The dataset truth: exactly 607 nodes and 1116 edges with stable IDs.
- **IntraDegree**: The count of edges a node shares with other members of the same domain.
- **EdgePriorityWeights**: The five configurable scalar weights (w1–w5) used in the EdgePriority formula.
- **rendered_diameter**: The screen-space pixel diameter of a node as computed from its radius and the current camera ratio; used in the angular-spacing collision formula.
- **LOD**: Level of Detail — the system that adapts visible content based on camera zoom ratio.
- **AggregateMarker**: A single stand-in bubble that previously represented an entire domain sector at the overview (explicitly rejected in this redesign).

---

## Requirements

### Requirement 1: Full Node Visibility at Overview

**User Story:** As a user landing on TechAtlas for the first time, I want to see all technology nodes represented in the default atlas view, so that I immediately grasp the scale and structure of the knowledge graph without having to zoom or interact.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL assign x/y coordinates to all 607 canonical nodes in `data/layout.json` such that no node has a missing or null coordinate.
2. WHEN the Atlas is loaded in OverviewState, THE GraphCanvas SHALL render all 607 individual nodes as visible graph nodes — not hidden behind AggregateMarkers.
3. THE GraphCanvas SHALL NOT use AggregateMarkers as the primary visibility strategy for any node at OverviewState.
4. WHEN the Atlas is loaded in OverviewState, THE GraphCanvas SHALL render DomainAnchors at the highest opacity level (1.0), hub Concepts and Technologies at a mid opacity (≥0.75), and leaf Technology nodes at a reduced but non-zero opacity (≥0.45).
5. THE GraphCanvas SHALL apply a z-index (rendering order) hierarchy: DomainAnchors rendered on top, then high-IntraDegree Concepts, then Technology nodes, so prominent nodes are not occluded by less important ones.
6. WHEN the total rendered node count is queried programmatically, THE Atlas SHALL return exactly 607 individual nodes and 0 AggregateMarkers in OverviewState.

---

### Requirement 2: Two-Level Radial Layout Structure

**User Story:** As a user exploring the atlas, I want each domain to read as its own self-contained radial cluster — with the domain anchor at the center and children surrounding it on all sides — so that I can intuitively navigate from parent concept to child technologies.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL position every TopLevelDomain anchor at the centroid of its member nodes, such that the anchor's distance to the weighted average position of its Ring 1 members is less than the intra-ring spacing for Ring 1.
2. THE LayoutGenerator SHALL arrange member nodes in concentric RadialRings around each DomainAnchor: Ring 1 at radial distance R1, Ring 2 at R2 > R1, Ring 3 at R3 > R2, with all three radii configurable as constants.
3. WHEN assigning nodes to rings, THE LayoutGenerator SHALL place nodes with the highest IntraDegree into Ring 1, nodes with moderate IntraDegree into Ring 2, and remaining leaf nodes into Ring 3.
4. THE LayoutGenerator SHALL distribute Ring 1, Ring 2, and Ring 3 members in full 360° angular arcs around their DomainAnchor, such that no ring spans less than 300° of arc (unless the ring contains fewer than 3 nodes).
5. THE LayoutGenerator SHALL position all 14 TopLevelDomain anchor centers on a MacroRing of configurable radius, arranged in a balanced circular macro-structure with angular spacing proportional to the square root of each domain's member count.
6. THE LayoutGenerator SHALL ensure that no two DomainAnchor centers are closer than 2× the maximum cluster radius of either cluster, preserving inter-cluster whitespace.

---

### Requirement 3: Subdomain Sub-Clusters

**User Story:** As a user inspecting the Systems or Game Development domains, I want to see the nested subdomain (e.g. Computer Architecture, Embedded, Computer Graphics) as its own mini-cluster inside the parent domain's territory, so that the hierarchy is spatially clear.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL place each of the 3 Subdomain anchors (`computer-architecture`, `embedded`, `computer-graphics`) within the territorial footprint of their respective parent domain cluster, not on the MacroRing.
2. THE LayoutGenerator SHALL position each Subdomain anchor at the centroid of its own direct members, forming a SubCluster centered on the Subdomain anchor.
3. THE LayoutGenerator SHALL assign the Subdomain's members to their own concentric RadialRings centered on the Subdomain anchor, at radii proportional to those used for the parent cluster but scaled to the SubCluster's member count.
4. WHEN a Subdomain SubCluster is placed inside a parent Cluster, THE LayoutGenerator SHALL ensure the SubCluster does not overlap with members of the parent's own non-subdomain rings by reserving an angular wedge in whichever of Ring 2 or Ring 3 has more available (least-occupied) angular space, with the choice determined at layout-generation time based on measured angular occupancy.
5. THE LayoutGenerator SHALL distribute SubCluster members in full 360° around the Subdomain anchor, subject to the no-one-sided-spray constraint.

---

### Requirement 4: Semantically-Intelligent Angular Assignment

**User Story:** As a user reading the graph, I want sibling nodes that are conceptually related to appear adjacent to each other within a ring, so that local clusters feel meaningful and exploration is intuitive.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL group nodes within each RadialRing by semantic affinity before assigning angular positions, using the following priority order: (a) shared relationship type to the parent, (b) shared `primary_domain`, (c) IntraDegree similarity.
2. THE LayoutGenerator SHALL assign consecutive angular slots to nodes within the same affinity group, so that related siblings occupy a contiguous angular band within the ring.
3. THE LayoutGenerator SHALL compute the minimum angular delta between adjacent nodes in a ring using the formula: `delta_theta_i >= (rendered_diameter_i + rendered_diameter_{i+1} + gap_px) / ring_radius`, where `gap_px` is a configurable minimum gap constant, to prevent node-to-node overlap within a ring.
4. IF the minimum-spacing constraint for a ring causes total arc to exceed 360°, THEN THE LayoutGenerator SHALL expand the ring radius until all nodes fit within 360° at the required gap.
5. THE LayoutGenerator SHALL use a deterministic tie-breaking rule (lexicographic by node ID) for nodes with identical affinity scores, ensuring identical output for identical input.

---

### Requirement 5: Layout Determinism, Idempotence, and Canonical Truth

**User Story:** As a developer running CI, I want the layout generator to produce identical output for identical input and to preserve the canonical 607/1116 dataset invariants, so that layout regeneration is reproducible and never corrupts the graph truth.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL produce bit-identical `data/layout.json` output for identical `data/graph.json` input across multiple runs (determinism), using no time-based seeds, random number generators, or environment-dependent state.
2. WHEN `data/layout.json` already exists and contains coordinates for all current nodes, THE LayoutGenerator SHALL re-compute positions from scratch using the structured radial algorithm and overwrite the file (idempotence via canonical re-derivation, not by pinning old coordinates).
3. THE LayoutGenerator SHALL read and write exactly 607 node coordinate entries to `data/layout.json`, matching the canonical node count in `data/graph.json`.
4. THE LayoutGenerator SHALL preserve all canonical node IDs unchanged in the output coordinate map.
5. IF `data/graph.json` contains a number of nodes other than 607 or a number of edges other than 1116, THEN THE LayoutGenerator SHALL emit a warning to stderr but SHALL still complete successfully with the actual counts.
6. THE LayoutGenerator SHALL not modify any field of `data/graph.json` during layout generation.

---

### Requirement 6: Curved Edge Rendering

**User Story:** As a user viewing the atlas, I want all rendered edges to appear as smooth curves rather than straight lines, so that the graph feels organic and map-like, and overlapping edges remain visually distinguishable.

#### Acceptance Criteria

1. THE GraphCanvas SHALL render every visible edge as a CurvedEdge (circular arc, quadratic Bézier, or spline), with a configurable curvature parameter.
2. THE GraphCanvas SHALL NOT render any edge as a straight line segment in any camera state (OverviewState, ZoomState, SelectionState, DomainSelectionState).
3. WHEN Sigma's built-in edge programs do not natively support CurvedEdge rendering, THE GraphCanvas SHALL register a custom Sigma edge program that provides CurvedEdge rendering for all edge tiers.
4. THE GraphCanvas SHALL apply CurvedEdge rendering in production builds (i.e. after Vite tree-shaking and bundling), without degrading to straight lines. Non-production builds (development and test builds) may degrade to straight-line rendering without violating this requirement.
5. WHEN two edges share the same pair of endpoints (parallel edges), THE GraphCanvas SHALL assign different curvature offsets to each, so they remain visually distinct.

---

### Requirement 7: Multi-Tier Backbone Edge Selection

**User Story:** As a user viewing the overview, I want to see a carefully curated subset of edges that conveys the graph's structure and connectivity without overwhelming the visual, so that the atlas reads as connected and organized at first glance.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL compute an EdgePriority score for every edge in the canonical edge set using the formula: `EdgePriority = w1×HierarchyImportance + w2×RelationshipStrength + w3×EndpointImportance + w4×CrossDomainBonus − w5×VisualCrowdingPenalty`, where w1–w5 are configurable weight constants.
2. THE LayoutGenerator SHALL classify every edge into exactly one tier (TierA through TierD) and write the tier assignment to `data/layout.json` alongside each edge's canonical ID.
3. THE LayoutGenerator SHALL assign TierA to all `has_subdomain` edges and all `belongs_to_domain` edges between a DomainAnchor and a Ring 1 member.
4. THE LayoutGenerator SHALL assign TierB to the highest-scoring intra-domain edges that are not TierA, capped at a configurable per-domain maximum (default: 12 edges per domain).
5. THE LayoutGenerator SHALL assign TierC to cross-domain edges, selecting only those with EdgePriority above a configurable threshold, with a configurable atlas-wide cap (default: 20 cross-domain edges total).
6. THE LayoutGenerator SHALL assign TierD to all remaining edges.
7. WHEN the Atlas is in OverviewState, THE GraphCanvas SHALL render only TierA and TierB edges as visible, plus TierC edges up to the configured cross-domain cap.
8. THE total count of edges visible in OverviewState SHALL be between 100 and 170 (inclusive).
9. WHEN the Atlas transitions to ZoomState (camera ratio above the configured zoom threshold), THE GraphCanvas SHALL progressively reveal TierD edges within the zoomed cluster, in addition to all TierA–TierC edges.
10. ALL 1116 canonical edges SHALL remain present in the graph data structure at all times; tier assignment affects visibility only, not data integrity.

---

### Requirement 8: Cross-Domain Edge Styling

**User Story:** As a user tracing connections between different technology domains, I want cross-domain edges to look visually distinct from intra-domain edges, so that I can immediately tell when a connection bridges two separate fields.

#### Acceptance Criteria

1. THE GraphCanvas SHALL render TierC (cross-domain) edges with a stroke width at most 60% of the stroke width used for TierA intra-domain edges.
2. THE GraphCanvas SHALL render TierC edges at an opacity between 0.10 and 0.25 in OverviewState.
3. THE GraphCanvas SHALL render TierC edges with a soft glow or color distinct from intra-domain edge colors, using a configurable cross-domain edge color constant.
4. WHEN the Atlas is in OverviewState and the total number of visible TierC edges exceeds 20, THE GraphCanvas SHALL hide the lowest-priority TierC edges to enforce the cap.
5. WHEN a node is selected (SelectionState), THE GraphCanvas SHALL reveal all cross-domain edges of the selected node at full canonical visibility, overriding the overview TierC cap for that node only.

---

### Requirement 9: Interaction-Driven Edge Reveal

**User Story:** As a user interacting with a specific node or domain, I want to see all the relevant edges for my selection — including ones hidden at overview — so that I can fully explore a node's relationships without visual clutter in the default state.

#### Acceptance Criteria

1. WHEN a node is selected, THE GraphCanvas SHALL reveal all canonical edges incident to the selected node (TierA through TierD), rendered as CurvedEdges.
2. WHEN a node is selected, THE GraphCanvas SHALL dim all edges not incident to the selected node to an opacity ≤0.04.
3. WHEN a DomainAnchor is selected (DomainSelectionState), THE GraphCanvas SHALL highlight all member nodes of that domain and brighten all TierA and TierB edges within that domain's cluster.
4. WHEN a DomainAnchor is selected, THE GraphCanvas SHALL NOT render the full membership edge web (i.e. SHALL NOT draw `belongs_to_domain` edges for every member simultaneously, as this would create visual overcrowding).
5. WHEN the user deselects all nodes, THE GraphCanvas SHALL restore the pre-selection edge visibility based on the current camera state: IF the camera is in ZoomState (ratio above the configured zoom threshold), TierD edges that were visible due to zoom SHALL remain visible; only selection-driven edge highlights are removed. IF the camera is in OverviewState, the GraphCanvas SHALL restore TierA + TierB + TierC edge visibility within one animation frame.
6. WHEN the camera ratio crosses the configured zoom threshold into ZoomState, THE GraphCanvas SHALL reveal TierD edges for the cluster(s) in the viewport without requiring node selection.

---

### Requirement 10: Visual Hierarchy and Label Strategy

**User Story:** As a user scanning the atlas, I want the most important nodes (domain anchors and hubs) to stand out immediately, and labels to appear progressively as I zoom in, so that the overview is uncluttered but full information is always reachable.

#### Acceptance Criteria

1. THE GraphCanvas SHALL render DomainAnchor labels at all camera ratios in OverviewState, with a font size at least 50% larger than Concept node labels.
2. THE GraphCanvas SHALL render Subdomain anchor labels in OverviewState only when the layout has sufficient space (i.e. when the nearest neighboring label is more than 40px away in screen space).
3. THE GraphCanvas SHALL NOT render Concept or Technology node labels in OverviewState unless the node is hovered or selected.
4. WHEN the camera enters ZoomState and the viewport covers fewer than 3 domain clusters, THE GraphCanvas SHALL reveal Concept and Technology node labels for all nodes within the viewport.
5. WHEN a node is hovered, THE GraphCanvas SHALL immediately render that node's label regardless of camera ratio.
6. WHEN a node is selected, THE GraphCanvas SHALL render that node's label at full opacity and SHALL render labels for all of the selected node's direct neighbors.
7. THE GraphCanvas SHALL apply label collision avoidance so that no two rendered labels overlap, by suppressing lower-priority labels when collision is detected.

---

### Requirement 11: Sector Backplates and Center Identity

**User Story:** As a user viewing the atlas, I want each domain's territory to have a soft atmospheric tint and the center of the atlas to display the TechAtlas identity mark, so that the spatial structure is immediately readable and the graph feels like a curated map.

#### Acceptance Criteria

1. THE GraphCanvas SHALL render a SectorBackplate (soft radial tint or glow) behind each of the 14 top-level domain clusters, with each backplate centered on the DomainAnchor's position.
2. WHEN the radial-cluster layout changes DomainAnchor positions relative to the previous layout, THE GraphCanvas SHALL update SectorBackplate center positions to match the new DomainAnchor coordinates without requiring manual reconfiguration.
3. THE GraphCanvas SHALL assign each SectorBackplate the domain's canonical color with an opacity between 0.04 and 0.12, so the tint supports but does not dominate the node layer.
4. THE GraphCanvas SHALL render the CenterIdentity ("TechAtlas" title and concentric ring decoration) at the geometric center of the MacroRing, at all camera ratios in OverviewState.
5. WHEN the camera is in ZoomState and the center is outside the viewport, THE GraphCanvas SHALL not render the CenterIdentity.
6. THE GraphCanvas SHALL retain the SVG backdrop layer for SectorBackplates and CenterIdentity, synchronized to the Sigma camera transform at every frame.

---

### Requirement 12: Node Sizing by Importance

**User Story:** As a user reading the atlas, I want hub nodes to appear larger than leaf nodes, so that the most connected and important technologies are visually prominent and guide my eye toward the most structurally significant parts of the graph.

#### Acceptance Criteria

1. THE LayoutGenerator SHALL compute a rendered radius for every node using the existing `radii_for_dataset` function (from `sizing.py`), preserving the current sizing formula.
2. THE LayoutGenerator SHALL write each node's radius to `data/layout.json` in the coordinates entry for that node.
3. THE GraphCanvas SHALL apply each node's pre-computed radius from `data/layout.json` directly, without overriding it with a uniform constant.
4. WHEN a node is in Ring 1 of its cluster, its radius SHALL be at least 1.3× the median radius of Ring 3 nodes in the same cluster.
5. THE GraphCanvas SHALL render DomainAnchor nodes with a radius at least 2× the median radius of Technology nodes in the Atlas.

---

### Requirement 13: Preserved Existing Interactions

**User Story:** As a returning TechAtlas user, I want all existing interactions — Repo X-Ray, search, filters, mobile navigation, selection, zoom — to work exactly as before, so that the layout redesign does not break any workflow I depend on.

#### Acceptance Criteria

1. THE GraphCanvas SHALL preserve the Repo X-Ray StackView behavior: detected nodes projected into domain clusters, back-to-explore restoring the radial atlas view, canonical node IDs used throughout.
2. THE GraphCanvas SHALL preserve node selection: clicking a node selects it, highlights its neighborhood, dims unrelated content, and reveals the detail panel.
3. THE GraphCanvas SHALL preserve domain selection: clicking a DomainAnchor highlights all members and the detail panel shows domain metadata.
4. THE GraphCanvas SHALL preserve the search feature: searching for a node name focuses the camera on the matching node and selects it.
5. THE GraphCanvas SHALL preserve all active filters (node type, domain, relationship type): applying a filter hides non-matching nodes and edges and unhides them on filter removal, all without altering canonical graph data.
6. THE GraphCanvas SHALL preserve mobile navigation: pinch-to-zoom, tap-to-select, bottom-sheet detail panel.
7. WHEN the user triggers "Home" / explore-nonce reset, THE GraphCanvas SHALL animate the camera back to OverviewState framing the full atlas.

---

### Requirement 14: Test Suite Compatibility

**User Story:** As a developer merging the redesign, I want all existing automated tests to pass (with only the explicitly-anticipated visual-proof changes), so that the redesign does not introduce regressions in any other part of the system.

#### Acceptance Criteria

1. THE Atlas SHALL pass the backend test suite (`pytest`, `ruff`) without modification after the layout redesign.
2. THE Atlas SHALL pass the frontend TypeScript compilation (`tsc --noEmit`) after the redesign.
3. THE Atlas SHALL pass the frontend linter (`eslint`) after the redesign.
4. THE Atlas SHALL pass the frontend unit/integration test suite (`vitest --run`) after the redesign.
5. THE Atlas SHALL pass the Stack View regression test after the redesign.
6. THE Atlas SHALL pass the smoke test and X-Ray end-to-end test after the redesign.
7. WHEN the visual-proof harness (`overview-visual-proof.spec.ts`) is updated to reflect the new "all nodes visible" requirement, THE Atlas SHALL pass the updated harness asserting 607 individual visible nodes and 0 AggregateMarkers in OverviewState.
8. THE Atlas production bundle SHALL contain 0 occurrences of the `__ta_sigma` string after tree-shaking (deploy bundle integrity check).

---

### Requirement 15: Zero New Paid Services and No New Heavy Dependencies

**User Story:** As the TechAtlas maintainer operating on a $0 budget, I want the redesign to introduce no new paid infrastructure and no new heavy frontend dependencies, so that operating costs remain at zero and bundle size does not regress.

#### Acceptance Criteria

1. THE Atlas SHALL not introduce any new paid cloud service, API, or SaaS tool as part of this redesign.
2. THE LayoutGenerator SHALL not introduce any new Python dependency beyond those already in `requirements.txt` (or equivalent lock file) unless the new package is MIT/Apache-licensed and available on PyPI at no cost.
3. THE GraphCanvas SHALL implement CurvedEdge rendering using either Sigma's existing edge program API or an SVG overlay — not by adding a new WebGL shader library or a new graph-rendering framework.
4. WHEN a new npm package is required for CurvedEdge rendering support, THE package SHALL be MIT or Apache 2.0 licensed, have ≥1000 weekly downloads, and not increase the gzipped bundle size by more than 15 KB.
5. THE Atlas SHALL remain deployable to GitHub Pages with the existing GitHub Actions workflow, requiring no new deployment targets or build infrastructure.
