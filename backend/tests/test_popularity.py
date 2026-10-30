"""Tests for the Phase 1D popularity pipeline (scripts/popularity/*).

No live network: a fake HTTP client returns canned payloads (fixtures). Covers the
GitHub + package fetchers, deterministic scoring, normalization boundaries, weight
blending, and the honest "missing -> absent, never zero" rule.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# scripts/popularity uses `from sources import ...`, so put it on the path.
_POP = Path(__file__).resolve().parent.parent.parent / "scripts" / "popularity"
if str(_POP) not in sys.path:
    sys.path.insert(0, str(_POP))

import ingest  # noqa: E402
import score as scorer  # noqa: E402
from sources import github, packages  # noqa: E402


class FakeResp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeClient:
    """Maps URL substrings to canned (status, payload) responses."""

    def __init__(self, routes: dict[str, tuple[int, dict]]):
        self.routes = routes
        self.calls: list[str] = []

    def get(self, url: str, headers=None, timeout=None):
        self.calls.append(url)
        for frag, (status, payload) in self.routes.items():
            if frag in url:
                return FakeResp(status, payload)
        return FakeResp(404, {})


# ---- fetchers ---------------------------------------------------------------

def test_github_fetch_stars_and_activity():
    client = FakeClient(
        {
            "repos/facebook/react": (
                200,
                {"stargazers_count": 230000, "pushed_at": "2026-10-20T00:00:00Z"},
            )
        }
    )
    out = github.fetch("facebook/react", client=client)
    assert out["github_stars"].value == 230000
    assert out["github_stars"].source == "github"
    assert 0.0 <= out["github_activity"].value <= 1.0


def test_github_fetch_error_returns_empty():
    client = FakeClient({"repos/x/y": (500, {})})
    assert github.fetch("x/y", client=client) == {}


def test_package_fetch_npm_and_pypi_and_crates():
    client = FakeClient(
        {
            "last-month/react": (200, {"downloads": 25_000_000}),
            "packages/fastapi/recent": (200, {"data": {"last_month": 9_000_000}}),
            "crates/bevy": (200, {"crate": {"downloads": 3_000_000}}),
        }
    )
    assert packages.fetch("npm", "react", client=client).value == 25_000_000
    assert packages.fetch("pypi", "fastapi", client=client).value == 9_000_000
    assert packages.fetch("crates", "bevy", client=client).value == 3_000_000


def test_package_unwired_ecosystem_returns_none():
    client = FakeClient({})
    assert packages.fetch("maven", "org.example:lib", client=client) is None


def test_ingest_only_records_mapped_techs_with_metrics():
    nodes = [
        {"id": "technology:react", "node_type": "technology", "repo": "facebook/react",
         "package": {"ecosystem": "npm", "name": "react"}},
        {"id": "technology:unmapped", "node_type": "technology"},  # no mapping -> skipped
        {"id": "concept:x", "node_type": "concept"},  # not a technology -> skipped
    ]
    client = FakeClient(
        {
            "repos/facebook/react": (
                200,
                {"stargazers_count": 1000, "pushed_at": "2026-10-01T00:00:00Z"},
            ),
            "last-month/react": (200, {"downloads": 5000}),
        }
    )
    snap = ingest.collect(nodes, client=client)
    assert set(snap["records"]) == {"technology:react"}
    metrics = snap["records"]["technology:react"]["metrics"]
    assert "github_stars" in metrics and "downloads" in metrics


# ---- scoring ----------------------------------------------------------------

def _raw(records: dict) -> dict:
    return {"dataset_version": "0.2.0", "records": records}


def _mv(value: float, source="github", metric_license="x"):
    return {
        "value": value,
        "source": source,
        "retrieved_at": "2026-10-29T00:00:00Z",
        "license": metric_license,
    }


def test_score_is_deterministic():
    raw = _raw(
        {
            "technology:a": {"metrics": {"github_stars": _mv(100), "downloads": _mv(1000, "npm")}},
            "technology:b": {"metrics": {"github_stars": _mv(10), "downloads": _mv(50, "npm")}},
        }
    )
    import copy

    a = scorer.score(copy.deepcopy(raw))
    b = scorer.score(copy.deepcopy(raw))
    assert a["scores"] == b["scores"]


def test_score_normalization_and_ordering():
    raw = _raw(
        {
            "technology:big": {"metrics": {"github_stars": _mv(100000)}},
            "technology:small": {"metrics": {"github_stars": _mv(10)}},
        }
    )
    out = scorer.score(raw)["scores"]
    # most-starred normalizes to 1.0, least to 0.0 (min-max endpoints)
    assert out["technology:big"]["metrics"]["github_stars"]["normalized"] == 1.0
    assert out["technology:small"]["metrics"]["github_stars"]["normalized"] == 0.0
    assert out["technology:big"]["score"] > out["technology:small"]["score"]


def test_missing_metric_is_absent_not_zero():
    raw = _raw(
        {
            "technology:has": {"metrics": {"github_stars": _mv(100)}},
            "technology:empty": {"metrics": {}},  # no metrics
        }
    )
    out = scorer.score(raw)["scores"]
    assert "technology:has" in out
    assert "technology:empty" not in out  # absent, NOT a zero score


def test_weight_renormalization_when_only_one_metric():
    # a tech with only stars should still get a sensible score (weights renormalized)
    raw = _raw({"technology:a": {"metrics": {"github_stars": _mv(100)}}})
    out = scorer.score(raw)["scores"]
    # single tech, single metric -> normalized 1.0 -> blended 1.0
    assert out["technology:a"]["score"] == 1.0


def test_metrics_retain_full_provenance():
    raw = _raw({"technology:a": {"metrics": {"downloads": _mv(500, "npm", "npm terms")}}})
    m = scorer.score(raw)["scores"]["technology:a"]["metrics"]["downloads"]
    assert m["value"] == 500
    assert m["source"] == "npm"
    assert m["license"] == "npm terms"
    assert "normalized" in m and "retrieved_at" in m


@pytest.mark.parametrize("version", ["0.2.0", "9.9.9"])
def test_score_keyed_to_dataset_version(version):
    out = scorer.score({"dataset_version": version, "records": {}})
    assert out["dataset_version"] == version
    assert out["scores"] == {}
