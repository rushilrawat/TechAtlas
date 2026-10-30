#!/usr/bin/env python3
"""Phase 1D — deterministic popularity scoring.

Consumes the raw snapshot (ingest.py) and produces data/popularity.json:

  score = weighted blend of per-metric normalized values, where each metric is
          log1p-compressed then min-max normalized to 0..1 across all technologies
          that HAVE that metric.

Properties (requirement 3.2):
  - deterministic: same raw input -> identical output;
  - transparent: every metric keeps its raw value + source + retrieved_at + license
    + normalized value;
  - honest: a technology with no metrics is ABSENT from `scores` (never zero-filled).

A dated snapshot is also archived under data/popularity/history/ for future trends
(requirement 3.7).
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
POP_DIR = ROOT / "data" / "popularity"
RAW_IN = POP_DIR / "raw" / "popularity_raw.json"
SCORES_OUT = ROOT / "data" / "popularity.json"
HISTORY_DIR = POP_DIR / "history"

# Blend weights. Metrics absent for a given tech are dropped and the remaining
# weights renormalized, so a tech with only stars still gets a fair score.
WEIGHTS: dict[str, float] = {
    "github_stars": 0.4,
    "github_activity": 0.2,
    "downloads": 0.4,
}

METHODOLOGY = (
    "per-metric log1p then min-max normalize to 0..1 across technologies that have the "
    "metric; blend present metrics by WEIGHTS with renormalization; deterministic."
)


def _normalize_metric(raw_by_tech: dict[str, float]) -> dict[str, float]:
    """log1p then min-max to 0..1 across the provided techs for one metric."""
    logged = {tid: math.log1p(max(0.0, v)) for tid, v in raw_by_tech.items()}
    lo = min(logged.values())
    hi = max(logged.values())
    if hi <= lo:
        # All equal (or a single tech): give them the top of the scale deterministically.
        return {tid: 1.0 for tid in logged}
    return {tid: (val - lo) / (hi - lo) for tid, val in logged.items()}


def score(raw_snapshot: dict) -> dict:
    records: dict[str, dict] = raw_snapshot.get("records", {})

    # 1) gather raw values per metric across all techs that have it
    raw_per_metric: dict[str, dict[str, float]] = {}
    for tid, rec in records.items():
        for metric, mv in rec.get("metrics", {}).items():
            raw_per_metric.setdefault(metric, {})[tid] = float(mv["value"])

    # 2) normalize each metric independently
    norm_per_metric = {
        metric: _normalize_metric(vals) for metric, vals in raw_per_metric.items()
    }

    # 3) blend per tech over the metrics it actually has (renormalized weights)
    scores: dict[str, dict] = {}
    for tid, rec in records.items():
        present = rec.get("metrics", {})
        if not present:
            continue
        total_w = 0.0
        acc = 0.0
        metric_out: dict[str, dict] = {}
        for metric, mv in present.items():
            w = WEIGHTS.get(metric, 0.0)
            normalized = norm_per_metric.get(metric, {}).get(tid)
            if normalized is None:
                continue
            metric_out[metric] = {
                "value": mv["value"],
                "source": mv["source"],
                "retrieved_at": mv["retrieved_at"],
                "license": mv["license"],
                "normalized": round(normalized, 6),
            }
            if w > 0:
                acc += w * normalized
                total_w += w
        if not metric_out:
            continue
        blended = (acc / total_w) if total_w > 0 else 0.0
        scores[tid] = {"score": round(blended, 6), "metrics": metric_out}

    return {
        "dataset_version": raw_snapshot.get("dataset_version"),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methodology": METHODOLOGY,
        "weights": WEIGHTS,
        "scores": scores,
    }


def main() -> None:
    if not RAW_IN.exists():
        raise SystemExit(f"ERROR: {RAW_IN} not found. Run ingest.py first.")
    raw = json.loads(RAW_IN.read_text(encoding="utf-8"))
    result = score(raw)

    SCORES_OUT.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    stamp = result["generated_at"].replace(":", "").replace("-", "")
    (HISTORY_DIR / f"{stamp}.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"[score] wrote {SCORES_OUT.relative_to(ROOT)} — "
        f"{len(result['scores'])} technologies scored (version {result['dataset_version']})"
    )


if __name__ == "__main__":
    main()
