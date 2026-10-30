#!/usr/bin/env python3
"""Promote reviewed candidates into the dataset via the EXISTING curated commit path.

Reads data/discovery/candidates.json, selects candidates a human has marked
status="APPROVED", refuses any that are still incomplete (no primary_domain or zero
edges — requirement 5.2), and hands the rest to scripts/expand/_apply.py::apply_batch,
which runs the same dedup + edge-endpoint pre-check every manual batch uses before
writing data/seed/*. Idempotent: _apply.py skips anything already present.

Usage (run as a module from the scripts/ dir):
  python -m discover.promote             # promote all APPROVED+complete
  python -m discover.promote --slug bun  # promote a single candidate
  python -m discover.promote --dry-run   # report only, write nothing
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CANDIDATES = ROOT / "data" / "discovery" / "candidates.json"
EXPAND_DIR = ROOT / "scripts" / "expand"

# Make scripts/expand/_apply.py importable (the shared curated commit path).
if str(EXPAND_DIR) not in sys.path:
    sys.path.insert(0, str(EXPAND_DIR))


def _clean_node(node: dict) -> dict:
    """Drop null optional fields so the written seed entry stays tidy."""
    return {k: v for k, v in node.items() if v is not None}


def select(candidates: list[dict], only_slug: str | None):
    """Return (ready, refused) where refused is [(slug, reason)]."""
    ready: list[dict] = []
    refused: list[tuple[str, str]] = []
    for c in candidates:
        node = c.get("node", {})
        slug = node.get("slug", "<unknown>")
        if only_slug and slug != only_slug:
            continue
        if c.get("status") != "APPROVED":
            refused.append((slug, "not APPROVED"))
            continue
        if not node.get("primary_domain"):
            refused.append((slug, "missing primary_domain"))
            continue
        if not c.get("edges"):
            refused.append((slug, "no edges supplied"))
            continue
        ready.append(c)
    return ready, refused


def main() -> None:
    ap = argparse.ArgumentParser(description="Promote approved discovery candidates.")
    ap.add_argument("--slug", help="promote only this slug")
    ap.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    args = ap.parse_args()

    if not CANDIDATES.exists():
        raise SystemExit(f"ERROR: {CANDIDATES} not found. Run discover.py first.")

    payload = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    ready, refused = select(payload.get("candidates", []), args.slug)

    for slug, reason in refused:
        print(f"  SKIP {slug}: {reason}")

    if not ready:
        print("[promote] nothing to promote (no APPROVED + complete candidates).")
        return

    nodes = [_clean_node(c["node"]) for c in ready]
    edges: list[dict] = []
    for c in ready:
        edges.extend(c["edges"])

    if args.dry_run:
        print(f"[promote] DRY RUN — would promote {len(nodes)} node(s), {len(edges)} edge(s):")
        for n in nodes:
            print(f"    + {n['id']} ({n.get('node_subtype')}) in {n['primary_domain']}")
        return

    # Defer entirely to the existing curated commit path (dedup + edge pre-check).
    from _apply import apply_batch

    apply_batch("discovery", technologies=nodes, edges=edges)
    print(
        f"[promote] promoted {len(nodes)} node(s) via scripts/expand/_apply.py. "
        "Now run build + validate + layout (e.g. `make data`)."
    )


if __name__ == "__main__":
    main()
