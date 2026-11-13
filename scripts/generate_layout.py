#!/usr/bin/env python3
"""Generate the deterministic two-level radial atlas and edge backbone.

All geometry is derived offline from the canonical graph; no browser physics or
previous-layout pinning affects the result.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from sizing import SIZE_CONCEPT, SIZE_TECH, load_popularity, radii_for_dataset

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "graph.json"
OUTPUT = ROOT / "data" / "layout.json"
POPULARITY = ROOT / "data" / "popularity.json"

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


def _connectivity_rings(members: list[str], intra: dict[str, int],
                        degree: dict[str, int], radius: dict[str, float]) -> dict[str, int]:
    """Keep the most connected and visually prominent members nearest their parent."""
    ranked = sorted(members, key=lambda nid: (-intra[nid], -degree[nid], -radius[nid], nid))
    inner = max(1, math.ceil(len(ranked) * 0.18))
    middle = max(inner, math.ceil(len(ranked) * 0.50))
    return {nid: 1 if i < inner else 2 if i < middle else 3
            for i, nid in enumerate(ranked)}


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
def _shorten_local_connections(
    groups: list[list[str]], pos: dict[str, list[float]], edges: list[dict],
) -> None:
    """Assign nodes to existing radial slots to shorten canonical connections.

    Swaps stay inside one parent's ring, so the full-circle distribution, local
    radius, and fixed parent/domain centers are preserved. Only real edges enter
    the objective; root-to-domain spokes are excluded because their macro length
    is fixed by the atlas and would overwhelm useful local relationships.
    """
    usable = [(e["source"], e["target"],
               REL_ATTRACTION.get(e["relationship_type"], DEFAULT_ATTRACTION))
              for e in edges if e["source"] in pos and e["target"] in pos
              and not (e["source"] == ROOT_DOMAIN and e["relationship_type"] == "has_subdomain")]
    incident: dict[str, set[int]] = {nid: set() for nid in pos}
    for index, (source, target, _) in enumerate(usable):
        incident[source].add(index)
        incident[target].add(index)

    def cost(indices: set[int]) -> float:
        return sum(weight * math.dist(pos[source], pos[target])
                   for index in indices for source, target, weight in [usable[index]])

    for group in groups:
        if len(group) < 2:
            continue
        # Deterministic coordinate descent. Four sweeps are enough for the small
        # local rings; a swap is retained only if it improves weighted edge length.
        for _ in range(4):
            changed = False
            for i, a in enumerate(group):
                for b in group[i + 1:]:
                    affected = incident[a] | incident[b]
                    before = cost(affected)
                    pos[a], pos[b] = pos[b], pos[a]
                    if cost(affected) < before - 1e-6:
                        changed = True
                    else:
                        pos[a], pos[b] = pos[b], pos[a]
            if not changed:
                break


# --------------------------------------------------------------------------- #
# Main layout. Units are nominal screen pixels at the 1440x900 default fit, so the
# spacing guaranteed here is the spacing the renderer actually draws (`r` is the
# drawn overview radius; `radius` stays the API sizing hint).
# --------------------------------------------------------------------------- #
LAYOUT_ALGORITHM = "parent-centered-radial-atlas-v2"
DOMAIN_R = 11.0                 # top-level anchor
SUBDOMAIN_R = 8.0               # nested subdomain anchor
RING_BASE_R = {1: 4.4, 2: 3.5, 3: 2.9}  # member radius by ring (technology)
CONCEPT_BONUS = 0.4             # concepts read slightly larger than leaf tools
GAP_PX = OVERLAP_MARGIN         # min edge-to-edge gap along a ring
RADIAL_GAP_PX = 5.0             # min gap between consecutive ring bands
ANCHOR_GAP_PX = 9.0             # clearance around a parent anchor
MACRO_GAP_PX = 16.0             # clearance between neighboring cluster territories
LANE_MIN_COUNT = 14             # rings this populated zigzag across two lanes
SUBRING_TOLERANCE = 1.08        # ring 2 wins unless it grows the cluster > 8 % more
# Edge priority S(e) = W1*H + W2*W + W3*C + W4*B - W5*K, every feature in [0, 1].
#   H canonical hierarchy, W relationship strength, C endpoint centrality,
#   B cross-domain bridge, K visual cost (curve length relative to its territory).
EP_W1, EP_W2, EP_W3, EP_W4, EP_W5 = 2.0, 1.5, 1.0, 0.8, 1.2
BACKBONE_FRACTION = 0.5         # Tier B budget per territory, share of its members
TIER_C_CAP = 36
TIER_C_PER_PAIR = 3
ROOT_DOMAIN = "domain:software-engineering"
CURATED = [
    "domain:software-engineering", "domain:testing-tooling", "domain:frontend",
    "domain:mobile", "domain:gamedev", "domain:ai-ml", "domain:robotics",
    "domain:databases", "domain:backend", "domain:cloud-devops",
    "domain:networks", "domain:systems", "domain:theory", "domain:security",
    "domain:quantum", "domain:blockchain", "domain:iot",
]


def _display_radius(node: dict, ring: int, api_radius: float) -> float:
    """Drawn overview radius: a bounded hierarchy, lightly varied by importance."""
    if node["node_type"] == "domain":
        return DOMAIN_R if ring == 0 else SUBDOMAIN_R
    concept = node["node_type"] == "concept"
    lo, hi = SIZE_CONCEPT if concept else SIZE_TECH
    t = max(0.0, min(1.0, (api_radius - lo) / (hi - lo)))
    base = RING_BASE_R[ring] + (CONCEPT_BONUS if concept else 0.0)
    return round(base * (0.85 + 0.3 * t), 2)


def _place_ring(
    items: list[str], r: dict[str, float], inner: float, key: str,
    pos: dict[str, list[float]] | None = None, sats: dict[str, float] | None = None,
    blocked: list[tuple[float | None, float]] | None = None,
) -> tuple[float, list[tuple[str, float]]]:
    """Place one ring band around the origin over the full circle.

    Angular shares come from the chord bound dtheta >= 2*asin((r_i + r_j + g) / 2R)
    (wraparound included); the band grows until its members fit. Dense bands zigzag
    across two lanes, which halves the circumference they need. `sats` are nested
    subclusters (id -> extent) whose inner edge sits on the band's inner edge;
    `blocked` are (angle, half-width) sectors an inner band's subcluster already fills.
    Returns (outer radius of the ordinary members, [(subcluster, outer radius)]).
    `pos=None` is a dry run.
    """
    sats = sats or {}
    blocked = blocked or []
    free = 2 * math.pi - sum(2 * half for _, half in blocked)
    ordinary = [n for n in items if n not in sats]
    maxr = max((r[n] for n in ordinary), default=0.0)
    lanes = len(ordinary) >= LANE_MIN_COUNT
    lane = 0.45 * (2 * maxr + GAP_PX) if lanes else 0.0
    base = inner
    while True:
        ring_r = base + lane + maxr
        shares = []
        for n in items:
            if n in sats:
                shares.append(2 * math.asin(min(1.0, (sats[n] + GAP_PX / 2) / (base + sats[n]))))
            else:
                half = math.asin(min(1.0, (2 * r[n] + GAP_PX) / (2 * ring_r)))
                shares.append(half if lanes else 2 * half)
        if sum(shares) <= free or base > inner * 50:
            break
        base *= 1.03
    outer = ring_r + lane if ordinary else inner - RADIAL_GAP_PX
    sat_outer = [(s, base + 2 * e) for s, e in sats.items()]
    if pos is None or not items:
        return outer, sat_outer
    slack = (free - sum(shares)) / len(items)
    # Walk the free arc only: positions are laid out in "free" angle u, then mapped past
    # each blocked sector so no member lands inside an inner subcluster's territory.
    if blocked:
        spans = sorted((a - h, 2 * h) for a, h in blocked)
        start = spans[0][0] + spans[0][1]
        gaps, used = [], 0.0
        for a0, width in spans[1:]:
            gaps.append(((a0 - start) % (2 * math.pi) - used, width))
            used += width
    else:
        start = -math.pi / 2 + _seeded_unit(key) * 2 * math.pi / len(items)
        gaps = []

    def real(u: float) -> float:
        return start + u + sum(width for at, width in gaps if at <= u)

    u, k = 0.0, 0
    for n, share in zip(items, shares, strict=True):
        step = share + slack
        # Bounded organic rhythm: a little angular and radial play, never a collision.
        mid = real(u + step / 2 + (_seeded_unit(f"{key}:{n}:a") - 0.5) * 0.35 * slack)
        if n in sats:
            rad = base + sats[n]
        else:
            rad = ring_r + ((lane if k % 2 else -lane) if lanes else 0.0)
            rad += (_seeded_unit(f"{key}:{n}:r") - 0.5) * 2.4
            k += 1
        pos[n] = [rad * math.cos(mid), rad * math.sin(mid)]
        u += step
    return outer, sat_outer


def _bands(direct: dict[int, list[str]], subs: dict[str, float], band_of: dict[str, int],
           ) -> list[tuple[list[str], dict[str, float]]]:
    """Ring items per band with subclusters interleaved evenly among the members."""
    out = []
    for band in (1, 2, 3):
        items = list(direct[band])
        inline = sorted(s for s in subs if band_of[s] == band)
        for k, sub in enumerate(inline):
            items.insert(int((k + 0.5) * len(items) / len(inline)) + k, sub)
        out.append((items, {s: subs[s] for s in inline}))
    return out


def _lay_bands(anchor: str, direct: dict[int, list[str]], subs: dict[str, float],
               band_of: dict[str, int], r: dict[str, float],
               pos: dict[str, list[float]] | None) -> float:
    """Place (or dry-run) every band; return the cluster's outer radius.

    A subcluster seated in ring 2 does not push the whole of ring 3 outward: ring 3
    flows around it, leaving the subcluster's own sector free.
    """
    outer = r[anchor] + ANCHOR_GAP_PX - RADIAL_GAP_PX
    extent = outer
    seated: list[tuple[str, float]] = []  # (subcluster, outer radius) from inner bands
    for band, (items, sats) in enumerate(_bands(direct, subs, band_of), start=1):
        if not items:
            continue
        inner = outer + RADIAL_GAP_PX
        blocked = [(math.atan2(pos[s][1], pos[s][0]) if pos is not None else None,
                    math.asin(min(1.0, (subs[s] + GAP_PX) / math.hypot(*pos[s])))
                    if pos is not None else
                    math.asin(min(1.0, (subs[s] + GAP_PX) / max(so - subs[s], subs[s] + GAP_PX))))
                   for s, so in seated if so > inner]
        outer, sat_outer = _place_ring(items, r, inner, f"{anchor}:{band}", pos, sats, blocked)
        seated += sat_outer
        extent = max([extent, outer] + [so for _, so in sat_outer])
    return extent


def _build_cluster(
    anchor: str, direct: dict[int, list[str]], subs: dict[str, tuple[dict, float]],
    band_of: dict[str, int], r: dict[str, float], edges: list[dict],
) -> tuple[dict[str, list[float]], float]:
    """Lay one ecosystem out around its anchor at the origin; return (pos, extent)."""
    pos: dict[str, list[float]] = {anchor: [0.0, 0.0]}
    _lay_bands(anchor, direct, {s: e for s, (_, e) in subs.items()}, band_of, r, pos)
    groups = [[n for n in direct[b] if n not in subs] for b in (1, 2, 3)]
    _shorten_local_connections(groups, pos, edges)
    for sub, (local, _) in subs.items():
        cx, cy = pos[sub]
        for nid, (x, y) in local.items():
            pos[nid] = [cx + x, cy + y]
    _resolve_overlaps(list(pos), pos, r, {}, frozen={anchor, *subs})
    extent = max(math.hypot(*pos[n]) + r[n] for n in pos)
    return pos, extent


def _solve_macro_radius(order: list[str], ext: dict[str, float]) -> float:
    """Smallest ring radius whose adjacent cluster territories all clear each other."""
    if len(order) < 2:
        return 0.0
    pairs = [(ext[a] + ext[b] + MACRO_GAP_PX) for a, b in zip(order, order[1:] + order[:1],
                                                                strict=True)]

    def total(radius: float) -> float:
        return sum(2 * math.asin(min(1.0, p / (2 * radius))) for p in pairs)

    lo, hi = max(pairs) / 2, max(pairs) * len(order)
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if total(mid) <= 2 * math.pi else (mid, hi)
    return hi


def _segments_cross(a: tuple, b: tuple, c: tuple, d: tuple) -> bool:
    if len({a, b, c, d}) < 4:
        return False  # edges meeting at a shared node do not cross

    def side(p: tuple, q: tuple, s: tuple) -> float:
        return (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0])
    return (side(a, b, c) * side(a, b, d) < 0) and (side(c, d, a) * side(c, d, b) < 0)


LOCAL_CURVATURE, CROSS_CURVATURE = 0.22, 0.18  # mirrored by frontend buildGraph.ts


def _curve(a: tuple, b: tuple, ref: tuple, magnitude: float, steps: int = 12) -> list[tuple]:
    """The quadratic curve the renderer draws, bowing away from `ref` (see buildGraph.ts)."""
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    k = magnitude if (-(b[1] - a[1]) * (mx - ref[0]) + (b[0] - a[0]) * (my - ref[1])) >= 0 \
        else -magnitude
    c = (mx - (b[1] - a[1]) * k, my + (b[0] - a[0]) * k)
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
             (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])
            for t in (i / steps for i in range(steps + 1))]


def _curves_cross(p: tuple, q: tuple) -> bool:
    """Whether two drawn curves (endpoints + polyline) cross away from a shared node."""
    (pa, pb, pts), (qa, qb, qts) = p, q
    if {pa, pb} & {qa, qb}:
        return False
    return any(_segments_cross(pts[i], pts[i + 1], qts[j], qts[j + 1])
               for i in range(len(pts) - 1) for j in range(len(qts) - 1))


MACRO_COMPOSITION = "continents"
EXPECTED_NODES, EXPECTED_EDGES = 717, 1543  # canonical dataset size (sanity warning only)
NEIGHBOR_GAP_PX = 3 * MACRO_GAP_PX  # territories this close may show an overview bridge
# Editorial strata for the "strata" composition: foundations, platforms, applications.
STRATA = [
    ["domain:theory", "domain:quantum", "domain:systems", "domain:networks", "domain:security"],
    ["domain:testing-tooling", "domain:backend", "domain:cloud-devops",
     "domain:databases", "domain:software-engineering", "domain:blockchain"],
    ["domain:ai-ml", "domain:frontend", "domain:robotics", "domain:mobile", "domain:gamedev",
     "domain:iot"],
]
LANDSCAPE = 1.6  # target width:height of the packed composition (desktop canvas)


def _ring_centers(order: list[str], ext: dict[str, float], _aff: dict) -> dict:
    """Ecosystems spaced around a ring solved from their measured extents."""
    radius = _solve_macro_radius(order, ext)
    if len(order) < 2:
        return {d: (0.0, 0.0) for d in order}
    nxt = order[1:] + order[:1]
    steps = [2 * math.asin(min(1.0, (ext[a] + ext[b] + MACRO_GAP_PX) / (2 * radius)))
             for a, b in zip(order, nxt, strict=True)]
    slack = (2 * math.pi - sum(steps)) / len(order)
    out, theta = {}, -math.pi / 2
    for d, step in zip(order, steps, strict=True):
        out[d] = (radius * math.cos(theta), radius * math.sin(theta))
        theta += step + slack
    return out


HEADING_CLEARANCE_PX = 26  # room for a two-line domain heading between packed ecosystems


def _continent_centers(order: list[str], ext: dict[str, float], aff: dict) -> dict:
    """Pack whole ecosystems like continents: each lands touching the map, beside the
    ecosystems it shares the most canonical relationships with, in a landscape outline.
    Deterministic greedy packing (largest first); no hollow center."""
    ext = {d: e + HEADING_CLEARANCE_PX / 2 for d, e in ext.items()}
    weight = {d: sum(v for k, v in aff.items() if d in k) for d in order}
    todo = sorted(order, key=lambda d: (-weight[d] - ext[d] / 10, d))
    placed: dict[str, tuple[float, float]] = {todo[0]: (0.0, 0.0)}
    for d in todo[1:]:
        best = None
        for other, (ox, oy) in placed.items():
            for k in range(72):
                a = 2 * math.pi * k / 72
                dist = ext[other] + ext[d] + MACRO_GAP_PX
                p = (ox + dist * math.cos(a), oy + dist * math.sin(a))
                if any(math.dist(p, q) < ext[d] + ext[e] + MACRO_GAP_PX - 1e-6
                       for e, q in placed.items()):
                    continue
                pull = sum(aff.get((min(d, e), max(d, e)), 0) * math.dist(p, q)
                           for e, q in placed.items())
                spread = math.hypot(p[0] / LANDSCAPE, p[1])
                cost = pull / (1 + weight[d]) + 2.2 * spread
                if best is None or cost < best[0] - 1e-9:
                    best = (cost, p)
        placed[d] = best[1]
    cx = sum(x for x, _ in placed.values()) / len(placed)
    cy = sum(y for _, y in placed.values()) / len(placed)
    return {d: (x - cx, y - cy) for d, (x, y) in placed.items()}


def _strata_centers(order: list[str], ext: dict[str, float], _aff: dict) -> dict:
    """Three editorial bands (foundations, platforms, applications), read top to bottom."""
    rows = [[d for d in row if d in ext] for row in STRATA]
    rows.append([d for d in order if not any(d in row for row in rows)])
    out, y = {}, 0.0
    for row in [r for r in rows if r]:
        height = max(ext[d] for d in row)
        width = sum(2 * ext[d] for d in row) + MACRO_GAP_PX * 2.4 * (len(row) - 1)
        x = -width / 2
        for d in row:
            out[d] = (x + ext[d], y - height)
            x += 2 * ext[d] + MACRO_GAP_PX * 2.4
        y -= 2 * height + MACRO_GAP_PX * 2 + 2 * HEADING_CLEARANCE_PX
    cy = sum(v for _, v in out.values()) / len(out)
    return {d: (x, v - cy) for d, (x, v) in out.items()}


COMPOSITIONS = {"ring": _ring_centers, "continents": _continent_centers,
                "strata": _strata_centers}


def generate(dataset: dict, composition: str | None = None) -> dict:
    """Derive the parent-centered radial atlas and its canonical-edge backbone."""
    import sys
    nodes, edges = dataset["nodes"], dataset["edges"]
    if len(nodes) != EXPECTED_NODES or len(edges) != EXPECTED_EDGES:
        print(f"Warning: expected {EXPECTED_NODES}/{EXPECTED_EDGES}, "
              f"got {len(nodes)}/{len(edges)}", file=sys.stderr)
    ids = [n["id"] for n in nodes]
    by_id = {n["id"]: n for n in nodes}
    domain_of = {nid: _domain_of(n) for nid, n in by_id.items()}
    domain_ids = {nid for nid, n in by_id.items() if n["node_type"] == "domain"}
    parent_of = {e["target"]: e["source"] for e in edges
                 if e["relationship_type"] == "has_subdomain"
                 and e["source"] in domain_ids and e["target"] in domain_ids
                 and e["source"] != ROOT_DOMAIN}
    top = domain_ids - parent_of.keys()
    ordered = [d for d in CURATED if d in top] + sorted(top - set(CURATED))

    def territory(nid: str) -> str:
        d = domain_of[nid]
        while d in parent_of:
            d = parent_of[d]
        return d
    territory_of = {nid: territory(nid) for nid in ids}
    api_radius = radii_for_dataset(nodes, edges, load_popularity(POPULARITY))
    degree = {nid: 0 for nid in ids}
    intra = {nid: 0 for nid in ids}
    for edge in edges:
        s, t = edge["source"], edge["target"]
        degree[s] += 1
        degree[t] += 1
        if domain_of[s] == domain_of[t]:
            intra[s] += 1
            intra[t] += 1

    # Rings: 0 anchor; 1 foundational hubs; 2 intermediate; 3 specialized leaves.
    ring = {nid: 0 for nid in domain_ids}
    direct_of: dict[str, list[str]] = {}
    for d in sorted(domain_ids):
        direct = [nid for nid in ids if nid not in domain_ids and domain_of[nid] == d]
        direct.sort(key=lambda nid: (by_id[nid].get("node_subtype") or "", -intra[nid], nid))
        direct_of[d] = direct
        ring.update(_connectivity_rings(direct, intra, degree, api_radius))
    r = {nid: _display_radius(by_id[nid], ring[nid], api_radius[nid]) for nid in ids}
    for sub in parent_of:
        r[sub] = SUBDOMAIN_R

    def bands(d: str) -> dict[int, list[str]]:
        return {b: [n for n in direct_of[d] if ring[n] == b] for b in (1, 2, 3)}

    # Nested subdomains are complete small constellations first; each is then seated in
    # its parent's ring 2 or 3, whichever keeps the parent ecosystem more compact.
    built: dict[str, tuple[dict, float]] = {}
    for sub in sorted(parent_of):
        built[sub] = _build_cluster(sub, bands(sub), {}, {}, r, edges)
    clusters: dict[str, tuple[dict, float]] = {}
    for d in ordered:
        subs = {s: built[s] for s in sorted(parent_of) if parent_of[s] == d}
        band_of: dict[str, int] = {}
        for sub in sorted(subs, key=lambda s: (-subs[s][1], s)):
            ext = {s: subs[s][1] for s in [*band_of, sub]}
            in2 = _lay_bands(d, bands(d), ext, {**band_of, sub: 2}, r, None)
            in3 = _lay_bands(d, bands(d), ext, {**band_of, sub: 3}, r, None)
            band_of[sub] = 2 if in2 <= in3 * SUBRING_TOLERANCE else 3
            ring[sub] = band_of[sub]
        clusters[d] = _build_cluster(d, bands(d), subs, band_of, r, edges)

    # Macro composition: whole ecosystems (not anchors) are placed as units.
    extent = {d: clusters[d][1] for d in ordered}
    affinity: dict[tuple[str, str], int] = {}
    for edge in edges:
        a, b = territory_of[edge["source"]], territory_of[edge["target"]]
        if a != b and ROOT_DOMAIN not in (edge["source"], edge["target"]):
            key = (min(a, b), max(a, b))
            affinity[key] = affinity.get(key, 0) + 1
    centers = COMPOSITIONS[composition or MACRO_COMPOSITION](ordered, extent, affinity)
    pos: dict[str, list[float]] = {}
    for d in ordered:
        cx, cy = centers[d]
        for nid, (x, y) in clusters[d][0].items():
            pos[nid] = [cx + x, cy + y]
    for nid in ids:  # isolated ids without a territory never occur, but never drop one
        pos.setdefault(nid, [0.0, 0.0])

    tiers = _edge_tiers(edges, pos, ring, territory_of, domain_of, degree, extent, ordered,
                        parent_of)
    coords = {nid: {"x": round(pos[nid][0], 2), "y": round(pos[nid][1], 2),
                    "radius": api_radius[nid], "r": r[nid],
                    "cluster": domain_of[nid], "ring": ring[nid]}
              for nid in ids}
    return {"layout_version": dataset["version"], "layout_algorithm": LAYOUT_ALGORITHM,
            "macro_composition": composition or MACRO_COMPOSITION,
            "domain_extents": {d: round(extent[d], 2) for d in ordered},
            "domain_ring_order": ordered, "coordinates": coords,
            "edge_tiers": tiers, "overview_aggregates": []}


def _edge_tiers(edges: list[dict], pos: dict, ring: dict, territory_of: dict,
                cluster_of: dict, degree: dict, extent: dict, ordered: list[str],
                parent_of: dict) -> dict[str, str]:
    """Tier A hierarchy, Tier B per-territory spanning forest, Tier C bridges, D rest.

    Only canonical edges are ever tiered. Canonical weights may be null; the
    relationship type then supplies the documented default strength (W).
    """
    tiers = {f"e{i}": "TierD" for i in range(len(edges))}
    max_deg = max((v for k, v in degree.items() if ring.get(k) != 0), default=1) or 1
    point = {nid: (p[0], p[1]) for nid, p in pos.items()}

    def drawn(s: str, t: str) -> tuple:
        # Mirrors buildGraph.ts: a curve within one ecosystem bows away from the nearest
        # shared anchor (its own cluster's, else the territory's); a bridge bows away
        # from the atlas center.
        local = territory_of[s] == territory_of[t]
        anchor = cluster_of[s] if cluster_of[s] == cluster_of[t] else territory_of[s]
        ref = point[anchor] if local else (0.0, 0.0)
        return (s, t, _curve(point[s], point[t], ref,
                             LOCAL_CURVATURE if local else CROSS_CURVATURE))
    scored = []
    for i, edge in enumerate(edges):
        s, t, rt = edge["source"], edge["target"], edge["relationship_type"]
        if rt == "has_subdomain" and s == ROOT_DOMAIN:
            continue  # taxonomic root spokes would cut through the whole atlas
        if rt == "has_subdomain" and parent_of.get(t) == s:
            tiers[f"e{i}"] = "TierA"
            continue
        ts, tt = territory_of[s], territory_of[t]
        member = t if ring.get(s) == 0 else s
        h = ({1: 0.3, 2: 0.15}.get(ring[member], 0.1) if rt == "belongs_to_domain" else 0.0)
        w = edge.get("weight")
        w = min(1.0, float(w)) if isinstance(w, (int, float)) else \
            REL_ATTRACTION.get(rt, DEFAULT_ATTRACTION) / 2.2
        # Centrality of the members involved: an anchor's degree is just its member count
        # and would make every membership spoke look important.
        ends = [degree[x] for x in (s, t) if ring.get(x) != 0] or [0]
        c = sum(ends) / (len(ends) * max_deg)
        cross = ts != tt
        k = min(1.0, math.dist(point[s], point[t]) / (extent[ts] + extent[tt]))
        if rt == "belongs_to_domain":
            k = min(1.0, k + 0.5)  # membership is already drawn by radial position
        score = EP_W1 * h + EP_W2 * w + EP_W3 * c + EP_W4 * (1.0 if cross else 0.0) - EP_W5 * k
        scored.append((-score, f"e{i}", s, t, ts, tt))
    scored.sort()

    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    members = {d: sum(1 for n, td in territory_of.items() if td == d and ring[n] != 0)
               for d in ordered}
    budget = {d: max(2, round(BACKBONE_FRACTION * members[d])) for d in ordered}
    accepted: dict[str, list[tuple]] = {d: [] for d in ordered}
    for _, eid, s, t, ts, tt in scored:
        if ts != tt or len(accepted[ts]) >= budget[ts] or find(s) == find(t):
            continue
        path = drawn(s, t)
        if any(_curves_cross(path, other) for other in accepted[ts]):
            continue
        parent[find(s)] = find(t)
        accepted[ts].append(path)
        tiers[eid] = "TierB"

    bridges: list[tuple] = []
    per_pair: dict[tuple, int] = {}
    local = [path for paths in accepted.values() for path in paths]
    # Two passes: bridges that cross nothing first; then, if the budget is not yet met,
    # bridges that pass over local curves. A bridge never crosses another bridge.
    for strict in (True, False):
        for _, eid, s, t, ts, tt in scored:
            if ts == tt or len(bridges) >= TIER_C_CAP or tiers[eid] == "TierC":
                continue
            if math.dist(point[ts], point[tt]) - extent[ts] - extent[tt] > NEIGHBOR_GAP_PX:
                continue  # only neighboring ecosystems; long bridges would cross the atlas
            pair = tuple(sorted((ts, tt)))
            if per_pair.get(pair, 0) >= TIER_C_PER_PAIR:
                continue
            path = drawn(s, t)
            if any(_curves_cross(path, other) for other in bridges + (local if strict else [])):
                continue
            per_pair[pair] = per_pair.get(pair, 0) + 1
            bridges.append(path)
            tiers[eid] = "TierC"
    return tiers


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
