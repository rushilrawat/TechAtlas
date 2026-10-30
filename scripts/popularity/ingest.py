#!/usr/bin/env python3
"""Phase 1D — ingest raw popularity metrics for mapped technologies (offline).

For every technology node that carries a `repo` and/or `package` mapping, fetch the
public metrics via the per-source fetchers and write a raw, fully-attributed snapshot
to data/popularity/raw/popularity_raw.json. Scoring (score.py) is a separate,
deterministic step that consumes this snapshot.

Technologies with no mapping, or whose fetch fails, simply have no metrics recorded —
they are NOT zero-filled (requirement 3.1).

Network: a real httpx client is used by default; tests inject a fake. CI does not run
live ingestion — it tests the fetchers against fixtures and runs scoring on a fixture.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

from sources import github, packages

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET = ROOT / "data" / "graph.json"
RAW_DIR = ROOT / "data" / "popularity" / "raw"
RAW_OUT = RAW_DIR / "popularity_raw.json"


def _default_client():
    import httpx

    return httpx.Client(follow_redirects=True)


def collect(nodes: list[dict], *, client, timeout: float = 5.0) -> dict:
    """Return the raw snapshot dict for all mapped technologies."""
    records: dict[str, dict] = {}
    for n in nodes:
        if n.get("node_type") != "technology":
            continue
        repo = n.get("repo")
        package = n.get("package")
        if not repo and not package:
            continue  # unmapped -> no metrics (missing, not zero)

        metrics: dict[str, dict] = {}
        if repo:
            for name, mv in github.fetch(repo, client=client, timeout=timeout).items():
                metrics[name] = asdict(mv)
        if package:
            mv = packages.fetch(
                package["ecosystem"], package["name"], client=client, timeout=timeout
            )
            if mv is not None:
                metrics["downloads"] = asdict(mv)

        if metrics:  # only record technologies we actually got a metric for
            records[n["id"]] = {"metrics": metrics}

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "records": records,
    }


def main() -> None:
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    nodes = dataset["nodes"]
    client = _default_client()
    try:
        snapshot = collect(nodes, client=client)
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    snapshot["dataset_version"] = dataset["version"]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    RAW_OUT.write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    mapped = sum(
        1
        for n in nodes
        if n.get("node_type") == "technology" and (n.get("repo") or n.get("package"))
    )
    print(
        f"[ingest] wrote {RAW_OUT.relative_to(ROOT)} — "
        f"{len(snapshot['records'])} of {mapped} mapped technologies returned metrics"
    )


if __name__ == "__main__":
    main()
