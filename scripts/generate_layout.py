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
    nodes = dataset["nodes"]
    edges = dataset["edges"]
    ids = [n["id"] for n in nodes]
    node_by_id = {n["id"]: n for n in nodes}

    radius = radii_for_dataset(nodes, edges, load_popularity(POPULARITY))

    # Task 3: connectivity-ordered domain ring.
    domains = [n["id"] for n in nodes if n["node_type"] == "domain"]
    ordered = _order_domains(domains, node_by_id, edges)
    n_domains = max(len(ordered), 1)
    radius_ring = WIDTH * 0.32
    anchor: dict[str, tuple[float, float]] = {}
    for i, d in enumerate(ordered):
        angle = 2 * math.pi * i / n_domains
        anchor[d] = (radius_ring * math.cos(angle), radius_ring * math.sin(angle))

    # Task 6: cross-version pinning — reuse previous coordinates for unchanged nodes,
    # but ONLY when the previous layout is for a different dataset version (a genuine
    # incremental update). When versions match (or no previous file), recompute from
    # the deterministic seed so a fresh run is fully reproducible and CI-stable.
    prev_version, prev_coords = _load_previous()
    reuse_prev = prev_version is not None and prev_version != dataset["version"]

    pos: dict[str, list[float]] = {}
    pinned: set[str] = set()
    for nid in ids:
        prev = prev_coords.get(nid)
        if reuse_prev and prev and "x" in prev and "y" in prev:
            pos[nid] = [float(prev["x"]), float(prev["y"])]
            pinned.add(nid)
        else:
            comm = _domain_of(node_by_id[nid])
            ax, ay = anchor.get(comm, (0.0, 0.0))
            r = WIDTH * 0.10 * _seeded_unit(nid + ":r")
            theta = 2 * math.pi * _seeded_unit(nid + ":t")
            pos[nid] = [ax + r * math.cos(theta), ay + r * math.sin(theta)]

    # Dirty set: nodes that are allowed to move freely during an incremental update —
    # the new/unpinned nodes plus their K-hop neighbors. Everything else (pinned and
    # far from any change) is held firmly at its previous position so unrelated parts
    # of the map stay put (Task 6).
    anchor_target = {nid: (pos[nid][0], pos[nid][1]) for nid in pinned}
    dirty: set[str] = set(ids) - pinned
    if reuse_prev:
        neighbors_of: dict[str, set[str]] = {nid: set() for nid in ids}
        for e in edges:
            if e["source"] in neighbors_of and e["target"] in neighbors_of:
                neighbors_of[e["source"]].add(e["target"])
                neighbors_of[e["target"]].add(e["source"])
        frontier = set(dirty)
        for _hop in range(2):  # K = 2 hops
            nxt: set[str] = set()
            for nid in frontier:
                nxt |= neighbors_of.get(nid, set())
            dirty |= nxt
            frontier = nxt

    # If every node was pinned (dataset unchanged), we still run a light relaxation
    # so edits to sizes/edges settle, but movement will be tiny and convergence fast.
    adjacency: list[tuple[str, str, float]] = []
    for e in edges:
        if e["source"] in pos and e["target"] in pos:
            mult = REL_ATTRACTION.get(e["relationship_type"], DEFAULT_ATTRACTION)
            weight = e.get("weight")
            if isinstance(weight, (int, float)):
                mult *= 0.5 + float(weight)  # schema weight nudges attraction
            adjacency.append((e["source"], e["target"], mult))

    k = math.sqrt(AREA / max(len(ids), 1))
    k2 = k * k
    temp = WIDTH * 0.1

    for _ in range(ITERATIONS):
        # build quadtree over current positions (Task 5)
        xs = [p[0] for p in pos.values()]
        ys = [p[1] for p in pos.values()]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        size = max(max_x - min_x, max_y - min_y, 1.0) * 1.05
        tree = _QuadNode(min_x - 1, min_y - 1, size)
        for nid in ids:
            tree.insert(pos[nid][0], pos[nid][1])

        disp: dict[str, list[float]] = {}
        for nid in ids:
            fx, fy = _bh_force(tree, pos[nid][0], pos[nid][1], k2, BARNES_HUT_THETA)
            disp[nid] = [fx, fy]

        # attractive forces along edges, scaled by relationship (Task 4)
        for s, t, mult in adjacency:
            dx = pos[s][0] - pos[t][0]
            dy = pos[s][1] - pos[t][1]
            dist = math.hypot(dx, dy) or 0.01
            force = ((dist * dist) / k) * mult
            ux, uy = dx / dist, dy / dist
            disp[s][0] -= ux * force
            disp[s][1] -= uy * force
            disp[t][0] += ux * force
            disp[t][1] += uy * force

        # apply with temperature cap; tether domain anchors to their ring position
        max_move = 0.0
        for nid in ids:
            # Task 6: freeze pinned nodes that are far from any change.
            if nid in anchor_target and nid not in dirty:
                tx, ty = anchor_target[nid]
                pos[nid][0] = tx
                pos[nid][1] = ty
                continue
            dxy = disp[nid]
            d = math.hypot(*dxy) or 0.01
            step = min(d, temp)
            mx = (dxy[0] / d) * step
            my = (dxy[1] / d) * step
            pos[nid][0] += mx
            pos[nid][1] += my
            if nid in anchor:
                ax, ay = anchor[nid]
                pos[nid][0] = 0.85 * pos[nid][0] + 0.15 * ax
                pos[nid][1] = 0.85 * pos[nid][1] + 0.15 * ay
            max_move = max(max_move, math.hypot(mx, my))

        temp *= 0.98
        if max_move < CONVERGENCE_EPS:  # Task 5: early stop
            break

    # Task 2: final radius-aware overlap resolution. Frozen nodes stay put.
    frozen = {nid for nid in pinned if nid not in dirty}
    _resolve_overlaps(ids, pos, radius, anchor, frozen=frozen)

    coords = {
        nid: {
            "x": round(pos[nid][0], 2),
            "y": round(pos[nid][1], 2),
            "radius": radius[nid],
            "cluster": _domain_of(node_by_id[nid]),
        }
        for nid in ids
    }

    return {
        "layout_version": dataset["version"],
        "layout_algorithm": "deterministic-barnes-hut-fr+overlap",
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
