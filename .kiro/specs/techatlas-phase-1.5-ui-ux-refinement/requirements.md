# Requirements Document

## Introduction

TechAtlas Phase 1.5 UI/UX Refinement is a **frontend-only** visual and interaction
refinement of the existing TechAtlas application. It is not a rebuild, not a new rendering
engine, and not a backend, scanner, or dataset change. Every requirement reuses and
extends already-audited modules (`GraphCanvas.tsx`, `buildGraph.ts`, `scanOverlay.ts`,
`semanticZoom.ts`, `RepoXrayPanel.tsx`, `NodeDetailsPanel.tsx`, `XrayLegend.tsx`,
`FilterPanel.tsx`, `App.tsx`, and the `:root` design tokens in `styles.css`).

The dominant goal is to eliminate the "spiderweb" edge clutter, supported by a consistent
three-state visual model (Universe, Explore, Repo X-Ray), a label-priority system,
viewport-aware camera framing, a restructured Repo X-Ray sidebar, collapsible filter and
legend chrome, and Phase 1.5C presentation refinements (dependency classification display,
partial-scan flagging, non-discarding unmapped collapse, and presentation-only
concept-versus-tool separation). All changes must preserve both Vite builds (`dist` static
and `dist-xray` scanner-gated), the 417-node / 900-edge base graph, all verified
relationships, and all canonical scanner results.

The requirements below are grouped to mirror the design sections and the UI/UX
refinement phases, followed by non-functional requirements for performance,
regression-safety, accessibility, and reduced motion.

## Glossary

- **System**: The TechAtlas frontend application, including all refined rendering, panel, and interaction modules.
- **Graph_Canvas**: The Sigma.js v3 WebGL rendering surface (`GraphCanvas.tsx`) and its node/edge reducers.
- **Node_Reducer**: The per-node styling function in `Graph_Canvas` that computes display attributes per frame.
- **Edge_Reducer**: The per-edge styling function in `Graph_Canvas` that computes display attributes per frame.
- **Camera**: The Sigma camera controlling viewport position, ratio (zoom), and animation.
- **Overlay_Builder**: The pure overlay-derivation module (`scanOverlay.ts`) producing `ScanOverlay`.
- **Label_Engine**: The pure label-priority logic (`semanticZoom.ts`) that assigns label priority and selects persistent labels.
- **Xray_Panel**: The Repo X-Ray sidebar surface (`RepoXrayPanel.tsx`), sections A–G.
- **Node_Details_Panel**: The node detail surface (`NodeDetailsPanel.tsx`).
- **Filter_Panel**: The domain filter surface (`FilterPanel.tsx`).
- **Xray_Legend**: The detection-status legend surface (`XrayLegend.tsx`).
- **Universe_State**: The default visual state when no node is selected and no scan overlay is active.
- **Explore_State**: The visual state when a node is selected and no scan overlay is active.
- **Xray_State**: The visual state when a scan has completed and a scan overlay is active.
- **Background_Edge**: A base-graph edge not promoted by the active state (quiet default edge).
- **Verified_Edge**: A base-graph edge where both endpoints are detected nodes in the active scan.
- **Contextual_Edge**: A base-graph edge where exactly one endpoint is a detected node in the active scan.
- **Unrelated_Edge**: A base-graph edge where neither endpoint is a detected node in the active scan.
- **Detected_Node**: A graph node present in the active scan's detection set.
- **Detection_Status**: One of `confirmed`, `declared`, `inferred`, or `related` for a detected node.
- **Status_Ring**: The node border channel encoding `Detection_Status`, separate from domain fill.
- **Domain_Fill**: A node's fill color encoding its domain, sourced from `node.color`.
- **Popularity_Size**: A node's rendered size encoding popularity/connectivity, sourced from `node.size`.
- **Persistent_Label**: A label rendered for a `Detected_Node` in `Xray_State` regardless of zoom band, subject to the label budget.
- **Label_Budget**: The maximum number of persistent labels (`MAX_PERSISTENT_LABELS`).
- **Dependency_Classification**: The optional `direct` / `transitive` / `undetermined` field on a scan detection.
- **Partial_Scan**: A scan whose `scan.status` equals `partial`, indicating incomplete coverage.
- **Unmapped_Dependency**: A scanned dependency in `scan.unmapped` that did not match a canonical node.
- **Reduced_Motion**: The user preference `prefers-reduced-motion: reduce`.
- **Sidebar_Width**: The pixel width of the open right-edge panel (`Xray_Panel` or `Node_Details_Panel`), or 0 when none is open.

## Requirements

### Requirement 1: Quiet Background Edges

**User Story:** As a graph viewer, I want background edges to render faintly by default, so that the universe reads as a calm map rather than a bright spiderweb.

#### Acceptance Criteria

1. WHILE in Universe_State, THE Edge_Reducer SHALL render every Background_Edge with an opacity in the range 0.04 to 0.10 inclusive.
2. THE Graph_Canvas SHALL set the base-graph edge default color and size so that an unpromoted Background_Edge opacity falls within 0.04 to 0.10 inclusive.
3. THE System SHALL preserve every canonical base-graph edge and SHALL NOT delete any base-graph edge during rendering.
4. THE System SHALL NOT render any edge that is absent from the base-graph edge set.

### Requirement 2: Per-State Edge Prominence

**User Story:** As a graph viewer, I want edge prominence to reflect the current state, so that relevant relationships stand out while irrelevant ones recede.

#### Acceptance Criteria

1. WHILE in Explore_State, WHEN an edge touches the selected node, THE Edge_Reducer SHALL render that edge at prominent opacity in the range 0.50 to 0.60 inclusive.
2. WHILE in Explore_State, WHEN an edge does not touch the selected node, THE Edge_Reducer SHALL render that edge at an opacity at or below 0.05.
3. WHILE in Xray_State, WHEN an edge is a Verified_Edge, THE Edge_Reducer SHALL render that edge at an opacity in the range 0.60 to 0.80 inclusive.
4. WHILE in Xray_State, WHEN an edge is a Contextual_Edge, THE Edge_Reducer SHALL render that edge at an opacity in the range 0.15 to 0.30 inclusive.
5. WHILE in Xray_State, WHEN an edge is an Unrelated_Edge, THE Edge_Reducer SHALL render that edge at an opacity in the range 0.00 to 0.02 inclusive.

### Requirement 3: X-Ray Node Prominence

**User Story:** As a repository analyst, I want detected nodes to stand out and unrelated nodes to recede during a scan, so that the detected stack is immediately legible without a bright spiderweb.

#### Acceptance Criteria

1. WHILE in Xray_State, WHEN a node is a Detected_Node, THE Node_Reducer SHALL render that node at full opacity of 1.0.
2. WHILE in Xray_State, WHEN a node is not a Detected_Node, THE Node_Reducer SHALL render that node at an opacity in the range 0.10 to 0.20 inclusive.
3. WHILE in Xray_State, THE Graph_Canvas SHALL keep all Unrelated_Edge opacity at or below 0.02 so that the detected region does not read as a bright spiderweb.

### Requirement 4: Overlay Edge Integrity

**User Story:** As a repository analyst, I want the scan overlay to reflect only verified relationships, so that I never see fabricated connections.

#### Acceptance Criteria

1. WHEN the Overlay_Builder classifies edges, THE Overlay_Builder SHALL add an edge to the verified set only WHERE both endpoints are Detected_Nodes.
2. WHEN the Overlay_Builder classifies edges, THE Overlay_Builder SHALL add an edge to the contextual set only WHERE exactly one endpoint is a Detected_Node.
3. THE Overlay_Builder SHALL include in the overlay only edge identifiers that exist in the base-graph edge set.
4. WHEN a detection references a node identifier absent from the base graph, THE Overlay_Builder SHALL omit that detection from the overlay without creating a node.

### Requirement 5: Persistent Detected-Technology Labels

**User Story:** As a repository analyst, I want detected technologies to stay labelled during a scan, so that I can read the stack without zooming to each node.

#### Acceptance Criteria

1. WHILE in Xray_State, THE Label_Engine SHALL select a Persistent_Label for each Detected_Node subject to the Label_Budget, independent of the current zoom band.
2. THE Label_Engine SHALL limit the persistent-label set size to at most the Label_Budget of 30 simultaneously-shown persistent labels for any detected set, excluding the selected and hovered nodes which are labelled in addition.
3. WHILE in Xray_State, WHEN the count of Detected_Nodes exceeds the Label_Budget, THE Label_Engine SHALL rank candidates by priority descending, then popularity descending, then node-id ascending, and SHALL retain only the first Label_Budget candidates.
4. IF two candidates have equal priority and equal popularity, THEN THE Label_Engine SHALL order them by ascending node-id so that selection is reproducible.

### Requirement 6: Label Priority Order

**User Story:** As a graph viewer, I want the most relevant labels shown first when space is tight, so that important identity information is never crowded out by less relevant labels.

#### Acceptance Criteria

1. THE Label_Engine SHALL assign the highest label priority to the selected node.
2. WHERE no node is selected or the node is not selected, THE Label_Engine SHALL assign the next-highest label priority to the hovered node.
3. WHILE in Xray_State, THE Label_Engine SHALL rank a confirmed-status Detected_Node of high popularity above all other confirmed-status Detected_Nodes.
4. WHILE in Xray_State, THE Label_Engine SHALL rank confirmed-status Detected_Nodes above declared-status Detected_Nodes, declared above inferred, and all detected statuses above the semantic-zoom tier.

### Requirement 7: Semantic-Zoom Label Tiers

**User Story:** As a graph viewer, I want labels to reveal progressively as I zoom, so that the canvas stays readable at every zoom level.

#### Acceptance Criteria

1. WHILE in Universe_State, WHEN a node fails the semantic-zoom visibility test for the current zoom ratio, THE Node_Reducer SHALL render that node without a label.
2. WHILE in Universe_State, WHEN the zoom ratio corresponds to the overview band, THE Label_Engine SHALL prioritize domain-tier labels before concept-tier and technology-tier labels.
3. THE System SHALL render labels through the Graph_Canvas WebGL engine and SHALL NOT render graph node labels as individual document-object-model elements.

### Requirement 8: Label Legibility and Collision Avoidance

**User Story:** As a graph viewer, I want labels to remain readable against the dark canvas and not overlap, so that I can read identities without visual noise.

#### Acceptance Criteria

1. THE Graph_Canvas SHALL render label text with a contrast ratio of at least 4.5:1 against the dark canvas background.
2. THE Graph_Canvas SHALL apply collision avoidance using label density 0.7 and label grid cell size 70, suppressing the lower-priority label when two labels collide within a grid cell.
3. WHERE a cluster is dense, THE Graph_Canvas SHALL support beside-node label placement to reduce collisions.

### Requirement 9: Orthogonal Fill and Status Channels

**User Story:** As a graph viewer, I want domain color and detection status shown on separate visual channels, so that both reads remain legible simultaneously.

#### Acceptance Criteria

1. WHILE in Xray_State, WHEN a node is a Detected_Node, THE Node_Reducer SHALL render the node Domain_Fill equal to the node's source `color` value.
2. WHILE in Xray_State, WHEN a node is a Detected_Node, THE Node_Reducer SHALL encode Detection_Status only on the Status_Ring and SHALL NOT replace Domain_Fill with a status color.
3. THE System SHALL render the Status_Ring color distinct from every Domain_Fill color.

### Requirement 10: Preserved Sizing and Selection Emphasis

**User Story:** As a graph viewer, I want popularity sizing preserved and selection emphasized subtly, so that structural meaning stays stable while the active node is still clear.

#### Acceptance Criteria

1. THE Node_Reducer SHALL render each node at its source Popularity_Size and SHALL NOT change node size on selection or scan.
2. WHEN a node is selected, THE Node_Reducer SHALL emphasize that node without increasing its rendered size.
3. WHEN the Xray_State is entered or exited, THE System SHALL leave each node's Detection_Status value unchanged.

### Requirement 11: Initial Universe Framing

**User Story:** As a first-time viewer, I want the graph to open framed as a full universe with padding, so that I see an overview rather than a zoomed-in corner.

#### Acceptance Criteria

1. WHEN the application loads, THE Camera SHALL frame the full node spread with padding so the whole graph is visible.
2. WHEN the application loads, THE Camera SHALL set a zoom ratio clamped away from the minimum camera ratio so that labels remain readable.
3. THE Camera SHALL frame the initial view using the precomputed node coordinates and SHALL NOT trigger a relayout.

### Requirement 12: Viewport-Aware X-Ray Framing

**User Story:** As a repository analyst, I want the detected region framed clear of the open sidebar, so that highlighted nodes are not hidden behind the panel.

#### Acceptance Criteria

1. WHEN a scan completes, THE Camera SHALL frame the detected-region bounding box within the usable viewport computed as viewport width minus Sidebar_Width.
2. WHILE the sidebar is open on desktop, THE Camera SHALL bias the frame center away from the sidebar edge so that Detected_Nodes are not covered by the panel.
3. IF the Detected_Nodes lack coordinates, THEN THE Camera SHALL skip the fit and SHALL leave the current view unchanged.

### Requirement 13: Focus on Stack and Camera Stability

**User Story:** As a repository analyst, I want a prominent Focus-on-Stack control that works repeatedly without the graph jumping around, so that I can re-center on the detected stack on demand.

#### Acceptance Criteria

1. THE Xray_Panel SHALL present the Focus on Stack action with primary visual prominence among the panel actions.
2. WHEN the Focus on Stack action is activated, THE Camera SHALL frame the detected-region bounding box using the existing bounding-box fit.
3. WHEN the Focus on Stack action is activated repeatedly, THE Camera SHALL re-execute the fit on each activation.
4. WHEN a node is selected, THE Camera SHALL animate to the node and THE System SHALL NOT trigger a graph relayout.

### Requirement 14: Optional Camera Controls

**User Story:** As a graph viewer, I want optional zoom and reset controls, so that I can adjust the view without a mouse wheel.

#### Acceptance Criteria

1. WHERE camera controls are enabled, THE System SHALL present zoom-in, zoom-out, and reset-to-universe controls.
2. WHEN the zoom-in or zoom-out control is activated, THE Camera SHALL adjust the zoom ratio using the existing camera zoom interface.
3. WHEN the reset control is activated, THE Camera SHALL animate to the initial universe framing with Sidebar_Width treated as 0.

### Requirement 15: X-Ray Sidebar Information Hierarchy

**User Story:** As a repository analyst, I want the Repo X-Ray sidebar organized in a clear top-to-bottom hierarchy, so that I can scan from identity to detail quickly.

#### Acceptance Criteria

1. THE Xray_Panel SHALL render sections in the order header, repo identity, summary metrics, primary actions, grouped detected stack, unmapped dependencies, and coverage banner.
2. THE Xray_Panel SHALL render the repo identity section with owner and name link, description, primary language, commit SHA, and branch sourced from `scan.repository`.
3. WHERE the repository description exceeds the available width, THE Xray_Panel SHALL truncate the description without overflowing the section.
4. THE Xray_Panel SHALL provide an independent vertical scroll region so that long content scrolls without moving the Graph_Canvas.

### Requirement 16: Source-Backed Summary Metrics

**User Story:** As a repository analyst, I want summary counts read from real scanner output, so that the metrics always reflect the actual scan.

#### Acceptance Criteria

1. THE Xray_Panel SHALL render the detected-technology count from `scan.summary.matched_technology_count`.
2. THE Xray_Panel SHALL render the detected-concept count from `scan.summary.matched_concept_count`.
3. THE Xray_Panel SHALL render the unmapped count from `scan.summary.unmapped_package_count`.
4. THE Xray_Panel SHALL NOT display any summary count that is not sourced from the scanner output.

### Requirement 17: Primary Actions Hierarchy

**User Story:** As a repository analyst, I want clearly prioritized actions, so that I know the primary next step and can also reach secondary actions.

#### Acceptance Criteria

1. THE Xray_Panel SHALL present the actions Focus on Stack, Open GitHub, Analyze Another, and Back to Universe.
2. THE Xray_Panel SHALL render Focus on Stack with primary emphasis and the remaining actions with secondary emphasis.
3. WHEN the Back to Universe action is activated, THE System SHALL reset the scan overlay and return to Universe_State.

### Requirement 18: Grouped Detected Stack with Presentation-Only Separation

**User Story:** As a repository analyst, I want the detected stack grouped by domain with concepts separated from tools, so that I can read meaningful technologies first without any truth being altered.

#### Acceptance Criteria

1. THE Xray_Panel SHALL group detected rows by `node.primary_domain` and SHALL split rows into a tools group where `detection.node_type` equals `technology` and a concepts group where `detection.node_type` equals `concept`.
2. THE Xray_Panel SHALL render the tools group before the concepts group.
3. THE Xray_Panel SHALL render the union of detection rows equal to `scan.detections` so that no detection is dropped, duplicated, or reordered beyond a stable display sort within a group.
4. THE Xray_Panel SHALL NOT alter any detection's status, evidence, or canonical identity when grouping or splitting.
5. WHEN a detected row is activated, THE System SHALL navigate to the node via the focus callback and open the Node_Details_Panel.

### Requirement 19: Dependency Classification Display

**User Story:** As a repository analyst, I want dependency classification shown only where the scanner provides it, so that the display never implies information the scanner did not emit.

#### Acceptance Criteria

1. WHEN `detection.dependency_classification` is a non-null string, THE Xray_Panel SHALL render a classification badge showing that value.
2. IF `detection.dependency_classification` is null or absent, THEN THE Xray_Panel SHALL render no classification badge for that detection.
3. THE Xray_Panel SHALL render the classification value exactly as emitted and SHALL NOT substitute a default value.

### Requirement 20: Unmapped Dependencies Preservation

**User Story:** As a repository analyst, I want unmapped dependencies collapsed but never discarded, so that I can trust that all evidence is retained.

#### Acceptance Criteria

1. THE Xray_Panel SHALL render the unmapped-dependencies section collapsed by default.
2. THE Xray_Panel SHALL display an unmapped count equal to the length of `scan.unmapped`.
3. WHERE a large unmapped list is capped for display, THE Xray_Panel SHALL retain the full list and SHALL present a note that evidence is retained.
4. WHERE the evidence supports it, THE Xray_Panel SHALL show each unmapped entry's ecosystem and direct-or-transitive indicator.

### Requirement 21: Summary-to-Detail Navigation Without Stacked Panels

**User Story:** As a repository analyst, I want to move from summary to detail and back on a single surface, so that panels never stack on top of each other.

#### Acceptance Criteria

1. WHEN a detected row opens the Node_Details_Panel, THE System SHALL present the detail on the same right-edge surface as the Xray_Panel without layering a second floating panel.
2. WHEN the Node_Details_Panel is closed, THE System SHALL return to the X-Ray summary view.

### Requirement 22: Preserved Multi-Language Detection Display

**User Story:** As a repository analyst, I want detections across all supported languages shown, so that the sidebar reflects the scanner's full multi-language coverage.

#### Acceptance Criteria

1. THE Xray_Panel SHALL display detections for Rust, Java/Kotlin, Go, Python, and JavaScript/TypeScript ecosystems as emitted by the scanner.
2. THE Xray_Panel SHALL display detections for both single-component repositories and multi-component monorepos using the scanner's `component_paths` per workspace.
3. THE System SHALL preserve the 417-node base graph and all verified relationships when rendering any scan.

### Requirement 23: Partial Scan Flagging

**User Story:** As a repository analyst, I want partial scans clearly flagged, so that incomplete coverage never looks like full coverage.

#### Acceptance Criteria

1. WHEN `scan.status` equals `partial`, THE Xray_Panel SHALL render an always-visible partial banner in the coverage section.
2. WHEN `scan.status` equals `partial`, THE Xray_Panel SHALL surface `coverage.notes` alongside the partial banner.
3. THE Xray_Panel SHALL render the partial banner with warning styling visually distinct from normal content and SHALL NOT suppress the partial banner.

### Requirement 24: Collapsible Filter Panel

**User Story:** As a graph viewer, I want the domain filter panel collapsible and out of the way during a scan, so that it does not compete with the X-Ray panel.

#### Acceptance Criteria

1. THE Filter_Panel SHALL support a collapsed and an expanded display mode.
2. WHEN the Xray_State is entered, THE Filter_Panel SHALL automatically minimize.
3. WHILE the Filter_Panel is minimized, THE System SHALL present a control to reopen the Filter_Panel.

### Requirement 25: Compact Detection Legend

**User Story:** As a repository analyst, I want a compact status legend, so that I can interpret rings without a wide bar crowding the canvas.

#### Acceptance Criteria

1. THE Xray_Legend SHALL present Confirmed, Declared, Inferred, and Related statuses as a compact floating or popover element.
2. THE Xray_Legend SHALL render interactive controls with styling visually distinct from non-interactive labels.
3. THE Xray_Legend SHALL convey each status with a text label in addition to color.

### Requirement 26: Interaction and Animation Polish

**User Story:** As a graph viewer, I want responsive, restrained transitions, so that the interface feels smooth without jarring motion.

#### Acceptance Criteria

1. WHEN a node is hovered, THE System SHALL render updated hover feedback on the next animation frame via a requestAnimationFrame-coalesced refresh, with no more than one refresh per frame regardless of hover event count.
2. WHEN a node selection changes AND Reduced_Motion is not set, THE System SHALL perform a single animated camera transition of duration between 500 and 600 milliseconds to the new view.
3. WHEN the Camera moves, THE Camera SHALL complete the move as a single animated transition with no instant jump to the target, SHALL keep the camera ratio clamped within the minimum and maximum camera-ratio bounds at every point during the transition, and SHALL NOT recenter when the node selection is unchanged.
4. WHEN a scan completes AND Reduced_Motion is not set, THE System SHALL play a single completion animation of duration between 500 and 600 milliseconds without triggering a camera recenter.
5. WHILE Reduced_Motion is set, WHEN a node selection changes, THE System SHALL apply the new view using animation duration 0 milliseconds.
6. WHILE Reduced_Motion is set, WHEN a scan completes, THE System SHALL apply the completion state using animation duration 0 milliseconds.

### Requirement 27: Responsive Layout

**User Story:** As a user on any device, I want the layout adapted to my screen, so that the graph and repo results remain usable from desktop to mobile.

#### Acceptance Criteria

1. WHERE the viewport width is greater than or equal to 1024px, THE System SHALL present a graph-first layout with side panels, each side panel occupying a width between 360px and 420px inclusive.
2. WHERE the viewport width is between 640px and 1023px inclusive, THE System SHALL present collapsible side panels occupying a width between 360px and 420px inclusive when expanded and 0px when collapsed.
3. WHERE the viewport width is less than 640px, THE System SHALL present a full-screen graph with a floating search control, a bottom-sheet surface for repo results, and touch-based navigation.
4. THE System SHALL display all critical information through a persistently visible element that does not require a pointer hover, focus, or tap to reveal it.

## Non-Functional Requirements

### Requirement 28: Accessibility (NFR)

**User Story:** As a user relying on assistive technology, I want the refined interface to be operable and perceivable, so that I can use TechAtlas without a mouse or color perception.

#### Acceptance Criteria

1. WHEN a user navigates using only a keyboard, THE System SHALL make every interactive control reachable and operable via keyboard input (Tab, Shift+Tab, Enter, Space, and arrow keys as applicable).
2. WHILE an interactive control has keyboard focus, THE System SHALL display a visible focus indicator with a contrast ratio of at least 3:1 against adjacent colors.
3. WHEN search suggestions are displayed, THE System SHALL expose them using ARIA listbox semantics for the container and ARIA option semantics for each suggestion, navigable and selectable by keyboard.
4. THE System SHALL convey each detection status using a persistent text label in addition to any color, so the status is identifiable when color is not perceived.
5. THE System SHALL render all text with a contrast ratio of at least 4.5:1 against its background, except large-scale text (>= 18pt, or 14pt bold) and the boundaries of interactive UI components and meaningful graphics, which SHALL have a contrast ratio of at least 3:1 against adjacent colors.
6. THE System SHALL expose each repository finding to screen readers with a programmatically determinable name and role, and SHALL make every repository finding reachable and operable by keyboard without requiring direct graph interaction.
7. WHEN a sidebar category has keyboard focus and the user presses Enter or Space, THE System SHALL toggle that category between expanded and collapsed and SHALL expose the current state to screen readers.

### Requirement 29: Reduced Motion (NFR)

**User Story:** As a motion-sensitive user, I want animations disabled when I request reduced motion, so that the interface does not cause discomfort.

#### Acceptance Criteria

1. WHILE Reduced_Motion is set, THE Camera SHALL use an animation duration of 0 for all camera movements.
2. WHILE Reduced_Motion is set, THE System SHALL suppress non-essential transition and choreography animations.

### Requirement 30: Performance (NFR)

**User Story:** As a graph viewer, I want the refined rendering to stay fast, so that interaction remains fluid on the full dataset.

#### Acceptance Criteria

1. THE System SHALL render the graph using the Sigma.js WebGL engine and SHALL reuse the existing Graphology graph data.
2. THE System SHALL NOT trigger a graph relayout on hover, selection, filter, or scan-overlay changes.
3. THE System SHALL NOT render graph node labels as hundreds of individual document-object-model elements.
4. THE System SHALL compute neighborhood lookups and persistent-label selection using memoized results rather than per-frame recomputation.
5. THE System SHALL maintain interactive rendering with the full 417-node / 900-edge dataset and realistic scan overlays.

### Requirement 31: Regression Safety (NFR)

**User Story:** As a maintainer, I want the UI refinement to leave all non-visual behavior untouched, so that no functionality regresses.

#### Acceptance Criteria

1. THE System SHALL NOT change scanning, detection classification, canonical node identifiers, graph relationships, the dataset, or popularity values as part of this phase.
2. THE System SHALL preserve search, domain filters, Wikipedia summaries, documentation links, evidence URLs, search aliases, and deep links.
3. THE System SHALL preserve both deployment builds, deployment configuration, rate limiting, backend security, and caching.
4. THE System SHALL NOT modify backend or scanner logic in this phase.
5. THE System SHALL keep Phase 1E and Phase 2 work on hold and SHALL NOT include their scope in this phase.

### Requirement 32: Camera and Coordinate Stability (NFR)

**User Story:** As a graph viewer, I want node positions to stay fixed, so that the map is spatially stable across every interaction.

#### Acceptance Criteria

1. THE System SHALL rebuild the graph instance only when the graph data identity or selection-callback identity changes.
2. WHEN the state transitions between Universe_State, Explore_State, and Xray_State, THE System SHALL keep every node's coordinates equal to the values produced by the graph build.
