#!/usr/bin/env python3
"""Generate a deterministic, community-aware layout snapshot for the graph.

Spec §5.2: compute layout offline, store stable coordinates, keep it deterministic
for a given graph version. The frontend loads these coordinates instead of running a
full physics simulation on every page load.

Pipeline (all deterministic — seeded only by node id):
  1. Compute a render radius per node (scripts/sizing.py) and emit it, so the
     overlap pass relaxes against true bubble sizes (Task 1).
  2. Order domain anchors around the ring by inter-domain connectivity so strongly
     linked domains sit adjacent and cross-domain edges stay short (Task 3).
  3. Seed node positions near their domain anchor via a deterministic hash, or from
     the previous layout.json when the node is unchanged (cross-version pinning, Task 6).
  4. Run force iterations with Barnes-Hut (quadtree) repulsion and an early-stop
     convergence cutoff (Task 5). Edge attraction is scaled by relationship type and
     the schema `weight` (Task 4).
  5. Resolve remaining overlaps with a radius-aware relaxation pass (Task 2).
  6. Write data/layout.json keyed by the dataset version.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from sizing import load_popularity, radii_for_dataset

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "graph.json"
OUTPUT = ROOT / "data" / "layout.json"
POPULARITY = ROOT / "data" / "popularity.json"

ITERATIONS = 400
WIDTH = 2000.0
AREA = WIDTH * WIDTH
CONVERGENCE_EPS = 0.05  # stop when the largest node movement falls below this
BARNES_HUT_THETA = 0.9  # quadtree approximation threshold (larger = faster/looser)
OVERLAP_MARGIN = 4.0  # extra px gap enforced between bubble edges
OVERLAP_ITERATIONS = 60

# Attraction multipliers by relationship type (Task 4). Larger = pulled closer.
# alternative_to is weak: alternatives shouldn't stack on top of each other.
REL_ATTRACTION: dict[str, float] = {
    "commonly_used_with": 2.2,
    "built_on": 1.8,
    "depends_on": 1.8,
    "implements": 1.4,
    "belongs_to_domain": 1.3,
    "has_subdomain": 1.1,
    "written_in": 1.3,
    "used_for": 1.0,
    "supports": 1.0,
    "integrates_with": 1.1,
    "part_of_ecosystem": 1.0,
    "enables": 0.8,
    "related_to": 0.7,
    "alternative_to": 0.25,
}
DEFAULT_ATTRACTION = 1.0


def _seeded_unit(key: str) -> float:
    """Deterministic float in [0, 1) from a string key."""
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(0x1000000000000)


# --------------------------------------------------------------------------- #
# Task 3: order domain anchors by inter-domain connectivity.
# --------------------------------------------------------------------------- #
def _domain_of(node: dict) -> str:
    return node["id"] if node["node_type"] == "domain" else node.get("primary_domain", node["id"])


def _order_domains(
    domains: list[str], nodes_by_id: dict[str, dict], edges: list[dict]
) -> list[str]:
    """Arrange domains on the ring so heavily-connected pairs are adjacent.

    Deterministic greedy insertion: start from the alphabetically-first domain, then
    repeatedly append the unplaced domain most connected to the current endpoint.
    """
    if len(domains) <= 2:
        return sorted(domains)

    pair_weight: dict[tuple[str, str], int] = {}
    for e in edges:
        s = nodes_by_id.get(e["source"])
        t = nodes_by_id.get(e["target"])
        if not s or not t:
            continue
        ds, dt = _domain_of(s), _domain_of(t)
        if ds == dt:
            continue
        key = tuple(sorted((ds, dt)))
        pair_weight[key] = pair_weight.get(key, 0) + 1

    def w(a: str, b: str) -> int:
        return pair_weight.get(tuple(sorted((a, b))), 0)

    remaining = sorted(domains)
    order = [remaining.pop(0)]
    while remaining:
        endpoint = order[-1]
        # pick most-connected to the current endpoint; tie-break alphabetically
        remaining.sort(key=lambda d: (-w(endpoint, d), d))
        order.append(remaining.pop(0))
    return order


# --------------------------------------------------------------------------- #
# Task 5: Barnes-Hut quadtree for approximate repulsion.
# --------------------------------------------------------------------------- #
class _QuadNode:
    __slots__ = ("x0", "y0", "size", "cx", "cy", "mass", "point", "children")

    def __init__(self, x0: float, y0: float, size: float) -> None:
        self.x0 = x0
        self.y0 = y0
        self.size = size
        self.cx = 0.0
        self.cy = 0.0
        self.mass = 0
        self.point: tuple[float, float] | None = None
        self.children: list[_QuadNode | None] | None = None

    def _quadrant(self, x: float, y: float) -> int:
        half = self.size / 2
        right = x >= self.x0 + half
        bottom = y >= self.y0 + half
        return (1 if right else 0) + (2 if bottom else 0)

    def insert(self, x: float, y: float) -> None:
        # update center of mass incrementally
        total = self.mass + 1
        self.cx = (self.cx * self.mass + x) / total
        self.cy = (self.cy * self.mass + y) / total
        self.mass = total

        if self.children is None and self.point is None:
            self.point = (x, y)
            return

        if self.children is None:
            # subdivide and push the existing point down
            self.children = [None, None, None, None]
            px, py = self.point  # type: ignore[misc]
            self.point = None
            self._insert_into_child(px, py)

        self._insert_into_child(x, y)

    def _insert_into_child(self, x: float, y: float) -> None:
        assert self.children is not None
        q = self._quadrant(x, y)
        half = self.size / 2
        if self.children[q] is None:
            cx0 = self.x0 + (half if (q & 1) else 0)
            cy0 = self.y0 + (half if (q & 2) else 0)
            self.children[q] = _QuadNode(cx0, cy0, half)
        self.children[q].insert(x, y)  # type: ignore[union-attr]


def _bh_force(tree: _QuadNode, x: float, y: float, k2: float, theta: float) -> tuple[float, float]:
    """Repulsive displacement on point (x, y) from the quadtree."""
    dx = x - tree.cx
    dy = y - tree.cy
    dist = math.hypot(dx, dy) or 0.01

    is_leaf = tree.children is None
    if is_leaf or (tree.size / dist) < theta:
        if tree.point is not None and abs(dx) < 1e-9 and abs(dy) < 1e-9:
            return 0.0, 0.0
        force = (k2 / dist) * tree.mass
        return (dx / dist) * force, (dy / dist) * force

    fx = fy = 0.0
    for child in tree.children:  # type: ignore[union-attr]
        if child is not None and child.mass > 0:
            cfx, cfy = _bh_force(child, x, y, k2, theta)
            fx += cfx
            fy += cfy
    return fx, fy


# --------------------------------------------------------------------------- #
# Task 2: radius-aware overlap resolution.
# --------------------------------------------------------------------------- #
def _resolve_overlaps(
    ids: list[str],
    pos: dict[str, list[float]],
    radius: dict[str, float],
    anchors: dict[str, tuple[float, float]],
    frozen: set[str] | None = None,
) -> None:
    """Push overlapping bubbles apart until edge-to-edge gap >= OVERLAP_MARGIN.

    Uses a grid to only compare nearby nodes (deterministic iteration order). Frozen
    nodes (pinned + far from any change) do not move; their overlap is pushed entirely
    onto the mobile node so the established map stays put (Task 6).
    """
    frozen = frozen or set()
    max_r = max(radius.values(), default=10.0)
    cell = (max_r * 2 + OVERLAP_MARGIN) or 1.0

    for _ in range(OVERLAP_ITERATIONS):
        grid: dict[tuple[int, int], list[str]] = {}
        for nid in ids:
            gx = int(pos[nid][0] // cell)
            gy = int(pos[nid][1] // cell)
            grid.setdefault((gx, gy), []).append(nid)

        moved = 0.0
        for nid in ids:
            gx = int(pos[nid][0] // cell)
            gy = int(pos[nid][1] // cell)
            for dxc in (-1, 0, 1):
                for dyc in (-1, 0, 1):
                    for other in grid.get((gx + dxc, gy + dyc), ()):
                        if other <= nid:
                            continue
                        ax, ay = pos[nid]
                        bx, by = pos[other]
                        dx = ax - bx
                        dy = ay - by
                        dist = math.hypot(dx, dy) or 0.01
                        min_dist = radius[nid] + radius[other] + OVERLAP_MARGIN
                        if dist < min_dist:
                            overlap = min_dist - dist
                            ux, uy = dx / dist, dy / dist
                            a_frozen = nid in frozen
                            b_frozen = other in frozen
                            if a_frozen and b_frozen:
                                continue  # neither can move; leave it
                            if a_frozen:
                                pos[other][0] -= ux * overlap
                                pos[other][1] -= uy * overlap
                            elif b_frozen:
                                pos[nid][0] += ux * overlap
                                pos[nid][1] += uy * overlap
                            else:
                                half = overlap / 2
                                pos[nid][0] += ux * half
                                pos[nid][1] += uy * half
                                pos[other][0] -= ux * half
                                pos[other][1] -= uy * half
                            moved = max(moved, overlap)
            # keep domain anchors gently tethered so they don't drift during packing
            if nid in anchors and nid not in frozen:
                tx, ty = anchors[nid]
                pos[nid][0] = 0.95 * pos[nid][0] + 0.05 * tx
                pos[nid][1] = 0.95 * pos[nid][1] + 0.05 * ty
        if moved < 0.5:
            break


# --------------------------------------------------------------------------- #
# Main layout.
# --------------------------------------------------------------------------- #
def _load_previous() -> tuple[str | None, dict[str, dict]]:
    if not OUTPUT.exists():
        return None, {}
    try:
        prev = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None, {}
    return prev.get("layout_version"), prev.get("coordinates", {})


def generate(dataset: dict) -> dict:
    """Structured-hybrid "atlas" layout (Explore-view redesign).

    The opening Universe view must read as a *map of computing domains*, not a central
    force-directed blob. So the layout is deliberately structured in three levels:

      Level 1 - Domain ring: every top-level domain sits on one large, equidistant circle
                with an intentional, stable ordering (related domains adjacent). The centre
                is left as open negative space - no pile of nodes or colliding labels.
      Level 2 - Domain sector: each domain owns an angular WEDGE sized by a dampened member
                count. Its concepts/technologies fan OUTWARD from the ring into the wedge in
                concentric shells - higher-connectivity "hub" nodes nearest the anchor,
                leaf technologies farther out - so each domain reads as its own neighbourhood.
      Level 3 - Collision polish: a bounded, radius-aware relaxation removes residual overlap
                WITHOUT a global force pass (which is what collapsed the old layout inward).

    Deterministic (seeded only by node id + fixed geometry) and idempotent: regenerating
    with the committed layout present reproduces it exactly, and an incremental dataset
    expansion preserves every previously-placed coordinate (cross-version pinning).
    """
    nodes = dataset["nodes"]
    edges = dataset["edges"]
    ids = [n["id"] for n in nodes]
    node_by_id = {n["id"]: n for n in nodes}

    radius = radii_for_dataset(nodes, edges, load_popularity(POPULARITY))

    # ---- intra-domain connectivity: hubs (high degree within their domain) sit inner ----
    domain_of = {nid: _domain_of(node_by_id[nid]) for nid in ids}
    intra_deg: dict[str, int] = {nid: 0 for nid in ids}
    for e in edges:
        s, t = e.get("source"), e.get("target")
        if s in domain_of and t in domain_of and domain_of[s] == domain_of[t]:
            intra_deg[s] += 1
            intra_deg[t] += 1

    # ---- Level 1: TOP-LEVEL domain ring (design §13 + subdomain correction §5) ----
    # The dataset has 17 domain nodes but 3 are SUBDOMAINS (attached to a parent via a
    # `domain -has_subdomain-> domain` edge). Only genuine top-level domains occupy the main
    # equidistant ring; each subdomain nests inside its parent's sector so the hierarchy is
    # honoured rather than presenting it as an unrelated top-level discipline.
    all_domains = [n["id"] for n in nodes if n["node_type"] == "domain"]
    # `domain:software-engineering` is the taxonomic ROOT: it `has_subdomain` -> the ten
    # original top-level domains, which are still peer sectors on the ring (the root is a
    # conceptual parent, not a spatial container). A domain only NESTS off the ring when its
    # has_subdomain parent is some OTHER domain (the genuine subdomains added in Phase 1E:
    # computer-architecture + embedded under systems, computer-graphics under gamedev).
    ROOT_DOMAIN = "domain:software-engineering"
    parent_of: dict[str, str] = {}
    for e in edges:
        if e.get("relationship_type") == "has_subdomain":
            s_, t_ = e.get("source"), e.get("target")
            if s_ in all_domains and t_ in all_domains and s_ != ROOT_DOMAIN:
                parent_of[t_] = s_            # t_ is a true (nested) subdomain of s_
    subdomains = set(parent_of)
    top_domains = [d for d in all_domains if d not in subdomains]
    present = set(top_domains)
    # Curated walk around the circle so neighbouring top-level sectors are conceptually
    # adjacent; any top-level domain not listed is appended by the connectivity heuristic.
    CURATED = [
        "domain:software-engineering", "domain:testing-tooling",
        "domain:frontend", "domain:mobile", "domain:gamedev",
        "domain:ai-ml", "domain:robotics",
        "domain:databases", "domain:backend", "domain:cloud-devops",
        "domain:networks", "domain:systems",
        "domain:theory", "domain:security",
    ]
    ordered = [d for d in CURATED if d in present]
    for d in _order_domains(top_domains, node_by_id, edges):
        if d not in ordered:
            ordered.append(d)

    # Effective sector for every non-domain node: a subdomain's members are hosted in the
    # subdomain's PARENT sector (so the parent territory contains the whole hierarchy).
    def sector_of(nid: str) -> str:
        d = domain_of.get(nid, nid)
        # walk up subdomain -> parent until a top-level domain
        seen = 0
        while d in parent_of and seen < 5:
            d = parent_of[d]
            seen += 1
        return d

    # Members per TOP-LEVEL sector (includes the subdomain anchor nodes + their members).
    members: dict[str, list[str]] = {d: [] for d in ordered}
    for nid in ids:
        if nid in top_domains:
            continue  # top-level domain anchors are placed on the ring, not as members
        sec = sector_of(nid)
        if sec in members:
            members[sec].append(nid)

    # Angular wedge per domain, proportional to sqrt(member count) so big domains get more
    # arc without starving small ones. Each domain's anchor sits at its wedge centre on a
    # large ring; the open centre inside the ring is intentional negative space.
    weights = {d: math.sqrt(max(len(members[d]), 1)) for d in ordered}
    wtotal = sum(weights.values()) or 1.0
    RING = WIDTH * 0.62          # radius of the DOMAIN ANCHOR ring (its label/marker)
    GAP = 0.14                   # fraction of each wedge kept as an inter-sector gutter
    pos: dict[str, list[float]] = {}
    wedge_center: dict[str, float] = {}
    wedge_half: dict[str, float] = {}

    acc = 0.0
    # Start at -90deg (top) and go clockwise for a stable, familiar orientation.
    base = -math.pi / 2
    for d in ordered:
        frac = weights[d] / wtotal
        span = 2 * math.pi * frac
        center = base + acc + span / 2
        acc += span
        wedge_center[d] = center
        wedge_half[d] = span * (1 - GAP) / 2
        pos[d] = [RING * math.cos(center), RING * math.sin(center)]

    # ---- Level 2: fan each domain's members OUTWARD into its wedge, in shells ----
    # Shell radius grows from just inside the ring to well beyond it, so a sector reads as
    # a fan radiating away from the open centre. Hubs (high intra-degree) take inner shells.
    SHELL0 = RING + 150.0        # first member shell sits just OUTSIDE the anchor ring
    SHELL_STEP = 150.0           # radial spacing between shells (graph units), growing out
    PER_SHELL_BASE = 6           # nodes in the first shell; shells widen outward
    for d in ordered:
        ms = members[d]
        if not ms:
            continue
        # order: hubs first (inner), then by size, then id -> deterministic & meaningful
        ms.sort(key=lambda nid: (-intra_deg[nid], -radius.get(nid, 0.0), nid))
        center = wedge_center[d]
        half = wedge_half[d]
        placed = 0
        shell = 0
        i = 0
        n = len(ms)
        while i < n:
            cap = PER_SHELL_BASE + shell * 3           # outer shells hold more nodes
            shell_r = SHELL0 + shell * SHELL_STEP
            row = ms[i:i + cap]
            k = len(row)
            # spread this shell's nodes evenly across the (gapped) wedge arc
            for j, nid in enumerate(row):
                if k == 1:
                    a = center
                else:
                    a = center - half + (2 * half) * (j / (k - 1))
                # tiny deterministic jitter so shells don't look mechanically gridded
                jit = (_seeded_unit(nid + ":j") - 0.5) * SHELL_STEP * 0.3
                r = shell_r + jit
                pos[nid] = [r * math.cos(a), r * math.sin(a)]
            i += cap
            shell += 1
            placed += k

    # ---- cross-version pinning: preserve previously-placed coordinates, idempotent ----
    prev_version, prev_coords = _load_previous()
    reuse_prev = bool(prev_coords) and any(n in prev_coords for n in ids)
    if reuse_prev:
        for nid in ids:
            prev = prev_coords.get(nid)
            if prev and "x" in prev and "y" in prev:
                pos[nid] = [float(prev["x"]), float(prev["y"])]

    # anchor map for the overlap resolver (domains are gently tethered to their ring slot).
    anchor = {d: (pos[d][0], pos[d][1]) for d in ordered}

    # ---- Level 3: bounded, radius-aware overlap resolution (no global force collapse) ----
    # On an incremental expansion, freeze everything that was pinned so the existing map is
    # untouched and only genuinely new nodes settle. On a fresh build nothing is pinned.
    if reuse_prev:
        pinned = {nid for nid in ids if prev_coords.get(nid)}
        frozen = set(pinned)
    else:
        frozen = set()
    _resolve_overlaps(ids, pos, radius, anchor, frozen=frozen)

    coords = {
        nid: {
            "x": round(pos[nid][0], 2),
            "y": round(pos[nid][1], 2),
            "radius": radius[nid],
            "cluster": domain_of.get(nid, nid),
        }
        for nid in ids
    }

    return {
        "layout_version": dataset["version"],
        "layout_algorithm": "structured-atlas-ring+radial-fan",
        "domain_ring_order": ordered,
        "coordinates": coords,
    }



def main() -> None:
    if not DATASET.exists():
        raise SystemExit("data/graph.json not found. Run scripts/build_dataset.py first.")
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    layout = generate(dataset)
    OUTPUT.write_text(json.dumps(layout, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)} — {len(layout['coordinates'])} positions "
        f"for layout_version {layout['layout_version']}"
    )


if __name__ == "__main__":
    main()
