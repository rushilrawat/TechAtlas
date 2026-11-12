# Design Document

## Explore-view Radial Atlas Redesign

---

## Overview

This redesign replaces TechAtlas's current "structured-atlas-ring+radial-fan" visualization with a "two-level-radial-cluster" layout. The fundamental change is architectural: the old approach places domain anchors on a ring and sprays most member nodes outward one-sidedly into wedge sectors, hiding the majority behind LOD aggregate markers at the overview zoom level. The new approach centers each domain anchor inside its own cluster, arranges all members in full 360° concentric rings around that anchor, renders all 607 nodes individually at overview, and controls edge clutter through a principled multi-tier backbone scoring system rather than a node-hiding LOD system.

The redesign has two major components that must be coordinated:

1. **Layout algorithm** (`scripts/generate_layout.py`): A new pure Python function that replaces the current `generate()` function. Input is `data/graph.json`; output is `data/layout.json` with node coordinates, edge tier assignments, and an empty `overview_aggregates` list.
2. **Frontend renderer** (`frontend/src/components/GraphCanvas.tsx` and supporting modules): Remove the LOD aggregate system, add edge tier–driven visibility, add curved edge rendering, and apply an opacity hierarchy based on ring assignment.

All existing user interactions (selection, domain highlight, search, Repo X-Ray, Stack View, mobile navigation, zoom) are preserved unchanged. The $0 infrastructure budget is maintained.

---

## Architecture

The system has three layers that interact around the `data/layout.json` artifact:

```
┌─────────────────────────────────────────────────────────┐
│               OFFLINE  (CI / developer machine)         │
│                                                         │
│  data/graph.json ──► generate_layout.py ──► data/layout.json │
│  (607 nodes, 1116 edges)    (new algorithm)    (coordinates + edge_tiers) │
└─────────────────────────────────────────────────────────┘
          │ layout.json committed to repo
          ▼
┌─────────────────────────────────────────────────────────┐
│               BUILD (GitHub Actions / Vite)             │
│                                                         │
│  GraphService (graph_service.py) reads graph.json +     │
│  layout.json, produces GraphResponse with edge_tiers.   │
│  build_static_api.py serializes to frontend/public/api/ │
└─────────────────────────────────────────────────────────┘
          │ static JSON served to browser
          ▼
┌─────────────────────────────────────────────────────────┐
│               FRONTEND (Sigma.js + Graphology)          │
│                                                         │
│  buildGraph.ts:   parse GraphResponse → Graphology graph │
│                   (including edge_tiers, ring assignments)│
│  GraphCanvas.tsx: Sigma renderer, node/edge reducers,   │
│                   curved edge program, backdrop overlay  │
└─────────────────────────────────────────────────────────┘
```

The layout algorithm is a pure function with no runtime dependencies on the frontend. The frontend is fully driven by the pre-computed layout; no physics simulation runs in the browser.

### Data flow for edge tiers

`generate_layout.py` computes a tier for each of the 1116 canonical edges and writes them to `layout.json` under the key `edge_tiers: { "e0": "TierA", "e1": "TierB", ... }`. `GraphService._load()` reads this dict. `GraphService.graph()` is extended to return it. `GraphResponse` gains an optional `edge_tiers: dict[str, str]` field. `build_static_api.py` includes it in the `graph.json` static payload. `buildGraph.ts` stores it on each Graphology edge as the attribute `tier`. The `edgeReducer` in `GraphCanvas.tsx` reads `data.tier` to decide visibility.

### Data flow for ring assignment

`generate_layout.py` writes a `ring` field (integer 0, 1, 2, 3 — 0 = domain anchor) per node in the `coordinates` map. `GraphService._to_graph_node()` does not need to expose this separately; `buildGraph.ts` reads `coord.ring` from the raw layout data (accessed via the GraphResponse node's existing `cluster`/coord fields, or added as a new `ring` field to `GraphNode`). The `nodeReducer` reads `data.ring` to apply the correct opacity.

---

## Components and Interfaces

### Component 1: `generate_layout.py` — Two-Level Radial Cluster Algorithm

The existing file structure is preserved: same imports, same `_resolve_overlaps()` helper (unchanged), same `sizing.py` usage, same `main()` entry point, same `DATASET` / `OUTPUT` path constants. Only the `generate()` function body is replaced. The `_order_domains()`, `_seeded_unit()`, `_bh_force()`, `_QuadNode` helpers, and `_build_overview_aggregates()` are removed.

New configurable constants (replacing old ones):

```python
# MacroRing and cluster geometry
MACRO_RING_R = 2800.0       # radius of the domain-anchor circle (graph units)
CLUSTER_R1   = 350.0        # Ring1 radius for average-size domains
CLUSTER_R2   = 650.0        # Ring2 radius
CLUSTER_R3   = 950.0        # Ring3 radius
RING1_THRESH = 4            # IntraDegree ≥ this → Ring1
RING2_THRESH = 2            # IntraDegree ≥ this (and < RING1_THRESH) → Ring2
GAP_PX       = 6.0          # minimum pixel gap between adjacent nodes in a ring

# EdgePriority weights
EP_W1 = 2.0   # HierarchyImportance
EP_W2 = 1.5   # RelationshipStrength
EP_W3 = 1.0   # EndpointImportance
EP_W4 = 0.8   # CrossDomainBonus
EP_W5 = 0.3   # VisualCrowdingPenalty

TIER_C_THRESHOLD  = 0.6     # minimum EdgePriority for a TierC (cross-domain) edge
TIER_C_CAP        = 20      # max TierC edges atlas-wide
TIER_B_PER_DOMAIN = 12      # max TierB edges per domain
```

The new `generate()` function pipeline:

**Step 1 — Classify domains and members** (same as existing): identify `top_domains` (excluding subdomains via the `ROOT_DOMAIN` exclusion and `has_subdomain` parent detection). Identify `subdomains` (3: `computer-architecture`, `embedded`, `computer-graphics`) and their `parent_of` mapping. Compute `members` per top-level sector using `sector_of()`.

**Step 2 — Macro-ring placement**: Order the 14 top-level domain anchors using the existing `CURATED` list (preserving deterministic curated ordering). Compute angular spans proportional to `sqrt(max(len(members[d]), 1))`, normalized to `2π`. Place each domain anchor at `(MACRO_RING_R * cos(θ), MACRO_RING_R * sin(θ))` where `θ` is the wedge center. Starting angle is `-π/2` (top of circle, clockwise). This produces 14 `(cx, cy)` positions — stored as the domain anchor's final position.

**Step 3 — Compute ring radii per domain**: Base radii are `CLUSTER_R1, R2, R3`. Scale factor for small domains (member count ≤ 15): multiply by `0.6`. Scale factor for large domains (> 50 members): multiply by `1.2`. Apply the same scale factor to all three radii so the cluster proportions remain consistent.

**Step 4 — Ring assignment**: For each top-level domain's members, sort by `(-intra_deg[nid], -radius[nid], nid)` (deterministic, hubs first). Assign to Ring1 if `intra_deg[nid] >= RING1_THRESH`, Ring2 if `>= RING2_THRESH`, Ring3 otherwise. Store as `ring_of: dict[str, int]`.

**Step 5 — Sub-cluster placement (3 subdomains)**: For each subdomain `s` with parent `p`:
- Reserve an angular wedge within the parent's Ring2/Ring3 zone. Choose the wedge center as the least-populated 60° sector of the parent's Ring2 angular span (deterministic: iterate in `CURATED` order, pick the angular sector with the fewest existing Ring2 members within ±30°).
- Place the subdomain anchor at `parent_cx + R_sub * cos(wedge_center)`, `parent_cy + R_sub * sin(wedge_center)` where `R_sub = (CLUSTER_R1 + CLUSTER_R2) / 2 * scale` (sits between Ring1 and Ring2 of the parent).
- Assign the subdomain's direct members to their own concentric mini-rings around the subdomain anchor. Mini-ring radii: `R1_sub = CLUSTER_R1 * scale_sub`, where `scale_sub = sqrt(len(subdomain_members) / max(len(parent_members), 1))`. Distribute mini-ring members in 360° using the same angular-collision formula.

**Step 6 — Angular assignment per ring**: For each domain and each ring:
- Group members by affinity: primary sort by shared `relationship_type` to the parent anchor, secondary by `primary_domain` subtype, tertiary by `intra_deg` band. Use `sorted()` with a deterministic tuple key.
- Compute minimum angular step for each node pair: `delta_theta_min_i = (radius[n_i] + radius[n_{i+1}} + GAP_PX) / ring_radius`.
- Compute total minimum arc: `total = sum(delta_theta_min_i)`. If `total > 2π`, expand the ring radius: `ring_radius = max(ring_radius, total * ring_radius / (2π))` and recompute deltas. Iterate until `total ≤ 2π` (convergence is guaranteed since radii are bounded).
- Distribute nodes evenly across 360°: `theta_i = start_angle + i * (2π / len(ring_members))` with the start angle set to `-π/2 + small_seeded_offset` (using `_seeded_unit(domain_id + ":ring" + str(ring))` for a deterministic per-ring start that breaks the "all rings start at the same angle" symmetry).
- Result: `pos[nid] = [cx + r*cos(theta_i), cy + r*sin(theta_i)]`.

**Step 7 — EdgePriority scoring and tier assignment**: For each edge in `data["edges"]`:
- Compute component scores:
  - `HierarchyImportance`: 1.0 if `relationship_type in ("has_subdomain", "belongs_to_domain")` and target is Ring1; 0.5 if `belongs_to_domain` and target is Ring2; 0.0 otherwise.
  - `RelationshipStrength`: `REL_ATTRACTION.get(relationship_type, DEFAULT_ATTRACTION) / 2.2` (normalized to 0–1).
  - `EndpointImportance`: `(radius[source] + radius[target]) / (2 * MAX_RADIUS)` where `MAX_RADIUS = max(radius.values())`.
  - `CrossDomainBonus`: `0.3` if `domain_of[source] != domain_of[target]`, else 0.
  - `VisualCrowdingPenalty`: `min(0.5, (degree[source] + degree[target]) * 0.05)`.
  - `EdgePriority = EP_W1*H + EP_W2*R + EP_W3*E + EP_W4*C - EP_W5*P`.
- Tier assignment pass (in order; first match wins):
  - **TierA**: `relationship_type == "has_subdomain"` OR (`relationship_type == "belongs_to_domain"` AND `ring_of.get(target, 99) == 1`).
  - **TierB**: intra-domain edge (same `domain_of[source]` and `domain_of[target]`), not TierA, among the top `TIER_B_PER_DOMAIN` by EdgePriority within the domain.
  - **TierC**: cross-domain edge, `EdgePriority >= TIER_C_THRESHOLD`, and the atlas-wide TierC count has not yet reached `TIER_C_CAP` (sort cross-domain edges by EdgePriority descending, assign TierC to the top `TIER_C_CAP`).
  - **TierD**: all remaining edges.
- Edge IDs in the backend are generated as `f"e{i}"` in `GraphService._load()`; in the layout script they are identified by their index position matching the `data["edges"]` list order. The layout uses the same index-based key `f"e{i}"` to produce the `edge_tiers` dict.

**Step 8 — Overlap resolution**: Call the existing `_resolve_overlaps(ids, pos, radius, anchor={})` with no frozen nodes and no anchors (the overlap pass must not tether anchors in the new algorithm — anchors are re-pinned in step 9). Pass `OVERLAP_MARGIN = 4.0` (unchanged constant).

**Step 9 — Re-pin domain anchors**: After the overlap pass, the 14 domain anchors and 3 subdomain anchors will have drifted. Re-set each anchor's position to its computed `(cx, cy)` from Steps 2/5 exactly, so the MacroRing constraint is preserved in the final output.

**Step 10 — Output**: Write `layout.json`:
```python
{
    "layout_version": dataset["version"],
    "layout_algorithm": "two-level-radial-cluster",
    "domain_ring_order": ordered,           # list of 14 top-level domain IDs
    "coordinates": {                        # 607 entries
        nid: {
            "x": round(pos[nid][0], 2),
            "y": round(pos[nid][1], 2),
            "radius": radius[nid],
            "cluster": domain_of.get(nid, nid),
            "ring": ring_of.get(nid, 0),    # 0=domain anchor, 1/2/3=member ring
        }
        for nid in ids
    },
    "edge_tiers": edge_tiers,               # {"e0": "TierA", ...} all 1116 edges
    "overview_aggregates": [],              # LOD system retired
}
```

The `_build_overview_aggregates()` function is removed. The output invariant check (no double-count) is removed since `overview_aggregates` is always empty.

### Component 2: Backend / API Surface Changes

**`backend/app/models.py`**: Add `edge_tiers: dict[str, str] = Field(default_factory=dict)` to `GraphResponse`. No other model changes needed.

**`backend/app/graph_service.py`**: In `_load()`, add: `self._edge_tiers: dict[str, str] = layout.get("edge_tiers", {})`. In `graph()`, return edge tiers alongside nodes and edges (the method signature can stay the same; the caller assembles `GraphResponse`). Expose via a new `edge_tiers()` method or inline in the route handler. The cleanest path is to add `self._edge_tiers` to the `GraphResponse` construction in the route handler (`app/routes.py` or wherever `/api/v1/graph` is assembled). The `overview_aggregates()` method returns an empty list for new layouts and falls back to existing behavior for pre-migration layouts.

**`scripts/build_static_api.py`**: In `main()`, update the `graph_payload` dict:
```python
graph_payload = {
    ...
    "edge_tiers": svc._edge_tiers,           # add this line
    "overview_aggregates": [_model(a) for a in svc.overview_aggregates()],
}
```

### Component 3: Frontend Type / Graph Changes

**`frontend/src/api/types.ts`**: Add to `GraphResponse`:
```typescript
/** Per-edge backbone tier. Keys match edge ids ("e0", "e1", …). Absent on older payloads. */
edge_tiers?: Record<string, string>;
```
Add `ring?: number` to `GraphNode` (0 = domain anchor, 1/2/3 = member ring).

**`frontend/src/graph/buildGraph.ts`**: In the edge loop inside `buildGraph()`, add:
```typescript
graph.addEdgeWithKey(key, e.source, e.target, {
  relationshipType: e.relationship_type,
  tier: (data.edge_tiers ?? {})[key] ?? "TierD",  // default TierD if missing
  size: BASE_EDGE_SIZE,
  color: BASE_EDGE_COLOR,
});
```
In the node loop, add `ring: n.ring ?? 0` to the node attribute set. The `aggregateMemberIds()` function and `isAggregate` node creation block can remain in the file for backward compatibility with old layouts but will produce 0 aggregate nodes for new layouts (the `data.overview_aggregates ?? []` loop will iterate over an empty list).

### Component 4: `GraphCanvas.tsx` — LOD Removal and Renderer Updates

**A) LOD aggregate system removal**

The following refs and their initialization code are removed:
- `sectorMarkerIdsRef`, `memberToDomainRef`, `aggregateIdsRef`, `aggregateLabelRef`
- `suppressedLabelsRef`, `labelSettleRef`, `recomputeLabelsRef`
- The `activeDomainRef` ref can be simplified (still needed for domain selection highlight but no longer needs to track aggregate-specific logic)
- The `Overview LOD precompute` block inside `useEffect([data, onSelect])` is removed
- The `recomputeOverviewLabels()` function is removed
- The `Overview LOD` section of the `nodeReducer` (the `isAgg` check, sector collapse, marker show/hide logic) is removed
- The `labelSettleRef` timeout in the camera `updated` handler is removed
- The `fitExplore()` function is updated: remove the `hasMarkers` / aggregate-marker extent branch; frame all 607 nodes directly (the `!hasMarkers` branch already does this correctly, so simplify to always use it)

After removal, the node reducer's "no active" branch handles: filter visibility → repo X-Ray overlay → semantic zoom label gating → neighbor set dimming. Nodes are never hidden for LOD reasons.

**B) Edge tier visibility**

Add `edgeTiersRef = useRef<Map<string, string>>(new Map())` to the component. Populate it inside `useEffect([data, onSelect])` after `buildGraph()`:
```typescript
const tiers = new Map<string, string>();
graph.forEachEdge((id, a) => tiers.set(id, (a.tier as string) ?? "TierD"));
edgeTiersRef.current = tiers;
```

In the `edgeReducer`, replace the existing "no active" branch logic:
```typescript
if (!active) {
  const tier = edgeTiersRef.current.get(edge) ?? "TierD";
  const band = bandOf(ratioRef.current);
  
  if (band <= 1) {
    // Overview: show TierA, TierB, TierC; hide TierD
    if (tier === "TierD") return { ...dataIn, hidden: true };
    // TierC styling: thinner, lower opacity, distinct color
    if (tier === "TierC") return { ...dataIn, color: TIERCE_EDGE, size: 0.25, zIndex: 0 };
    // TierA/TierB: the structural backbone
    if (tier === "TierA") return { ...dataIn, color: TIERA_EDGE, size: 0.5, zIndex: 1 };
    return { ...dataIn, color: TIERB_EDGE, size: 0.35, zIndex: 0 };  // TierB
  }
  // Detail zoom (band === 2): show all tiers
  const rt = dataIn.relationshipType as string | undefined;
  if (rt === "belongs_to_domain" || rt === "has_subdomain") {
    return { ...dataIn, hidden: true };
  }
  return { ...dataIn, color: REST_EDGE, zIndex: 0 };
}
```

New color constants:
```typescript
const TIERA_EDGE   = "rgba(160,180,220,0.45)";   // structural backbone, visible
const TIERB_EDGE   = "rgba(140,160,200,0.25)";   // intra-domain backbone, moderate
const TIERCE_EDGE  = "rgba(220,180,120,0.18)";   // cross-domain bridge, warm tint
```

The selection branch (active node set) is unchanged: all incident edges become `ACTIVE_EDGE` at full visibility regardless of tier.

**C) Curved edge rendering**

`@sigma/edge-curve` is not in `package.json` (confirmed from the current dependency list). The package is part of the Sigma v3 ecosystem and is MIT licensed. The implementation approach is:

Install `@sigma/edge-curve` as a runtime dependency. If the package is available on npm with ≥1000 weekly downloads and the gzipped size increase is ≤15 KB (both expected for a first-party Sigma package), add it to `dependencies` in `package.json`.

In `GraphCanvas.tsx`, import and register the curved edge program:
```typescript
import { EdgeCurveProgram, EdgeArrowHeadProgram } from "@sigma/edge-curve";
```

In the `new Sigma(graph, container, settings)` call, change:
```typescript
defaultEdgeType: "curved",
edgeProgramClasses: {
  curved: EdgeCurveProgram,
},
```

For parallel edges (multi-graph), Sigma's `@sigma/edge-curve` supports a `curvature` attribute per edge. In `buildGraph.ts`, when adding edges, detect parallel edges and assign curvature offsets:
```typescript
// After the edge loop, detect parallel pairs and assign curvature
graph.forEachEdge((id, a, source, target) => {
  const parallels = graph.filterEdges(source, target, () => true);
  if (parallels.length > 1) {
    parallels.forEach((pid, idx) => {
      graph.setEdgeAttribute(pid, "curvature", 0.15 + idx * 0.15);
    });
  } else {
    graph.setEdgeAttribute(id, "curvature", 0.2);  // default slight curve
  }
});
```

Cross-domain TierC edges receive a lower curvature (0.12) to appear more "bridge-like" — set during the tier-aware edge initialization pass.

If `@sigma/edge-curve` cannot be installed (package unavailable or bundle size > 15 KB gzipped), a fallback custom edge program is implemented as a ~80-line TypeScript module in `frontend/src/graph/edgeCurveProgram.ts` using Sigma's `AbstractEdgeProgram` base class and a WebGL quadratic Bézier shader. The Bézier control point is computed as: `midpoint + offset * perpendicular_normal`, where `offset = curvature * edge_length`. This fallback requires no new npm packages.

**D) Node opacity hierarchy**

In the `nodeReducer`, within the "no active" branch (after filter check, after LOD removal), add:
```typescript
const ring = (dataIn.ring as number | undefined) ?? 0;
const baseOpacity = ring === 0 ? 1.0 :    // domain anchor
                    ring === 1 ? 0.90 :   // hub concepts/technologies
                    ring === 2 ? 0.75 :   // mid-tier
                                 0.50;    // Ring3 leaf technologies
// Apply via color alpha channel (Sigma does not have a separate opacity attribute)
// Only modify alpha for non-domain nodes; domain anchors keep full color
if (ring > 0 && dataIn.color) {
  const c = dataIn.color as string;
  if (c.startsWith("#") && c.length === 7) {
    res.color = hexWithAlpha(c, baseOpacity);
  }
}
```

Where `hexWithAlpha(hex, alpha)` is a small inline helper that converts a hex color to `rgba(r,g,b,alpha)`. Domain anchors (ring = 0) are left with their full color unchanged.

**E) Label strategy**

The existing `labelVisibleAtRatio()` function in `semanticZoom.ts` is used as-is. The `labelVisible()` inner function in `GraphCanvas` is simplified to remove the `isAggregate` forceLabel path. The label gating logic becomes:

```
- Overview band (≤1): DomainAnchors always labeled (nodeType === "domain"). 
  Subdomains: apply placeLabels collision check from overviewLod.ts for the ~3 subdomain labels.
  Concepts/Technologies: no label unless hovered or selected.
- Detail band (2): all nodes labeled (labelVisibleAtRatio returns true for all).
- Hover/selection: always labeled regardless of band (existing behavior preserved).
```

The `placeLabels()` function from `overviewLod.ts` is reused for the subdomain label pass (called once on camera settle for ≤3 subdomain candidates — negligible overhead).

**F) Sector backplates**

The `domainGeomRef` computation inside the backdrop `useEffect` is updated:

```typescript
// New: use the domain anchor's own position as the cluster center
// (the anchor IS the cluster center in the radial design)
for (const d of doms) {
  if (!graph.hasNode(d.id)) continue;
  const gx = graph.getNodeAttribute(d.id, "x") as number;
  const gy = graph.getNodeAttribute(d.id, "y") as number;
  // gr = R2 constant from layout (approximate: use the mean distance from anchor to 
  // its Ring2 members, or fall back to CLUSTER_R2 * 1.1 if unavailable)
  let gr = CLUSTER_R2 * 1.1;  // default; overridden below
  let totalDist = 0, ring2Count = 0;
  graph.forEachNode((id, a) => {
    if (a.primaryDomain === d.id && (a.ring as number) === 2) {
      totalDist += Math.hypot((a.x as number) - gx, (a.y as number) - gy);
      ring2Count++;
    }
  });
  if (ring2Count > 0) gr = (totalDist / ring2Count) * 1.2;  // slight padding
  geom.set(d.id, { gx, gy, gr });
}
```

`CLUSTER_R2` is imported/known as a constant (1.1× for backplate padding); this constant does not need to be shared between Python and TypeScript — the approximate value (`650 * 1.1 ≈ 715`) can be hardcoded as a fallback in the TS backdrop computation, with the live Ring2 distance measurement taking precedence when members are available.

**G) `overview-visual-proof.spec.ts` updates**

The harness already measures `visibleIndividualNodes`, `visibleMarkers`, and `aggregatedNodeCount` separately. The assertions are updated to reflect the new layout:

```typescript
// New assertion: 607 individual nodes, 0 markers, 0 aggregated
expect(m.visibleIndividualNodes, "all 607 nodes visible individually").toBe(607);
expect(m.visibleMarkers, "no aggregate markers").toBe(0);
expect(m.aggregatedNodeCount, "no aggregated members").toBe(0);

if (vp.desktop) {
  // With 607 nodes visible, some circle overlap is expected and acceptable at the 
  // Ring3 periphery (small-radius nodes in dense outer rings). Allow ≤50 intersections
  // at desktop resolution (design intent: richness, not emptiness).
  expect(m.visibleCircleIntersections, "visible circle intersections").toBeLessThanOrEqual(50);
  expect(m.priorityLabelCollisions, "priority label collisions").toBe(0);
  // TierA + TierB + TierC edges at overview: 100–170 total
  expect(m.ordinaryEdgesVisible, "edges visible at overview").toBeGreaterThanOrEqual(100);
  expect(m.ordinaryEdgesVisible, "edges visible at overview").toBeLessThanOrEqual(170);
  expect(m.importantContentBehindPanels, "important content behind panels").toBe(0);
}
```

The interaction regression tests ("selecting Robotics" and "zoom progressive disclosure") are updated: the "before" state now shows 607 individuals / 0 markers rather than 0 individuals / 14 markers. The `countVisible` function already works for both cases — only the `expect(before.markers).toBe(14)` assertion needs to change to `expect(before.individuals).toBe(607)`.

---

## Data Models

### `data/layout.json` — new schema

```json
{
  "layout_version": "v1.2.0",
  "layout_algorithm": "two-level-radial-cluster",
  "domain_ring_order": ["domain:software-engineering", "domain:testing-tooling", "..."],
  "coordinates": {
    "domain:ai-ml": { "x": 2800.0, "y": 0.0, "radius": 22.5, "cluster": "domain:ai-ml", "ring": 0 },
    "node:pytorch":  { "x": 3050.0, "y": 120.0, "radius": 10.2, "cluster": "domain:ai-ml", "ring": 1 },
    "node:numpy":    { "x": 3280.0, "y": 400.0, "radius": 9.8,  "cluster": "domain:ai-ml", "ring": 2 }
  },
  "edge_tiers": {
    "e0": "TierA",
    "e1": "TierB",
    "e200": "TierC",
    "e500": "TierD"
  },
  "overview_aggregates": []
}
```

The `coordinates` section has exactly 607 entries. The `edge_tiers` section has exactly 1116 entries. The `overview_aggregates` key is an empty array (kept for forward/backward compatibility with the API models, which default it to `[]`).

### `GraphResponse` (backend model)

```python
class GraphResponse(BaseModel):
    version: str
    layout_version: str | None = None
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    overview_aggregates: list[OverviewAggregate] = Field(default_factory=list)
    edge_tiers: dict[str, str] = Field(default_factory=dict)  # NEW
```

### `GraphNode` (backend model, extended)

The `ring` field is added to `GraphNode` to carry ring assignment to the frontend:
```python
class GraphNode(BaseModel):
    ...
    ring: int = 0   # 0=domain anchor, 1/2/3=member ring  — NEW
```

`GraphService._to_graph_node()` reads `coord.get("ring", 0)`.

### `GraphNode` (TypeScript interface)

```typescript
export interface GraphNode {
  ...
  ring?: number;   // 0=domain anchor, 1/2/3 = member ring. Absent on pre-migration payloads.
}
```

### `GraphResponse` (TypeScript interface)

```typescript
export interface GraphResponse {
  ...
  edge_tiers?: Record<string, string>;  // absent on pre-migration payloads
}
```

### Graphology node attributes (new additions via `buildGraph.ts`)

| Attribute | Type | Description |
|-----------|------|-------------|
| `ring` | `number` | 0–3, copied from `n.ring` |
| All existing attributes | unchanged | label, x, y, size, color, nodeType, etc. |

### Graphology edge attributes (new addition)

| Attribute | Type | Description |
|-----------|------|-------------|
| `tier` | `string` | "TierA" | "TierB" | "TierC" | "TierD" |
| `curvature` | `number` | 0.12–0.30, set based on tier and parallel-edge index |
| All existing attributes | unchanged | relationshipType, size, color |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Layout coordinate completeness

*For any* valid `graph.json` dataset, calling `generate(dataset)` shall produce an output whose `coordinates` map contains an entry with finite (non-null, non-NaN) `x` and `y` values for every node ID present in `dataset["nodes"]`.

**Validates: Requirements 1.1, 5.3, 5.4**

---

### Property 2: Layout determinism

*For any* valid `graph.json` dataset, calling `generate(dataset)` twice in the same Python process produces bit-identical output (same JSON bytes after rounding, same `edge_tiers` dict, same `domain_ring_order`).

**Validates: Requirements 5.1, 5.2, 4.5**

---

### Property 3: Ring assignment monotonicity

*For any* top-level domain and *for any* two of its member nodes A and B, if `intra_deg(A) >= RING1_THRESH` then A is assigned to Ring1, and if `intra_deg(B) < RING2_THRESH` then B is assigned to Ring3.

**Validates: Requirements 2.3**

---

### Property 4: MacroRing anchor placement

*For any* top-level domain anchor in the output, its distance from the origin (0, 0) is within `OVERLAP_MARGIN` of `MACRO_RING_R` (i.e., the overlap pass and re-pinning together preserve the MacroRing radius constraint).

**Validates: Requirements 2.5**

---

### Property 5: Angular collision freedom per ring

*For any* ring in the output with ≥2 members, the minimum angular separation between any two adjacent members (measured in radians) multiplied by the ring radius is ≥ `(2*radius_i + 2*radius_{i+1} + GAP_PX)` — i.e., no two adjacent nodes in the same ring overlap or violate the minimum gap.

**Validates: Requirements 4.3, 4.4**

---

### Property 6: Edge tier completeness and exclusivity

*For any* edge in the canonical edge set, `edge_tiers[edge_id]` is defined and its value is exactly one of `{"TierA", "TierB", "TierC", "TierD"}`.

**Validates: Requirements 7.1, 7.2**

---

### Property 7: TierA assignment correctness

*For any* `has_subdomain` edge in the canonical set, its tier is `"TierA"`. *For any* `belongs_to_domain` edge whose target node is in Ring1, its tier is `"TierA"`.

**Validates: Requirements 7.3**

---

### Property 8: Graph data integrity under any interaction

*For any* camera ratio, selection state, or filter state applied to the frontend, `graph.size` (edge count in the Graphology graph) remains 1116 and `graph.order` (node count) remains 607.

**Validates: Requirements 7.10, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7**

---

### Property 9: Radius serialization round-trip

*For any* node in the dataset, the `radius` value written to `layout.json` under `coordinates[node_id]` equals the value computed by `node_radius(node, degree, max_tech_deg, popularity.get(node["id"]))` from `sizing.py`, to within floating-point rounding (2 decimal places).

**Validates: Requirements 12.1, 12.2**

---

### Property 10: Parallel edge curvature distinctness

*For any* two edges sharing the same source and target node pair (parallel edges in the multigraph), their `curvature` attributes are not equal.

**Validates: Requirements 6.5**

---

### Property 11: Node selection reveals all incident edges

*For any* selected node N, every canonical edge incident to N (i.e., where `source == N.id` or `target == N.id`) has `getEdgeDisplayData().hidden !== true` in the Sigma renderer.

**Validates: Requirements 9.1**

---

### Property 12: Deselection restores overview edge visibility

*For any* node selection followed by deselection, the set of visible edges after deselection equals the set of visible edges in the pre-selection OverviewState (i.e., TierA + TierB + TierC edges are visible, TierD edges are hidden, as they were before the selection).

**Validates: Requirements 9.5**

---

### Property 13: graph.json immutability

*For any* invocation of `generate_layout.py`, the content of `data/graph.json` is unchanged before and after the script runs (verified by comparing file hash or content).

**Validates: Requirements 5.6**

---

## Error Handling

### Layout generation errors

| Condition | Handling |
|-----------|----------|
| `data/graph.json` not found | `raise SystemExit("...")` (unchanged from existing `main()`) |
| Node count ≠ 607 | `sys.stderr.write(warning)`, proceed with actual counts (Requirement 5.5) |
| Edge count ≠ 1116 | `sys.stderr.write(warning)`, proceed |
| Ring radius expansion fails to converge | Cap at 3 iterations; if still > 2π, accept overlap and emit a `sys.stderr` warning with domain name and ring number. This is a data-driven condition (very dense domains) that cannot silently fail CI. |
| Subdomain parent not found | Skip subdomain sub-cluster placement; place subdomain as a regular member of the parent sector. |
| `popularity.json` absent | `load_popularity()` returns `{}` already (unchanged, graceful fallback) |

### Frontend errors

| Condition | Handling |
|-----------|----------|
| `edge_tiers` absent in payload (pre-migration layout) | Default all edge tiers to `"TierD"` — edges are still readable; no crash. The `?? "TierD"` fallback in `buildGraph.ts` handles this. |
| `ring` absent in `GraphNode` (pre-migration payload) | Default to ring 0 (domain anchor opacity) via `n.ring ?? 0`. Nodes appear at full opacity, which is conservative and never hides content. |
| `@sigma/edge-curve` missing at bundle time | Build will fail with a module-not-found error. Resolution: fall back to the custom `edgeCurveProgram.ts` implementation. This is detected at build time, not runtime. |
| `curvature` attribute missing from edge | `EdgeCurveProgram` should fall back to a default curvature of 0 (straight line) — document this behavior; ensure `buildGraph.ts` always sets the attribute. |
| Sector backplate with no Ring2 members | Fall back to `CLUSTER_R2 * 1.1` as the radius estimate. |

---

## Testing Strategy

### Unit tests (vitest)

**`semanticZoom.test.ts`** (existing): The `labelVisibleAtRatio`, `bandOf`, `selectPersistentLabels` functions are unchanged. Existing tests continue to pass.

**`buildGraph.test.ts`** (existing + extensions): Add tests verifying:
- Edges gain a `tier` attribute from `data.edge_tiers`; missing `edge_tiers` defaults to `"TierD"`.
- Nodes gain a `ring` attribute from `n.ring`; missing `ring` defaults to 0.
- Parallel edge curvature offsets are distinct.

**`cameraFit.test.ts`** (existing): Unchanged.

**`overviewLod.test.ts`** (existing): The `placeLabels` and `accountForNodes` functions remain testable. The `sectorIsAggregatedAtOverview` function becomes dead code for new layouts but is not deleted; its tests still pass.

### Property-based tests (vitest + fast-check)

The following property tests are implemented as vitest tests using `fast-check` for input generation, referencing Properties 1–13 above:

**`layoutProperties.test.ts`** (new, Python side via pytest + hypothesis):

Because `generate_layout.py` is Python, property tests live in the backend test suite:

- **Property 1** (`test_coordinate_completeness`): Use the canonical `data/graph.json`; assert all 607 node IDs appear in `output["coordinates"]` with finite x/y.
- **Property 2** (`test_layout_determinism`): Call `generate(dataset)` twice; assert `output1 == output2` (dict equality after JSON serialization).
- **Property 3** (`test_ring_assignment_monotonicity`): For each domain, assert all Ring1 nodes have `intra_deg >= RING1_THRESH` and all Ring3 nodes have `intra_deg < RING2_THRESH`.
- **Property 4** (`test_macro_ring_anchor_placement`): For each top-level domain anchor, assert `abs(hypot(x, y) - MACRO_RING_R) <= OVERLAP_MARGIN + 10` (small slack for re-pin precision).
- **Property 5** (`test_ring_angular_collision_freedom`): For each ring with ≥2 nodes, compute angles from anchor, sort, check min adjacent angular gap.
- **Property 6** (`test_edge_tier_completeness`): Assert `len(output["edge_tiers"]) == 1116` and all values in `{"TierA","TierB","TierC","TierD"}`.
- **Property 7** (`test_tier_a_correctness`): For each `has_subdomain` edge, assert `tier == "TierA"`.
- **Property 9** (`test_radius_round_trip`): Assert `output["coordinates"][nid]["radius"] == round(node_radius(node, degree, max_deg, pop), 2)` for all nodes.
- **Property 13** (`test_graph_json_immutability`): Hash `graph.json` before and after `main()`, assert equal.

**Frontend property tests** (vitest + fast-check, `graphCanvas.properties.test.ts`):

- **Property 8** (`test_graph_data_integrity`): Build a Graphology graph from a mock `GraphResponse` with 607 nodes and 1116 edges. Simulate various selection states by calling the nodeReducer logic extracted to a pure function. Assert `graph.size` and `graph.order` are unchanged.
- **Property 10** (`test_parallel_edge_curvature`): Generate a mock GraphResponse with parallel edges; call `buildGraph()`; assert each edge in the parallel set has a distinct `curvature` attribute.
- **Property 11** (`test_selection_reveals_incident_edges`): For any selected node in the mock graph, assert that the edgeReducer returns `hidden: false` for all incident edges.
- **Property 12** (`test_deselection_restores_overview_edges`): Assert that after setting `activeId = null`, the edgeReducer output for TierD edges is `hidden: true` and for TierA edges is `hidden: false`.

### Integration tests (Playwright / e2e)

**`overview-visual-proof.spec.ts`** (updated): See Component 4-G above. The core metric assertions change to expect 607 individual nodes / 0 markers / edges between 100–170 / ≤50 circle intersections on desktop.

**`stackview-regression.spec.ts`** (existing): No changes needed. The Stack View projection logic in `GraphCanvas.tsx` is unaffected by the LOD removal.

**`xray.spec.ts`** (existing): No changes needed.

**`smoke.spec.ts`** (existing): Passes when the app loads and renders the graph. No changes needed.

### Build and CI checks

- `pytest` + `ruff` (backend): The new Python layout algorithm is covered by the property tests above. `ruff` is a linter; the new code must follow existing style (no new ignores needed).
- `tsc --noEmit` (frontend): TypeScript compilation must pass with the new `edge_tiers`, `ring` fields added to types.
- `eslint` (frontend): No new violations expected.
- `vitest --run` (frontend unit): All existing tests pass; new property tests added.
- `playwright test -c playwright.overview.config.ts` (e2e): Updated harness passes with new assertions.
- Bundle integrity: `VITE_TEST_HOOKS` is still tree-shaken in production. The `@sigma/edge-curve` import must not add the `__ta_sigma` symbol. Verify via the existing bundle-integrity check in Requirement 14.8.

### Key risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `@sigma/edge-curve` not on npm or bundle > 15 KB | Low–Medium | Implement fallback `edgeCurveProgram.ts` as described; decision made at implementation time by checking `npm info @sigma/edge-curve` |
| All 607 nodes visible → unacceptable visual crowding | Medium | Ring radii (R1/R2/R3) and opacity hierarchy are tunable constants; the ≤50 circle intersection threshold in the visual-proof harness enforces a measurable upper bound. Scale factors per domain size further reduce crowding in small domains. |
| Ring radius expansion loop diverging | Low | Cap at 3 expansion iterations with a `stderr` warning as documented above. In practice the graph density does not approach the theoretical worst case. |
| CI runtime regression | Low | The new algorithm is O(N log N) geometry; no Barnes-Hut quadtree simulation. Expected runtime ≈ 0.5–1.5s vs. the existing ~4–6s, well within the 8s budget. |
| Pre-migration layout.json backward compatibility | Low | The `edge_tiers` and `ring` fields both default gracefully. Old layouts produce a fully-functional but un-tiered, un-ring-opacity frontend. |
