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
  - errors on nodes whose only edge is belongs_to_domain (they float without context)
  - errors on nodes with fewer than 2 typed relationships; warns (one summary line) below 3
  - errors when a node's primary_domain has no matching belongs_to_domain edge
  - warns when a node id's suffix differs from its slug
  - guided paths (data/seed/journeys.json): every step exists, consecutive steps share
    an edge, no step repeats, titles are unique

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
JOURNEYS = ROOT / "data" / "seed" / "journeys.json"

# Dataset milestone targets. Checked only when --require-targets is passed, so
# intermediate commits are not blocked.
#  - Phase 1B floors (>=250 technologies, >=150 concepts) are retained.
#  - The concept ceiling was 170 for Phase 1B; Phase 1E (CS-domain expansion, approved)
#    deliberately adds ~100 curated concepts (networks/theory/robotics/systems/advanced-AI),
#    so the ceiling is raised to a bounded 340 to keep guarding against runaway inflation
#    while admitting the planned expansion. Node count is still curation-gated, not a target.
#  - Phase 1F (Quantum, Blockchain & Web3, IoT domains) raises the ceiling to 380.
#  - Phase 1G (review gaps: SRE, privacy, UX, analytics, graphics, networks) raises it to 420.
#  - Phase 1H (Computer Engineering, HCI, interdisciplinary fields, ~250 concepts) raises it to 700.
#  - Phase 1I (trending topics, late 2026) raises it to 800.
MIN_TECHNOLOGIES = 250
MIN_CONCEPTS = 150
MAX_CONCEPTS = 800

# Connectivity floor (Nov 2026 review): every node needs at least two typed (non-domain)
# relationships so its detail panel never reads "Relationships (1)". Three is the target;
# nodes below it are summarised as one warning.
MIN_TYPED_RELATIONSHIPS = 2
TARGET_TYPED_RELATIONSHIPS = 3

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

    spokes = {(e.get("source"), e.get("target")) for e in edges
              if e.get("relationship_type") == "belongs_to_domain"}
    typed: dict[str, int] = defaultdict(int)
    for edge in edges:
        if edge.get("relationship_type") != "belongs_to_domain":
            typed[edge.get("source")] += 1
            typed[edge.get("target")] += 1

    for node in nodes:
        nid = node["id"]
        if node["node_type"] == "domain":
            continue  # domains anchored structurally; low-degree is fine
        if degree.get(nid, 0) == 0:
            report.warn(f"Orphan node (no edges): {nid}")
        elif typed.get(nid, 0) == 0:
            report.error(f"Node has no typed relationship (only belongs_to_domain): {nid}")
        elif typed.get(nid, 0) < MIN_TYPED_RELATIONSHIPS:
            report.error(
                f"Node has only {typed[nid]} typed relationship(s), need >= "
                f"{MIN_TYPED_RELATIONSHIPS} (its panel would read 'Relationships (1)'): {nid}"
            )
        pd = node.get("primary_domain")
        if pd and pd in by_id and (nid, pd) not in spokes:
            report.error(
                f"Node {nid} has primary_domain {pd} but no belongs_to_domain edge to it "
                "(it would be missing from the field's network and 'contains' list)"
            )
        if nid.split(":", 1)[-1] != node.get("slug"):
            report.warn(f"Node id suffix differs from its slug: {nid} vs '{node.get('slug')}'")

    thin = [n["id"] for n in nodes
            if n["node_type"] != "domain" and 0 < typed.get(n["id"], 0) < TARGET_TYPED_RELATIONSHIPS]
    if thin:
        report.warn(
            f"{len(thin)} node(s) have fewer than {TARGET_TYPED_RELATIONSHIPS} typed relationships "
            f"(target, not enforced), e.g. {', '.join(sorted(thin)[:5])}"
        )

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


def validate_journeys(dataset: dict, journeys: list[dict], report: Report) -> None:
    ids = {n["id"] for n in dataset.get("nodes", [])}
    pairs = {frozenset((e["source"], e["target"])) for e in dataset.get("edges", [])}
    titles: set[str] = set()
    for j in journeys:
        title = j.get("title", "")
        if not title:
            report.error(f"Guided path without a title: {j!r}")
        elif title in titles:
            report.error(f"Duplicate guided path title: {title}")
        titles.add(title)
        steps = [s.get("id") for s in j.get("steps", [])]
        if len(steps) < 2:
            report.error(f"Guided path '{title}' needs at least two steps")
        if len(set(steps)) != len(steps):
            report.error(f"Guided path '{title}' visits a node twice")
        for sid in steps:
            if sid not in ids:
                report.error(f"Guided path '{title}' step does not exist: {sid}")
        for a, b in zip(steps, steps[1:], strict=False):
            if a in ids and b in ids and frozenset((a, b)) not in pairs:
                report.error(f"Guided path '{title}': no edge between {a} and {b}")
        for s in j.get("steps", []):
            if not s.get("caption"):
                report.error(f"Guided path '{title}' step {s.get('id')} has no caption")
    print(f"  guided paths: {len(journeys)}")


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
    if JOURNEYS.exists():
        validate_journeys(dataset, json.loads(JOURNEYS.read_text(encoding="utf-8")), report)

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
