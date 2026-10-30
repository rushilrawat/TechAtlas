"""Phase 1.5C evaluation-harness tests (design Properties 20, 21; Req 10.1-10.8).

Runs the offline harness over the verified corpus and asserts metric correctness, the
threshold gate, no-live-network, and that the negative fixture produces no false positives.
"""
from __future__ import annotations

import pytest

from app.scanner.evaluation.harness import (
    FixtureGitHub,
    _NoNetwork,
    run_evaluation,
)
from app.scanner.github_client import GitHubClient


def test_corpus_spans_all_ecosystems_plus_monorepo():
    run = run_evaluation(0.0)
    names = {r.fixture for r in run.per_repo}
    # One fixture per ecosystem + a monorepo + a negative case.
    for expected in ["js-express-api", "py-flask-service", "rust-bevy-game",
                     "java-spring-gradle", "go-gin-api", "monorepo-web-and-api",
                     "neg-false-positive-guard"]:
        assert expected in names


def test_aggregate_meets_threshold():
    run = run_evaluation(0.90)
    assert run.passed, (
        f"precision={run.aggregate_precision:.3f} recall={run.aggregate_recall:.3f}; "
        f"failures: " + "; ".join(
            f"{r.fixture} FN={r.false_negatives} FP={r.false_positives}"
            for r in run.per_repo if r.false_negatives or r.false_positives)
    )
    assert run.aggregate_precision >= 0.90 and run.aggregate_recall >= 0.90


def test_metrics_in_unit_range():
    run = run_evaluation(0.0)
    for r in run.per_repo:
        assert 0.0 <= r.precision <= 1.0
        assert 0.0 <= r.recall <= 1.0


def test_threshold_gate_fails_above_achievable():
    # A threshold above 1.0 can never pass -> gate reports not passed.
    run = run_evaluation(1.01)
    assert run.passed is False


def test_negative_fixture_has_no_false_positives():
    run = run_evaluation(0.0)
    neg = next(r for r in run.per_repo if r.fixture == "neg-false-positive-guard")
    assert neg.false_positives == []


def test_fixture_github_raises_on_unknown_url_no_live_network():
    gh_client = FixtureGitHub("o", "n", "a" * 40, {"package.json": "{}"})
    gh = GitHubClient(client=gh_client, token=None, request_budget=10)
    # A URL shape the fixture does not recognize must raise _NoNetwork (never reach the
    # real network). A known-shape-but-missing file returns 404; an unknown endpoint
    # (e.g. the search API) is refused outright.
    with pytest.raises(_NoNetwork):
        gh.get("/search/code", params={"q": "anything"})
