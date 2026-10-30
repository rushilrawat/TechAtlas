"""GitHub popularity fetcher (stars + activity recency).

Reads the public repo endpoint and returns two MetricValues:
  - github_stars:    stargazers_count (raw)
  - github_activity: a 0..1 recency score from the repo's pushed_at timestamp
                     (pushed within ~30 days ~= 1.0, decaying over a year).

Offline-safe: any network/parse error yields ({} ) so the tech is simply "missing"
that metric. An optional GITHUB_TOKEN (build-time env) raises the rate limit.
"""
from __future__ import annotations

import os
import time

from .common import MetricValue

GITHUB_API = "https://api.github.com/repos/{repo}"
GITHUB_LICENSE = "GitHub API ToS (factual public counts)"
_ACTIVITY_HALF_LIFE_DAYS = 180.0


def _activity_score(pushed_at: str) -> float | None:
    try:
        pushed = time.mktime(time.strptime(pushed_at, "%Y-%m-%dT%H:%M:%SZ"))
    except (ValueError, TypeError):
        return None
    age_days = max(0.0, (time.time() - pushed) / 86400.0)
    # Exponential decay: 1.0 today, 0.5 at the half-life, asymptotic to 0.
    return float(0.5 ** (age_days / _ACTIVITY_HALF_LIFE_DAYS))


def fetch(repo: str, *, client, timeout: float = 5.0) -> dict[str, MetricValue]:
    """Return {metric_name: MetricValue} for a repo, or {} when unavailable."""
    token = os.environ.get("GITHUB_TOKEN")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "TechAtlas/0.2 (popularity ingestion)",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = client.get(GITHUB_API.format(repo=repo), headers=headers, timeout=timeout)
        if resp.status_code != 200:
            return {}
        data = resp.json()
    except Exception:  # noqa: BLE001 — fetchers must never raise into ingestion
        return {}

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    out: dict[str, MetricValue] = {}

    stars = data.get("stargazers_count")
    if isinstance(stars, (int, float)):
        out["github_stars"] = MetricValue(float(stars), "github", now, GITHUB_LICENSE)

    activity = _activity_score(data.get("pushed_at", ""))
    if activity is not None:
        out["github_activity"] = MetricValue(activity, "github", now, GITHUB_LICENSE)

    return out
