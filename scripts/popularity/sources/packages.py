"""Package-download fetchers (npm, PyPI, crates).

Each returns a single `downloads` MetricValue (recent monthly where available), or
None when the ecosystem isn't wired or the fetch fails. Offline-safe: errors -> None.
"""
from __future__ import annotations

import time

from .common import MetricValue

NPM_URL = "https://api.npmjs.org/downloads/point/last-month/{name}"
PYPI_URL = "https://pypistats.org/api/packages/{name}/recent"
CRATES_URL = "https://crates.io/api/v1/crates/{name}"

NPM_LICENSE = "npm registry public download stats"
PYPI_LICENSE = "pypistats public data (PyPI BigQuery)"
CRATES_LICENSE = "crates.io public stats"

_HEADERS = {"User-Agent": "TechAtlas/0.2 (popularity ingestion)"}


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _npm(name: str, client, timeout: float) -> MetricValue | None:
    try:
        resp = client.get(NPM_URL.format(name=name), headers=_HEADERS, timeout=timeout)
        if resp.status_code != 200:
            return None
        downloads = resp.json().get("downloads")
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(downloads, (int, float)):
        return None
    return MetricValue(float(downloads), "npm", _now(), NPM_LICENSE)


def _pypi(name: str, client, timeout: float) -> MetricValue | None:
    try:
        resp = client.get(PYPI_URL.format(name=name), headers=_HEADERS, timeout=timeout)
        if resp.status_code != 200:
            return None
        data = resp.json().get("data", {})
        downloads = data.get("last_month")
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(downloads, (int, float)):
        return None
    return MetricValue(float(downloads), "pypi", _now(), PYPI_LICENSE)


def _crates(name: str, client, timeout: float) -> MetricValue | None:
    # IMPORTANT: npm and PyPI return LAST-MONTH downloads. crates.io's
    # crate.downloads is ALL-TIME, which is not comparable and would massively
    # inflate crates in a shared min-max metric. Use recent_downloads (last 90 days)
    # divided by 3 to approximate a monthly figure on the same scale.
    try:
        resp = client.get(CRATES_URL.format(name=name), headers=_HEADERS, timeout=timeout)
        if resp.status_code != 200:
            return None
        crate = resp.json().get("crate", {})
        recent = crate.get("recent_downloads")
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(recent, (int, float)):
        return None  # no comparable monthly figure -> treat as missing, never all-time
    monthly = float(recent) / 3.0
    return MetricValue(monthly, "crates", _now(), CRATES_LICENSE)


_FETCHERS = {"npm": _npm, "pypi": _pypi, "crates": _crates}


def fetch(ecosystem: str, name: str, *, client, timeout: float = 5.0) -> MetricValue | None:
    """Return a `downloads` MetricValue for a package, or None when unavailable."""
    fetcher = _FETCHERS.get(ecosystem)
    if fetcher is None:
        return None  # ecosystem not yet wired (see data/popularity/SOURCES.md)
    return fetcher(name, client, timeout)
