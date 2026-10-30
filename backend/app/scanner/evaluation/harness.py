"""Offline evaluation harness for the Repo X-Ray scanner (Phase 1.5C, Req 10).

Runs the scanner against local fixtures in corpus/<name>/ (tree.json + files/ + a
human-authored ground-truth.json) via a mock GitHub client that serves ONLY the fixture —
any attempt to reach the network aborts the run. Computes per-repo and aggregate
precision/recall against the ground truth and gates on an Accuracy_Threshold.

No live network, deterministic, no fabricated accuracy: every number here is computed
from an evaluation run over the verified corpus.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from pathlib import Path

from app.graph_service import GraphService
from app.scanner.github_client import GitHubClient
from app.scanner.scan_orchestrator import run_scan
from app.scanner.technology_matcher import TechnologyMatcher

CORPUS = Path(__file__).resolve().parent / "corpus"


class _NoNetwork(RuntimeError):
    """Raised if the scanner tries to fetch anything the fixture does not provide."""


class _Resp:
    def __init__(self, status_code, json_body=None, headers=None):
        self.status_code = status_code
        self._json = json_body
        self.text = ""
        self.headers = headers or {}

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


class FixtureGitHub:
    """Serves one corpus fixture; raises _NoNetwork for anything it does not hold."""

    def __init__(self, owner, name, sha, files, *, truncated=False,
                 default_branch="main", description=None, language=None, stars=None):
        self.owner, self.name, self.sha = owner, name, sha
        self.files = files
        self.truncated = truncated
        self.default_branch = default_branch
        self.description = description
        self.language = language
        self.stars = stars

    def get(self, url, params=None, headers=None, timeout=None):
        if url.endswith(f"/repos/{self.owner}/{self.name}"):
            return _Resp(200, {"private": False, "default_branch": self.default_branch,
                               "description": self.description, "language": self.language,
                               "stargazers_count": self.stars})
        if f"/commits/{self.default_branch}" in url:
            return _Resp(200, {"sha": self.sha})
        if "/git/trees/" in url:
            tree = [{"type": "blob", "path": p, "size": len(t.encode())}
                    for p, t in self.files.items()]
            return _Resp(200, {"tree": tree, "truncated": self.truncated})
        if "/contents/" in url:
            from urllib.parse import unquote
            path = unquote(url.split("/contents/")[-1])
            if path in self.files:
                raw = self.files[path].encode()
                return _Resp(200, {"encoding": "base64", "size": len(raw),
                                   "content": base64.b64encode(raw).decode()})
            return _Resp(404, {"message": "missing"})
        raise _NoNetwork(f"fixture does not serve {url}")


@dataclass
class RepoEval:
    fixture: str
    precision: float
    recall: float
    false_positives: list[str]
    false_negatives: list[str]


@dataclass
class EvalRun:
    per_repo: list[RepoEval] = field(default_factory=list)
    aggregate_precision: float = 0.0
    aggregate_recall: float = 0.0
    passed: bool = False
    threshold: float = 0.0


def _load_fixture(d: Path):
    meta = json.loads((d / "tree.json").read_text())
    files = {}
    fdir = d / "files"
    for fp in fdir.rglob("*"):
        if fp.is_file():
            files[str(fp.relative_to(fdir))] = fp.read_text()
    gt = json.loads((d / "ground-truth.json").read_text())
    return meta, files, gt


def evaluate_fixture(d: Path) -> RepoEval:
    meta, files, gt = _load_fixture(d)
    gh_client = FixtureGitHub(
        meta["owner"], meta["name"], meta["commit_sha"], files,
        default_branch=meta.get("default_branch", "main"),
        description=meta.get("description"), language=meta.get("language"),
        stars=meta.get("stars"),
    )
    gh = GitHubClient(client=gh_client, token=None, request_budget=1000)
    matcher = TechnologyMatcher(GraphService().all_nodes())
    scan = run_scan(f"https://github.com/{meta['owner']}/{meta['name']}", gh, matcher,
                    mapping_version="0.3.0")

    reported = {d_.node_id for d_ in scan.detections}
    expected = {e["node_id"] for e in gt.get("expected_detections", [])}
    tp = reported & expected
    fp = sorted(reported - expected)
    fn = sorted(expected - reported)
    precision = len(tp) / len(reported) if reported else (1.0 if not expected else 0.0)
    recall = len(tp) / len(expected) if expected else 1.0
    return RepoEval(d.name, precision, recall, fp, fn)


def run_evaluation(accuracy_threshold: float, corpus: Path = CORPUS) -> EvalRun:
    fixtures = sorted(p for p in corpus.iterdir()
                      if p.is_dir() and (p / "ground-truth.json").exists())
    per = [evaluate_fixture(d) for d in fixtures]
    run = EvalRun(per_repo=per, threshold=accuracy_threshold)
    if per:
        run.aggregate_precision = sum(r.precision for r in per) / len(per)
        run.aggregate_recall = sum(r.recall for r in per) / len(per)
    run.passed = (run.aggregate_precision >= accuracy_threshold
                  and run.aggregate_recall >= accuracy_threshold)
    return run
