"""Phase 1.5C monorepo workspace tests (design Property 14, Req 9.1/9.2, 7.5)."""
from __future__ import annotations

from app.graph_service import GraphService
from app.scanner.github_client import GitHubClient
from app.scanner.scan_orchestrator import run_scan
from app.scanner.technology_matcher import TechnologyMatcher

from .test_scanner import FakeGitHub


def _scan(files, **kw):
    fake = FakeGitHub(files=files)
    gh = GitHubClient(client=fake, token=None, request_budget=400)
    matcher = TechnologyMatcher(GraphService().all_nodes())
    return run_scan(f"https://github.com/{fake.owner}/{fake.name}", gh, matcher,
                    mapping_version="0.3.0", **kw)


def _by_id(scan):
    return {d.node_id: d for d in scan.detections}


def test_same_dependency_across_workspaces_is_one_detection_with_both_paths():
    # react declared in two different workspace package.json files.
    scan = _scan({
        "services/web/package.json": '{"dependencies":{"react":"18.0.0"}}',
        "apps/admin/package.json": '{"dependencies":{"react":"18.0.0"}}',
    })
    react = _by_id(scan).get("technology:react")
    assert react is not None
    # Exactly one detection; component_paths lists each workspace once, sorted/deduped.
    assert react.component_paths == ["apps/admin", "services/web"]
    assert len(react.component_paths) == len(set(react.component_paths))


def test_workspace_path_is_full_directory_not_top_segment():
    scan = _scan({"services/api/requirements.txt": "fastapi\n"})
    fa = _by_id(scan).get("technology:fastapi")
    assert fa is not None
    assert fa.component_paths == ["services/api"]


def test_root_level_manifest_has_no_component_path():
    scan = _scan({"package.json": '{"dependencies":{"react":"18.0.0"}}'})
    react = _by_id(scan).get("technology:react")
    assert react is not None
    assert react.component_paths == []


def test_each_manifest_inspected_once_bounded():
    # Multiple workspaces, each with a manifest -> files_inspected equals distinct files.
    files = {f"svc{i}/package.json": '{"dependencies":{"react":"18.0.0"}}'
             for i in range(5)}
    scan = _scan(files)
    # coverage reflects bounded inspection; no file double-counted.
    assert scan.coverage.files_inspected == len(files)
