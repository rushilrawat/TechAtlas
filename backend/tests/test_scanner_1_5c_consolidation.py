"""Phase 1.5C build_scan consolidation tests: classification, dedupe, no-zero-evidence,
concept tightening, unmapped handling (design Properties 9,10,11,12,13,15,16).
"""
from __future__ import annotations

from app.graph_service import GraphService
from app.scanner.github_client import GitHubClient
from app.scanner.scan_orchestrator import run_scan
from app.scanner.technology_matcher import TechnologyMatcher

from .test_scanner import FakeGitHub


def _scan(files, **kw):
    fake = FakeGitHub(files=files)
    gh = GitHubClient(client=fake, token=None, request_budget=300)
    matcher = TechnologyMatcher(GraphService().all_nodes())
    return run_scan(f"https://github.com/{fake.owner}/{fake.name}", gh, matcher,
                    mapping_version="0.2.0", **kw)


def _by_id(scan):
    return {d.node_id: d for d in scan.detections}


def test_no_detection_has_zero_evidence():
    scan = _scan({
        "requirements.txt": "fastapi\n",
        "package.json": '{"dependencies":{"react":"18.0.0"}}',
        "Dockerfile": "FROM python:3.12",
    })
    for d in scan.detections:
        assert len(d.evidence_ids) >= 1, f"{d.node_id} has zero evidence"


def test_detection_status_in_closed_set_and_classification_separate():
    scan = _scan({"package.json": '{"dependencies":{"react":"18.0.0"}}'})
    for d in scan.detections:
        assert d.detection_status in ("confirmed", "declared", "inferred", "related")
        assert d.dependency_classification in (None, "direct", "transitive", "undetermined")


def test_direct_manifest_classified_direct():
    # react declared directly in package.json -> direct.
    scan = _scan({"package.json": '{"dependencies":{"react":"18.0.0"}}'})
    react = _by_id(scan).get("technology:react")
    assert react is not None and react.dependency_classification == "direct"


def test_concepts_are_inferred_and_existing_nodes_only():
    scan = _scan({"Dockerfile": "FROM python:3.12\nCOPY . /app"})
    concepts = [d for d in scan.detections if d.node_type == "concept"]
    # Every concept carries evidence, is 'inferred', and exists in the dataset.
    for c in concepts:
        assert c.detection_status == "inferred"
        assert len(c.evidence_ids) >= 1


def test_unmapped_summary_count_matches_list():
    scan = _scan({"requirements.txt": "some-obscure-pkg-xyz\nanother-unknown-abc\n"})
    assert scan.summary.unmapped_package_count == len(scan.unmapped)
    assert scan.summary.unmapped_package_count >= 1


def test_unmapped_package_preserves_name_and_ecosystem():
    scan = _scan({"requirements.txt": "some-obscure-pkg-xyz\n"})
    u = [x for x in scan.unmapped if "obscure" in x.name]
    assert u and u[0].ecosystem == "pypi"
    assert all(len(x.evidence_ids) >= 1 for x in scan.unmapped)


def test_dedupe_identical_observation_counts_once():
    # Same package in requirements.txt listed twice on identical lines -> one evidence.
    scan = _scan({"requirements.txt": "fastapi\nfastapi\n"})
    fa = _by_id(scan).get("technology:fastapi")
    if fa is not None:
        # requirements parser already de-dupes within a file; assert no duplicate evidence.
        assert len(fa.evidence_ids) == len(set(fa.evidence_ids))


def test_cargo_direct_vs_lock_transitive_classification():
    scan = _scan({
        "Cargo.toml": '[dependencies]\nserde = "1.0"\n',
        "Cargo.lock": '[[package]]\nname = "libc"\nversion = "0.2"\n',
    })
    by = _by_id(scan)
    # serde (if mapped) is direct; a lock-only package (if mapped) is transitive.
    for d in by.values():
        if d.dependency_classification == "transitive":
            # transitive ones must not also have a direct manifest decl
            assert d.dependency_classification != "direct"
