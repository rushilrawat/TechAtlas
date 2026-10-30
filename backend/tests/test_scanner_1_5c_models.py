"""Phase 1.5C additive-model tests: Detection.dependency_classification and
RawDetection section/scope metadata. These guard backward compatibility — pre-1.5C
cached scans (no classification key) must still deserialize.
"""
from __future__ import annotations

import json

from app.scanner.manifest_parsers.common import RawDetection
from app.scanner.models import SCANNER_VERSION, Detection, RepoScan


def test_scanner_version_bumped_to_1_5c():
    assert SCANNER_VERSION == "1.5c.1"


def test_detection_classification_optional_default_none():
    d = Detection(node_id="technology:x", node_type="technology", role="r",
                  detection_status="confirmed")
    assert d.dependency_classification is None


def test_detection_roundtrips_with_classification():
    d = Detection(node_id="technology:x", node_type="technology", role="r",
                  detection_status="declared", dependency_classification="direct")
    again = Detection.model_validate(json.loads(d.model_dump_json()))
    assert again.dependency_classification == "direct"


def test_legacy_detection_without_classification_key_deserializes():
    # A pre-1.5C cached Detection had no dependency_classification field.
    legacy = {"node_id": "technology:x", "node_type": "technology", "role": "r",
              "detection_status": "confirmed", "evidence_ids": [], "component_paths": []}
    d = Detection.model_validate(legacy)
    assert d.dependency_classification is None


def test_rawdetection_section_scope_default_none_and_settable():
    r = RawDetection(ecosystem="npm", package="react", node_id=None,
                     evidence_type="dependency_manifest", file_path="package.json",
                     description="x", detection_status="declared", rule="js.pkg")
    assert r.section is None and r.scope is None
    r2 = RawDetection(ecosystem="cargo", package="serde", node_id=None,
                      evidence_type="dependency_manifest", file_path="Cargo.toml",
                      description="x", detection_status="declared",
                      rule="rust.cargo_toml", section="dev", scope="test")
    assert r2.section == "dev" and r2.scope == "test"


def test_legacy_reposcan_without_classification_deserializes():
    legacy = {
        "scan_id": "s1", "status": "completed", "scanner_version": "1.5a.1",
        "mapping_version": "0.2.0",
        "repository": {"owner": "o", "name": "r", "url": "https://github.com/o/r",
                       "default_branch": "main", "commit_sha": "a" * 40},
        "summary": {}, "coverage": {},
        "detections": [{"node_id": "technology:x", "node_type": "technology",
                        "role": "r", "detection_status": "confirmed"}],
        "evidence": [], "unmapped": [],
    }
    scan = RepoScan.model_validate(legacy)
    assert scan.detections[0].dependency_classification is None
