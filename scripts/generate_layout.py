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
MACRO_RING_R = 3900.0
CLUSTER_R1 = 220.0
CLUSTER_R2 = 410.0
CLUSTER_R3 = 650.0
RING1_THRESH = 4
RING2_THRESH = 2
GAP_PX = 8.0
EP_W1, EP_W2, EP_W3, EP_W4, EP_W5 = 2.0, 1.5, 1.0, 0.8, 0.3
TIER_C_THRESHOLD = 0.6
TIER_C_CAP = 8
TIER_B_PER_DOMAIN = 2
ROOT_DOMAIN = "domain:software-engineering"
CURATED = [
    "domain:software-engineering", "domain:testing-tooling", "domain:frontend",
    "domain:mobile", "domain:gamedev", "domain:ai-ml", "domain:robotics",
    "domain:databases", "domain:backend", "domain:cloud-devops",
    "domain:networks", "domain:systems", "domain:theory", "domain:security",
]


def _place_ring(
    members: list[str], center: tuple[float, float], base_radius: float,
    sizes: dict[str, float], key: str, pos: dict[str, list[float]],
    reserved: list[tuple[float, float]] | None = None,
) -> float:
    """Place a semantic group around its anchor with radius-aware angular spacing."""
    if not members:
        return base_radius
    # Sigma places the anchor's label to its right. Leave a narrow radial corridor
    # there, while still populating more than 300 degrees around every parent.
    reserved = [*(reserved or []), (math.pi / 2, 0.4)]
    # Leave room for nested subclusters; slots are otherwise spread over the full circle.
    angles = [2 * math.pi * i / len(members) for i in range(len(members))]
    if reserved:
        allowed = [2 * math.pi * i / (len(members) * 8) for i in range(len(members) * 8)
                   if all(abs(math.atan2(math.sin(2 * math.pi * i / (len(members) * 8) - a),
                                         math.cos(2 * math.pi * i / (len(members) * 8) - a)))
                          > width
                          for a, width in reserved)]
        angles = [allowed[min(len(allowed) - 1, int((i + 0.5) * len(allowed) / len(members)))]
                    for i in range(len(members))] if allowed else angles
    min_radius = sum(sizes[n] * 2 + GAP_PX for n in members) / (2 * math.pi)
    radius = max(base_radius, min_radius * 1.1)
    start = -math.pi / 2 + _seeded_unit(key) * 0.12
    for index, (nid, angle) in enumerate(zip(members, angles, strict=False)):
        a = angle + start
        # Three shallow lanes fill the territory instead of stacking every leaf on
        # a single thin circumference. Ring identity remains 1/2/3.
        lane = (index % 3 - 1) * min(radius * 0.14, 72.0)
        local_radius = radius + lane
        pos[nid] = [center[0] + local_radius * math.cos(a),
                    center[1] + local_radius * math.sin(a)]
    return radius


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


def generate(dataset: dict) -> dict:
    """Derive a full-circle atlas and a deterministic canonical-edge backbone."""
    import sys
    nodes, edges = dataset["nodes"], dataset["edges"]
    if len(nodes) != 607 or len(edges) != 1116:
        print(f"Warning: expected 607/1116, got {len(nodes)}/{len(edges)}", file=sys.stderr)
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
    members = {d: [nid for nid in ids if nid not in domain_ids and territory_of[nid] == d]
               for d in ordered}
    radius = radii_for_dataset(nodes, edges, load_popularity(POPULARITY))
    degree = {nid: 0 for nid in ids}
    intra = {nid: 0 for nid in ids}
    for edge in edges:
        s, t = edge["source"], edge["target"]
        degree[s] += 1
        degree[t] += 1
        if domain_of[s] == domain_of[t]:
            intra[s] += 1
            intra[t] += 1
    ring = {nid: 0 if nid in domain_ids else
            (1 if intra[nid] >= RING1_THRESH else 2 if intra[nid] >= RING2_THRESH else 3)
            for nid in ids}
    weights = {d: math.sqrt(max(len(members[d]), 1)) for d in ordered}
    total = sum(weights.values())
    pos: dict[str, list[float]] = {}
    centers: dict[str, tuple[float, float]] = {}
    angle_by_domain: dict[str, float] = {}
    sweep = -math.pi / 2
    for d in ordered:
        span = 2 * math.pi * weights[d] / total
        angle = sweep + span / 2
        sweep += span
        angle_by_domain[d] = angle
        center = (MACRO_RING_R * math.cos(angle), MACRO_RING_R * math.sin(angle))
        centers[d] = center
        pos[d] = list(center)

    # Nested anchors occupy the least busy outer angular sectors. Their own children
    # have complete local rings; direct parent members reserve the same sectors.
    reservations: dict[str, list[tuple[float, float]]] = {d: [] for d in ordered}
    for sub in sorted(parent_of):
        parent = parent_of[sub]
        direct = [n for n in members[parent] if domain_of[n] == parent]
        population = len([n for n in ids if domain_of[n] == sub])
        preferred_ring = 3 if len(direct) > 42 or population > 18 else 2
        k = len(reservations[parent])
        angle = angle_by_domain[parent] + math.pi + (k - 0.5) * 1.6
        distance = (CLUSTER_R3 if preferred_ring == 3 else CLUSTER_R2) * 0.95
        center = (centers[parent][0] + distance * math.cos(angle),
                  centers[parent][1] + distance * math.sin(angle))
        centers[sub] = center
        pos[sub] = list(center)
        ring[sub] = preferred_ring
        reservations[parent].append((angle + math.pi / 2, 0.48))

    local_groups: list[list[str]] = []
    for d in ordered + sorted(parent_of):
        direct = [nid for nid in ids if nid not in domain_ids and domain_of[nid] == d]
        direct.sort(key=lambda nid: (by_id[nid].get("node_subtype") or "", -intra[nid], nid))
        counts = len(direct)
        scale = 0.68 if counts <= 15 else 1.18 if counts > 50 else 1.0
        if d in parent_of:
            scale *= max(0.7, min(0.85, math.sqrt(counts / max(len(members[parent_of[d]]), 1))))
        for band, base in ((1, CLUSTER_R1), (2, CLUSTER_R2), (3, CLUSTER_R3)):
            group = [n for n in direct if ring[n] == band]
            _place_ring(group, centers[d], base * scale, radius, f"{d}:{band}", pos,
                        reservations.get(d) if band >= 2 else None)
            local_groups.append(group)

    _shorten_local_connections(local_groups, pos, edges)

    # A small deterministic collision pass corrects pairs across neighboring rings.
    # Anchors remain fixed; re-pin afterward to guarantee the macro geometry.
    _resolve_overlaps(ids, pos, radius, {}, frozen=set(centers))
    for nid, center in centers.items():
        pos[nid] = list(center)

    max_radius = max(radius.values(), default=1)
    scored: list[tuple[float, str, str, bool]] = []
    tiers = {f"e{i}": "TierD" for i in range(len(edges))}
    for i, edge in enumerate(edges):
        s, t, rt = edge["source"], edge["target"], edge["relationship_type"]
        structural = rt == "has_subdomain" or (rt == "belongs_to_domain" and
                                                  (ring[s] == 1 or ring[t] == 1) and
                                                  (s in domain_ids or t in domain_ids))
        if structural:
            tiers[f"e{i}"] = "TierA"
            continue
        hierarchy = 0.5 if rt == "belongs_to_domain" and (ring[s] == 2 or ring[t] == 2) else 0
        strength = REL_ATTRACTION.get(rt, DEFAULT_ATTRACTION) / 2.2
        importance = (radius[s] + radius[t]) / (2 * max_radius)
        cross = territory_of[s] != territory_of[t]
        crowding = min(0.5, (degree[s] + degree[t]) * 0.05)
        score = EP_W1 * hierarchy + EP_W2 * strength + EP_W3 * importance
        score += EP_W4 * (0.3 if cross else 0) - EP_W5 * crowding
        # A long bridge across the empty center creates a false visual impression of
        # local proximity. Reserve the overview bridge tier for nearby territories.
        length = math.dist(pos[s], pos[t])
        if cross and length > MACRO_RING_R * 0.9:
            score = -1.0
        scored.append((score, f"e{i}", territory_of[s], cross))
    ranked = sorted(scored, key=lambda x: (-x[0], x[1]))
    local_counts: dict[str, int] = {}
    cross_count = 0
    for score, eid, dom, cross in ranked:
        if cross:
            if score >= TIER_C_THRESHOLD and cross_count < TIER_C_CAP:
                tiers[eid] = "TierC"
                cross_count += 1
        elif local_counts.get(dom, 0) < TIER_B_PER_DOMAIN:
            tiers[eid] = "TierB"
            local_counts[dom] = local_counts.get(dom, 0) + 1
    coords = {nid: {"x": round(pos[nid][0], 2), "y": round(pos[nid][1], 2),
                    "radius": radius[nid], "cluster": domain_of[nid], "ring": ring[nid]}
              for nid in ids}
    return {"layout_version": dataset["version"],
            "layout_algorithm": "two-level-radial-cluster",
            "domain_ring_order": ordered, "coordinates": coords,
            "edge_tiers": tiers, "overview_aggregates": []}


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
