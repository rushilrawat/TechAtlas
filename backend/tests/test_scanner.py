"""Phase 1.5A scanner tests — deterministic, no live network.

A FakeGitHub serves canned repo metadata / tree / file contents. Covers the required
fixtures (React/TS, Python/FastAPI, PyTorch, Docker, GitHub Actions, monorepo) and the
required negatives (false positives, unknown deps, malformed URLs, truncated trees, API
failures), plus URL validation, matching, evidence, coverage, and caching.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.graph_service import GraphService  # noqa: E402
from app.scanner.github_client import GitHubClient, GitHubError  # noqa: E402
from app.scanner.repository_resolver import (  # noqa: E402
    InvalidRepositoryURL,
    RepositoryNotFound,
    normalize_url,
)
from app.scanner.scan_orchestrator import run_scan  # noqa: E402
from app.scanner.technology_matcher import TechnologyMatcher  # noqa: E402


@pytest.fixture(scope="module")
def matcher():
    return TechnologyMatcher(GraphService().all_nodes())


# ---------------------------------------------------------------- Fake GitHub

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


class FakeGitHub:
    """Serves a repo defined by (meta, default_branch_sha, tree, files)."""

    def __init__(self, *, owner="acme", name="app", sha="a" * 40, files=None,
                 truncated=False, meta_status=200, private=False,
                 rate_limited_on=None, missing_tree=False):
        self.owner, self.name, self.sha = owner, name, sha
        self.files = files or {}  # path -> text
        self.truncated = truncated
        self.meta_status = meta_status
        self.private = private
        self.rate_limited_on = rate_limited_on  # substring of url to 403 on
        self.missing_tree = missing_tree
        self.calls = 0

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls += 1
        if self.rate_limited_on and self.rate_limited_on in url:
            return _Resp(403, {"message": "rate limited"},
                         {"x-ratelimit-remaining": "0", "retry-after": "60"})
        if url.endswith(f"/repos/{self.owner}/{self.name}"):
            if self.meta_status != 200:
                return _Resp(self.meta_status, {"message": "nope"})
            return _Resp(200, {"private": self.private, "default_branch": "main",
                               "description": "demo", "language": "Python",
                               "stargazers_count": 42})
        if "/commits/main" in url:
            return _Resp(200, {"sha": self.sha})
        if "/git/trees/" in url:
            if self.missing_tree:
                return _Resp(500, None)
            tree = [{"type": "blob", "path": p, "size": len(t.encode())}
                    for p, t in self.files.items()]
            return _Resp(200, {"tree": tree, "truncated": self.truncated})
        if "/contents/" in url:
            path = url.split("/contents/")[-1]
            from urllib.parse import unquote
            path = unquote(path)
            if path in self.files:
                raw = self.files[path].encode()
                return _Resp(200, {"encoding": "base64", "size": len(raw),
                                   "content": base64.b64encode(raw).decode()})
            return _Resp(404, {"message": "missing"})
        return _Resp(404, {"message": "unhandled"})


def _run(fake, matcher, url=None, **kw):
    gh = GitHubClient(client=fake, token=None, request_budget=200)
    return run_scan(url or f"https://github.com/{fake.owner}/{fake.name}",
                    gh, matcher, mapping_version="0.2.0", **kw)


def _ids(scan):
    return {d.node_id: d for d in scan.detections}


# ---------------------------------------------------------------- URL validation

@pytest.mark.parametrize("url,expect", [
    ("https://github.com/facebook/react", ("facebook", "react")),
    ("github.com/owner/repo.git", ("owner", "repo")),
    ("https://www.github.com/a/b/", ("a", "b")),
    ("https://github.com/my-org/my.repo_1", ("my-org", "my.repo_1")),
])
def test_url_normalize_ok(url, expect):
    assert normalize_url(url) == expect


@pytest.mark.parametrize("url", [
    "https://gitlab.com/a/b", "https://github.com/only", "http://127.0.0.1/a/b",
    "https://evil.com/github.com/a/b", "ftp://github.com/a/b",
    "https://github.com/a/b/tree/main/src", "", "not a url",
])
def test_url_normalize_rejects(url):
    with pytest.raises(InvalidRepositoryURL):
        normalize_url(url)


# ---------------------------------------------------------------- Fixtures

def test_react_typescript(matcher):
    fake = FakeGitHub(files={
        "package.json": '{"dependencies":{"react":"^18","react-dom":"^18"},'
                        '"devDependencies":{"typescript":"^5","vite":"^5"}}',
        "tsconfig.json": "{}",
        "src/App.tsx": 'import React from "react";\nexport const A = () => null;',
    })
    scan = _run(fake, matcher)
    ids = _ids(scan)
    assert "technology:react" in ids
    assert ids["technology:react"].detection_status == "confirmed"  # declared + import
    assert "technology:typescript" in ids
    assert "technology:vite" in ids
    assert scan.status == "completed"


def test_python_fastapi(matcher):
    fake = FakeGitHub(files={
        "pyproject.toml": '[project]\ndependencies=["fastapi>=0.1","uvicorn"]',
        "main.py": "from fastapi import FastAPI\napp = FastAPI()",
    })
    ids = _ids(_run(fake, matcher))
    assert ids["technology:fastapi"].detection_status == "confirmed"


def test_pytorch_import_name_mapping(matcher):
    fake = FakeGitHub(files={
        "requirements.txt": "torch==2.1\nnumpy",
        "train.py": "import torch\nimport numpy as np",
    })
    ids = _ids(_run(fake, matcher))
    assert "technology:pytorch" in ids  # torch -> pytorch
    assert ids["technology:pytorch"].detection_status == "confirmed"
    assert "technology:numpy" in ids


def test_docker_and_concept(matcher):
    fake = FakeGitHub(files={"Dockerfile": "FROM python:3.12\nCOPY . /app"})
    ids = _ids(_run(fake, matcher))
    assert ids["technology:docker"].detection_status == "declared"
    assert ids["concept:containerization"].detection_status == "inferred"


def test_github_actions_and_concept(matcher):
    fake = FakeGitHub(files={".github/workflows/ci.yml": "jobs:\n  test:\n    steps: []"})
    ids = _ids(_run(fake, matcher))
    assert ids["technology:github-actions"].detection_status == "declared"
    assert ids["concept:ci-cd"].detection_status == "inferred"


def test_monorepo_component_attribution(matcher):
    fake = FakeGitHub(files={
        "frontend/package.json": '{"dependencies":{"react":"^18"}}',
        "backend/pyproject.toml": '[project]\ndependencies=["fastapi"]',
        "backend/app.py": "from fastapi import FastAPI",
    })
    ids = _ids(_run(fake, matcher))
    assert ids["technology:react"].component_paths == ["frontend"]
    assert ids["technology:fastapi"].component_paths == ["backend"]


# ---------------------------------------------------------------- Negatives

def test_unknown_dependency_is_unmapped_not_invented(matcher):
    fake = FakeGitHub(files={
        "package.json": '{"dependencies":{"totally-made-up-pkg-xyz":"1.0.0"}}'})
    scan = _run(fake, matcher)
    assert not scan.detections  # nothing invented
    assert any(u.name == "totally-made-up-pkg-xyz" for u in scan.unmapped)


def test_readme_mention_is_not_a_detection(matcher):
    # README is not an inspected manifest/source ext, so a mention never counts.
    fake = FakeGitHub(files={"README.md": "This project loves React and FastAPI!"})
    scan = _run(fake, matcher)
    assert "technology:react" not in _ids(scan)


def test_substringy_package_name_does_not_map_to_react(matcher):
    fake = FakeGitHub(files={
        "package.json": '{"dependencies":{"react-super-unknown-widget":"1"}}'})
    scan = _run(fake, matcher)
    assert "technology:react" not in _ids(scan)
    assert any("react-super-unknown-widget" == u.name for u in scan.unmapped)


def test_ai_sdk_does_not_imply_rag_concept(matcher):
    fake = FakeGitHub(files={"requirements.txt": "openai"})
    scan = _run(fake, matcher)
    assert "concept:retrieval-augmented-generation" not in _ids(scan)


def test_malformed_url_raises(matcher):
    fake = FakeGitHub()
    with pytest.raises(InvalidRepositoryURL):
        _run(fake, matcher, url="https://gitlab.com/a/b")


def test_repository_not_found(matcher):
    fake = FakeGitHub(meta_status=404)
    with pytest.raises(RepositoryNotFound):
        _run(fake, matcher)


def test_private_repo_treated_as_not_found(matcher):
    fake = FakeGitHub(private=True)
    with pytest.raises(RepositoryNotFound):
        _run(fake, matcher)


def test_rate_limit_raises_github_error(matcher):
    fake = FakeGitHub(rate_limited_on="/repos/")
    with pytest.raises(GitHubError) as ei:
        _run(fake, matcher)
    assert ei.value.code == "rate_limited"
    assert ei.value.retry_after == 60


def test_truncated_tree_marks_partial(matcher):
    fake = FakeGitHub(truncated=True, files={"package.json": '{"dependencies":{"react":"1"}}'})
    scan = _run(fake, matcher)
    assert scan.coverage.tree_truncated is True
    assert scan.coverage.partial is True
    assert scan.status == "partial"


def test_tree_fetch_failure_yields_empty_but_no_crash(matcher):
    fake = FakeGitHub(missing_tree=True)
    scan = _run(fake, matcher)
    assert scan.detections == []
    assert scan.coverage.files_listed == 0


def test_evidence_links_are_commit_pinned(matcher):
    fake = FakeGitHub(files={"package.json": '{"dependencies":{"react":"1"}}'})
    scan = _run(fake, matcher)
    assert scan.evidence
    assert all(fake.sha in e.source_url and "/blob/" in e.source_url
               for e in scan.evidence)


def test_source_file_budget_marks_partial(matcher):
    files = {f"src/f{i}.ts": 'import React from "react";' for i in range(10)}
    files["package.json"] = '{"dependencies":{"react":"1"}}'
    fake = FakeGitHub(files=files)
    scan = _run(fake, matcher, max_source_files=3)
    assert scan.coverage.files_skipped_limit > 0
    assert scan.coverage.partial is True


def test_cache_roundtrip(tmp_path, matcher):
    from app.scanner.scan_cache import ScanCache
    fake = FakeGitHub(files={"package.json": '{"dependencies":{"react":"1"}}'})
    scan = _run(fake, matcher)
    cache = ScanCache(cache_root=tmp_path)
    cache.put(scan)
    again = cache.get(scan.repository.owner, scan.repository.name,
                      scan.repository.commit_sha, "0.2.0")
    assert again is not None
    assert again.scan_id == scan.scan_id
    # different commit -> cache miss
    assert cache.get(scan.repository.owner, scan.repository.name, "b" * 40, "0.2.0") is None


# ---------------------------------------------------------------- API routes

def test_scan_routes_end_to_end(monkeypatch, tmp_path):
    """POST /repository-scans then GET /{id}, with GitHub + cache injected."""
    from fastapi.testclient import TestClient

    from app import main
    from app.scanner.scan_cache import ScanCache

    fake = FakeGitHub(files={
        "package.json": '{"dependencies":{"react":"^18"}}',
        "src/App.tsx": 'import React from "react";',
    })

    # Inject our fake GitHub client and a temp cache into the route's dependencies.
    monkeypatch.setattr(main, "GitHubClient",
                        lambda *a, **k: GitHubClient(client=fake, token=None,
                                                     request_budget=200))
    main._get_scan_cache.cache_clear()
    monkeypatch.setattr(main, "_get_scan_cache", lambda: ScanCache(cache_root=tmp_path))

    client = TestClient(main.app)
    r = client.post("/api/v1/repository-scans",
                    json={"repository_url": "https://github.com/acme/app"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] in ("completed", "partial")
    assert any(d["node_id"] == "technology:react" for d in body["detections"])
    sid = body["scan_id"]

    g = client.get(f"/api/v1/repository-scans/{sid}")
    assert g.status_code == 200
    assert g.json()["scan_id"] == sid


def test_scan_route_rejects_bad_url(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main
    client = TestClient(main.app)
    r = client.post("/api/v1/repository-scans",
                    json={"repository_url": "https://gitlab.com/a/b"})
    assert r.status_code == 400
    assert r.json()["detail"]["error"] == "invalid_url"


def test_get_unknown_scan_404():
    from fastapi.testclient import TestClient

    from app import main
    client = TestClient(main.app)
    assert client.get("/api/v1/repository-scans/scan_doesnotexist").status_code == 404


# ---------------------------------------------------------------- redirects

def test_same_origin_github_redirect_is_followed():
    """GitHub answers renamed repos with a 301 to api.github.com; follow it (once),
    but never to a different host (SSRF-safe)."""
    class RedirClient:
        def __init__(self):
            self.urls = []

        def get(self, url, params=None, headers=None, timeout=None):
            self.urls.append(url)
            if url.endswith("/repos/old/name"):
                return _Resp(301, None,
                             {"location": "https://api.github.com/repos/new/name"})
            if url.endswith("/repos/new/name"):
                return _Resp(200, {"private": False, "default_branch": "main"})
            return _Resp(404, {})

    rc = RedirClient()
    gh = GitHubClient(client=rc, token=None)
    resp = gh.get("/repos/old/name")
    assert resp.status_code == 200
    assert "repos/new/name" in rc.urls[-1]


def test_cross_host_redirect_is_not_followed():
    class EvilRedirect:
        def get(self, url, params=None, headers=None, timeout=None):
            return _Resp(301, None, {"location": "https://evil.example.com/steal"})

    gh = GitHubClient(client=EvilRedirect(), token=None)
    resp = gh.get("/repos/a/b")
    # not followed -> we return the 301 as-is (caller treats non-200 as an error)
    assert resp.status_code == 301


# ---------------------------------------------------------------- deadline (1.5D)

def test_scan_deadline_marks_partial(matcher):
    """An already-passed wall-clock deadline short-circuits file fetching -> partial,
    without crashing (the scan still returns what it has)."""
    import time as _t
    fake = FakeGitHub(files={
        "package.json": '{"dependencies":{"react":"1"}}',
        "src/a.ts": 'import React from "react";',
        "src/b.ts": 'import x from "lodash";',
    })
    gh = GitHubClient(client=fake, token=None, request_budget=200)
    scan = run_scan("https://github.com/acme/app", gh, matcher, "0.2.0",
                    deadline=_t.monotonic() - 1)  # already expired
    assert scan.status == "partial"
    assert scan.coverage.partial is True
