#!/usr/bin/env python3
"""Validate the compiled TechAtlas dataset against the spec's data-quality rules.

Enforces (spec §16 and docs/relationship-taxonomy.md):
  - unique canonical node ids and (type, slug) pairs
  - id format matches node_type
  - every edge references existing nodes; no self-edges
  - no duplicate edges (symmetric types deduped by unordered pair)
  - relationship endpoint type rules (e.g. written_in -> programming_language)
  - has_subdomain only between domains
  - primary_domain references an existing domain node
  - unique normalized aliases (warn-level, since collisions can be legitimate)
  - reports inferred (is_curated=false) edges so they are never silently trusted
  - reports orphan nodes (no edges) as a warning

Exit code 0 = valid (warnings allowed), 1 = validation errors found.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "graph.json"

SYMMETRIC_TYPES = {"related_to", "integrates_with", "alternative_to", "commonly_used_with"}

# relationship_type -> (allowed source node_types, allowed target node_types)
# None means "any".
ENDPOINT_RULES: dict[str, tuple[set | None, set | None]] = {
    "belongs_to_domain": ({"technology", "concept"}, {"domain"}),
    "has_subdomain": ({"domain"}, {"domain"}),
    "implements": ({"technology"}, {"concept"}),
    "used_for": ({"technology"}, {"concept", "domain"}),
    "supports": ({"technology"}, {"concept"}),
    "enables": ({"concept", "technology"}, {"concept"}),
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _normalize(alias: str) -> str:
    # Keep '+' and '#' — they distinguish language names like C, C++, C#, F#.
    return "".join(ch for ch in alias.lower() if ch.isalnum() or ch in "+#")


def validate(dataset: dict) -> Report:
    report = Report()
    nodes = dataset.get("nodes", [])
    edges = dataset.get("edges", [])

    by_id: dict[str, dict] = {}
    type_slug_seen: set[tuple[str, str]] = set()
    alias_owner: dict[str, str] = {}

    for node in nodes:
        nid = node.get("id")
        ntype = node.get("node_type")
        slug = node.get("slug")

        if not nid:
            report.error(f"Node missing id: {node!r}")
            continue
        if nid in by_id:
            report.error(f"Duplicate node id: {nid}")
            continue
        by_id[nid] = node

        if ntype and not nid.startswith(f"{ntype}:"):
            report.error(f"Node id '{nid}' prefix does not match node_type '{ntype}'")

        key = (ntype, slug)
        if key in type_slug_seen:
            report.error(f"Duplicate (node_type, slug): {key}")
        type_slug_seen.add(key)

        # aliases: name + declared aliases must be searchable & ideally unique
        for alias in [node.get("name", ""), *node.get("aliases", [])]:
            norm = _normalize(alias)
            if not norm:
                continue
            if norm in alias_owner and alias_owner[norm] != nid:
                report.warn(
                    f"Alias collision: '{alias}' maps to both {alias_owner[norm]} and {nid}"
                )
            else:
                alias_owner.setdefault(norm, nid)

    # primary_domain references
    for node in nodes:
        pd = node.get("primary_domain")
        if pd and pd not in by_id:
            report.error(f"Node {node.get('id')} primary_domain '{pd}' does not exist")
        elif pd and by_id.get(pd, {}).get("node_type") != "domain":
            report.error(f"Node {node.get('id')} primary_domain '{pd}' is not a domain")

    # edges
    seen_edges: set = set()
    degree: dict[str, int] = defaultdict(int)
    inferred = 0

    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        rtype = edge.get("relationship_type")

        if src not in by_id:
            report.error(f"Edge source '{src}' does not exist ({src} -{rtype}-> {tgt})")
            continue
        if tgt not in by_id:
            report.error(f"Edge target '{tgt}' does not exist ({src} -{rtype}-> {tgt})")
            continue
        if src == tgt:
            report.error(f"Self-edge not allowed: {src} -{rtype}-> {tgt}")
            continue

        if rtype in SYMMETRIC_TYPES:
            dedup_key = (rtype, frozenset((src, tgt)))
        else:
            dedup_key = (rtype, src, tgt)
        if dedup_key in seen_edges:
            report.error(f"Duplicate edge: {src} -{rtype}-> {tgt}")
            continue
        seen_edges.add(dedup_key)

        rule = ENDPOINT_RULES.get(rtype)
        if rule:
            allowed_src, allowed_tgt = rule
            stype = by_id[src]["node_type"]
            ttype = by_id[tgt]["node_type"]
            if allowed_src and stype not in allowed_src:
                report.error(
                    f"{rtype}: source {src} is '{stype}', expected one of {sorted(allowed_src)}"
                )
            if allowed_tgt and ttype not in allowed_tgt:
                report.error(
                    f"{rtype}: target {tgt} is '{ttype}', expected one of {sorted(allowed_tgt)}"
                )

        if rtype == "written_in":
            if by_id[tgt].get("node_subtype") != "programming_language":
                report.error(
                    f"written_in: target {tgt} must be a programming_language, "
                    f"got subtype '{by_id[tgt].get('node_subtype')}'"
                )

        if edge.get("is_curated") is False:
            inferred += 1

        degree[src] += 1
        degree[tgt] += 1

    for node in nodes:
        nid = node["id"]
        if node["node_type"] == "domain":
            continue  # domains anchored structurally; low-degree is fine
        if degree.get(nid, 0) == 0:
            report.warn(f"Orphan node (no edges): {nid}")

    # summary line counts
    counts = defaultdict(int)
    for node in nodes:
        counts[node["node_type"]] += 1
    print("Dataset summary:")
    print(f"  version    : {dataset.get('version')}")
    print(f"  domains    : {counts['domain']}")
    print(f"  concepts   : {counts['concept']}")
    print(f"  technologies: {counts['technology']}")
    print(f"  total nodes: {len(nodes)}")
    print(f"  edges      : {len(edges)}")
    if inferred:
        print(f"  inferred edges (is_curated=false, NOT verified): {inferred}")
    print()

    return report


def main() -> None:
    if not DATASET.exists():
        print(f"ERROR: {DATASET} not found. Run scripts/build_dataset.py first.", file=sys.stderr)
        sys.exit(1)

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    report = validate(dataset)

    for w in report.warnings:
        print(f"  WARN  {w}")
    for e in report.errors:
        print(f"  ERROR {e}")

    print()
    if report.errors:
        print(f"FAILED: {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
        sys.exit(1)
    print(f"OK: dataset valid ({len(report.warnings)} warning(s))")


if __name__ == "__main__":
    main()
