"""Shared types for popularity fetchers.

A MetricValue is the raw, attributed observation for one metric of one technology.
`value` is the raw count/number; everything else is provenance recorded verbatim in
data/popularity.json so no number is ever unattributed.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricValue:
    value: float
    source: str  # e.g. "github", "npm", "pypi", "crates"
    retrieved_at: str  # ISO-8601 UTC
    license: str  # short license/terms label recorded for attribution


# A minimal structural type for an injectable HTTP client (so tests pass a fake and
# CI never hits the network). Any object with a .get(url, headers=..., timeout=...)
# returning an object exposing .status_code and .json() works.
