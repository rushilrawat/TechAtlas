#!/usr/bin/env python3
"""Scheduled, hands-off ingestion of NEW technologies — safe auto-placement only.

This is the automation behind the weekly discovery PR. It adds genuinely new
technologies with:

  - REAL identity from Wikidata (name, wikidata_id, wikipedia_title, official_url,
    node_subtype) — all source-derived, never guessed;
  - a DETERMINISTIC primary_domain from the Wikidata entity class (CLASS_TO_DOMAIN
    below), an auditable rule rather than an LLM guess;
  - exactly ONE auto-created edge: belongs_to_domain. That relationship is
    definitionally true for every node, so it needs no judgment and keeps the node
    from being an orphan.

It deliberately does NOT invent richer typed edges (implements, alternative_to,
written_in, commonly_used_with, ...). Those are editorial judgment; a curator may add
them later. Nodes are marked auto_added=true for auditability and the PR body says so.

Everything still goes through scripts/expand/_apply.py (dedup + edge endpoint
pre-check) and the normal validator, so a bad auto-add can never land.

Run as a module from scripts/:   python -m discover.auto_ingest [--limit N] [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .dedup import GraphIndex, dedup, slugify
from .sources import wikidata

ROOT = Path(__file__).resolve().parent.parent.parent
EXPAND_DIR = ROOT / "scripts" / "expand"
if str(EXPAND_DIR) not in sys.path:
    sys.path.insert(0, str(EXPAND_DIR))

# Deterministic Wikidata class (QID) -> home domain. This is an auditable editorial
# rule, not a per-node guess. A curator can always recategorize later; the point is
# that every auto-added node lands in a defensible domain and is never an orphan.
CLASS_TO_DOMAIN: dict[str, str] = {
    "Q9143": "domain:software-engineering",   # programming language (broad; SE is the safe home)
    "Q271680": "domain:backend",              # software framework
    "Q1330354": "domain:frontend",            # web framework
    "Q188860": "domain:software-engineering", # software library (broad)
    "Q176165": "domain:databases",            # database management system
    "Q55680343": "domain:testing-tooling",    # version control system
    "Q9135": "domain:systems",                # operating system
    "Q193424": "domain:gamedev",              # game engine
}


def build_candidates(*, client, classes: list[str] | None, limit_per_class: int):
    """Discover -> dedup -> auto-place. Returns (nodes, edges, report)."""
    raw = wikidata.fetch(client=client, classes=classes, limit_per_class=limit_per_class)
    index = GraphIndex.from_dataset()
    result = dedup(raw, index)

    nodes: list[dict] = []
    edges: list[dict] = []
    placed: list[str] = []
    skipped_no_domain: list[str] = []

    for c in result.kept:
        # The exact Wikidata class QID is carried on the candidate, so domain mapping
        # is unambiguous (two classes can share a subtype but map to different domains).
        qid_class = c.extra.get("wikidata_class_qid")
        subtype = c.subtype_hint
        domain = CLASS_TO_DOMAIN.get(qid_class) if qid_class else None
        if domain is None:
            skipped_no_domain.append(c.name)
            continue
        slug = slugify(c.name)
        if slug is None:
            continue

        node: dict = {
            "id": f"technology:{slug}",
            "slug": slug,
            "name": c.name,
            "node_type": "technology",
            "node_subtype": subtype,
            "primary_domain": domain,
            "short_description": (c.description or f"{c.name}.").strip()[:280],
            "auto_added": True,
        }
        if c.official_url:
            node["official_url"] = c.official_url
        if c.wikipedia_title:
            node["wikipedia_title"] = c.wikipedia_title
        if c.wikidata_id:
            node["wikidata_id"] = c.wikidata_id

        nodes.append(node)
        # The ONLY auto-created edge: belongs_to_domain (definitionally true).
        edges.append(
            {
                "source": node["id"],
                "target": domain,
                "relationship_type": "belongs_to_domain",
            }
        )
        placed.append(f"{c.name} -> {domain} ({subtype})")

    report = {
        "discovered": len(raw),
        "deduped_out": len(result.dropped),
        "placed": placed,
        "skipped_no_domain": skipped_no_domain,
    }
    return nodes, edges, report


def _default_client():
    import httpx

    return httpx.Client(follow_redirects=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Hands-off discovery auto-ingest (safe placement).")
    ap.add_argument("--limit", type=int, default=200, help="max candidates per class")
    ap.add_argument("--class", dest="classes", action="append",
                    help="Wikidata class QID (repeatable); default = all mapped classes")
    ap.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    args = ap.parse_args()

    client = _default_client()
    try:
        nodes, edges, report = build_candidates(
            client=client, classes=args.classes, limit_per_class=args.limit
        )
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    print(
        f"[auto-ingest] discovered {report['discovered']}, "
        f"deduped out {report['deduped_out']}, new placeable {len(nodes)}"
    )
    for line in report["placed"]:
        print(f"    + {line}")
    if report["skipped_no_domain"]:
        print(f"  (skipped {len(report['skipped_no_domain'])} with no deterministic domain)")

    if not nodes:
        print("[auto-ingest] nothing new to add.")
        return

    if args.dry_run:
        print(f"[auto-ingest] DRY RUN — would add {len(nodes)} node(s), {len(edges)} edge(s).")
        return

    # Same curated commit path as everything else: dedup + edge endpoint pre-check.
    from _apply import apply_batch

    apply_batch("auto-discovery", technologies=nodes, edges=edges)
    print(
        f"[auto-ingest] added {len(nodes)} node(s) via scripts/expand/_apply.py. "
        "Run build + validate + layout next."
    )


if __name__ == "__main__":
    main()
