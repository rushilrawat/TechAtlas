#!/usr/bin/env python3
"""Discovery orchestrator (offline / build-time).

fetch (Wikidata [+ optional registries]) -> dedup against the graph -> enrich with
verifiable facts -> write data/discovery/candidates.json for HUMAN review.

NEVER writes data/seed/*. The staging file is a generated artifact (gitignored).

Usage (run as a module from the scripts/ dir so package imports resolve):
  python -m discover.discover                 # Wikidata, all mapped classes
  python -m discover.discover --limit 50      # cap per class
  python -m discover.discover --class Q9143   # one Wikidata class QID
  python -m discover.discover --registries    # also run the optional pass
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .dedup import GraphIndex, dedup
from .enrich import enrich
from .sources import wikidata

ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = ROOT / "data" / "discovery"
OUT = OUT_DIR / "candidates.json"


def _default_client():
    import httpx

    return httpx.Client(follow_redirects=True)


def run(
    *,
    client,
    classes: list[str] | None,
    limit_per_class: int,
    use_registries: bool,
) -> dict:
    sources_used: list[str] = ["wikidata"]
    raw = wikidata.fetch(
        client=client, classes=classes, limit_per_class=limit_per_class
    )

    if use_registries:
        try:
            from .sources import registries

            raw.extend(registries.fetch(client=client))
            sources_used.append("registries")
        except Exception:  # noqa: BLE001 — optional pass must never abort discovery
            pass

    index = GraphIndex.from_dataset()
    result = dedup(raw, index)
    proposals = enrich(result.kept)

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": sources_used,
        "summary": {
            "discovered": len(raw),
            "dropped": len(result.dropped),
            "staged": len(proposals),
        },
        "candidates": [
            {
                "status": p.status,
                "node": p.node,
                "edges": p.edges,
                "review": p.review,
                "provenance": p.provenance,
            }
            for p in proposals
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Discover candidate technologies (offline).")
    ap.add_argument("--limit", type=int, default=200, help="max candidates per class")
    ap.add_argument("--class", dest="classes", action="append",
                    help="Wikidata class QID (repeatable); default = all mapped classes")
    ap.add_argument("--registries", action="store_true",
                    help="also run the optional popular-but-missing registry pass")
    args = ap.parse_args()

    client = _default_client()
    try:
        payload = run(
            client=client,
            classes=args.classes,
            limit_per_class=args.limit,
            use_registries=args.registries,
        )
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    s = payload["summary"]
    print(
        f"[discover] {s['discovered']} discovered, {s['dropped']} deduped out, "
        f"{s['staged']} staged -> {OUT.relative_to(ROOT)}"
    )
    print("  Every staged candidate is NEEDS_REVIEW: set primary_domain + edges, then promote.")


if __name__ == "__main__":
    main()
