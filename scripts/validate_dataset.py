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

With --require-targets, ALSO enforces the Phase 1B milestone counts (>= 250
technologies and 150..170 concepts). Off by default so intermediate commits during
dataset expansion are not blocked.

Exit code 0 = valid (warnings allowed), 1 = validation errors found.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "graph.json"

# Phase 1B milestone targets (requirements.md 1.1). Checked only when
# --require-targets is passed, so intermediate commits are not blocked.
MIN_TECHNOLOGIES = 250
MIN_CONCEPTS = 150
MAX_CONCEPTS = 170

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


def check_targets(counts: dict[str, int]) -> list[str]:
    """Return milestone target violations for the 1B gate (requirements.md 1.1).

    Pure and side-effect free so it can be unit-tested at the boundaries. An empty
    list means the expanded-dataset targets are met.
    """
    errors: list[str] = []
    techs = counts.get("technology", 0)
    concepts = counts.get("concept", 0)
    if techs < MIN_TECHNOLOGIES:
        errors.append(
            f"technologies {techs} below target (require >= {MIN_TECHNOLOGIES})"
        )
    if not (MIN_CONCEPTS <= concepts <= MAX_CONCEPTS):
        errors.append(
            f"concepts {concepts} out of target range "
            f"(require {MIN_CONCEPTS}..{MAX_CONCEPTS} inclusive)"
        )
    return errors


def validate(dataset: dict) -> Report:
    report = Report()
    nodes = dataset.get("nodes", [])
    edges = dataset.get("edges", [])

    by_id: dict[str, dict] = {}
    type_slug_seen: set[tuple[str, str]] = set()
    alias_owner: dict[str, str] = {}
    slug_owner: dict[str, str] = {}

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

        # Slugs must be unique ACROSS node types too: static detail files are keyed by
        # bare slug (data/.../nodes/<slug>.json) and deep links resolve by slug, so a
        # concept and a technology sharing a slug would collide/overwrite each other.
        if slug is not None:
            if slug in slug_owner and slug_owner[slug] != nid:
                report.error(
                    f"Slug '{slug}' used by multiple node types: "
                    f"{slug_owner[slug]} and {nid}"
                )
            else:
                slug_owner.setdefault(slug, nid)

        # Untrusted/http-safety: official_url and documentation_url must be http(s).
        for url_field in ("official_url", "documentation_url"):
            val = node.get(url_field)
            if val and not (val.startswith("http://") or val.startswith("https://")):
                report.error(f"Node {nid} {url_field} is not an http(s) URL: {val!r}")

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
    parser = argparse.ArgumentParser(description="Validate the TechAtlas dataset.")
    parser.add_argument(
        "--require-targets",
        action="store_true",
        help=(
            "Also enforce the Phase 1B milestone targets: "
            f">= {MIN_TECHNOLOGIES} technologies and "
            f"{MIN_CONCEPTS}..{MAX_CONCEPTS} concepts. Off by default."
        ),
    )
    args = parser.parse_args()

    if not DATASET.exists():
        print(f"ERROR: {DATASET} not found. Run scripts/build_dataset.py first.", file=sys.stderr)
        sys.exit(1)

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    report = validate(dataset)

    if args.require_targets:
        counts: dict[str, int] = defaultdict(int)
        for node in dataset.get("nodes", []):
            counts[node.get("node_type")] += 1
        for msg in check_targets(counts):
            report.error(msg)

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
