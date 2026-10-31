"""Pydantic models for the Repo X-Ray scanner (Phase 1.5A).

Mirrors the scan-result contract in the spec (§11). All fields are additive to the
existing API; nothing here changes Phase 1 shapes.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Scanner + mapping versions are part of the cache key: bump SCANNER_VERSION when
# detection/parsing rules change; MAPPING_VERSION tracks the dataset's package/alias
# mapping data (it is the dataset version, surfaced for cache invalidation).
SCANNER_VERSION = "1.5c.1"

DetectionStatus = Literal["confirmed", "declared", "inferred", "related"]
# Direct vs transitive dependency classification (Phase 1.5C). Distinct from
# DetectionStatus; optional on Detection so pre-1.5C cached scans still deserialize.
DependencyClassification = Literal["direct", "transitive", "undetermined"]
EvidenceType = Literal[
    "language_statistics",
    "file_extension",
    "dependency_manifest",
    "lockfile",
    "source_import",
    "source_usage",
    "configuration",
    "workflow_definition",
    "container_definition",
    "inferred_pattern",
]
ScanStatus = Literal["completed", "partial", "failed"]


class Evidence(BaseModel):
    id: str
    node_id: str
    type: EvidenceType
    file_path: str
    description: str
    detection_status: DetectionStatus
    source_url: str  # commit-pinned GitHub blob URL
    rule: str  # the detection rule/parser that produced this
    scanner_version: str = SCANNER_VERSION
    line: int | None = None


class Detection(BaseModel):
    node_id: str
    node_type: str  # "technology" | "concept"
    role: str  # e.g. "frontend_framework", "programming_language", "engineering_concept"
    detection_status: DetectionStatus
    evidence_ids: list[str] = Field(default_factory=list)
    # Monorepo: component directories the detection was seen in (spec §19). Optional.
    component_paths: list[str] = Field(default_factory=list)
    # Phase 1.5C: direct/transitive classification from manifest-vs-lockfile signals.
    # Optional (None = undetermined/not computed) to stay backward compatible.
    dependency_classification: DependencyClassification | None = None


class UnmappedPackage(BaseModel):
    name: str
    ecosystem: str
    detection_status: DetectionStatus
    evidence_ids: list[str] = Field(default_factory=list)


class ScanRepository(BaseModel):
    owner: str
    name: str
    url: str
    default_branch: str
    commit_sha: str
    description: str | None = None
    primary_language: str | None = None
    stars: int | None = None


class ScanCoverage(BaseModel):
    files_listed: int = 0
    files_inspected: int = 0
    manifests_inspected: int = 0
    source_files_inspected: int = 0
    files_skipped_limit: int = 0
    tree_truncated: bool = False
    partial: bool = False
    # Coverage detail (1.5D): source sampling is bounded by design and does NOT reduce
    # detection quality, so it is reported separately from genuinely missed important
    # files. `all_important_inspected` is the honest "did we read every manifest" signal.
    source_files_skipped: int = 0
    important_files_skipped: int = 0
    manifests_discovered: int = 0
    all_important_inspected: bool = True
    notes: list[str] = Field(default_factory=list)


class ScanSummary(BaseModel):
    matched_technology_count: int = 0
    matched_concept_count: int = 0
    unmapped_package_count: int = 0


class RepoScan(BaseModel):
    scan_id: str
    status: ScanStatus
    scanner_version: str = SCANNER_VERSION
    mapping_version: str  # dataset version used for matching
    repository: ScanRepository
    summary: ScanSummary
    coverage: ScanCoverage
    detections: list[Detection] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    unmapped: list[UnmappedPackage] = Field(default_factory=list)


class ScanError(BaseModel):
    """Returned (with an HTTP error status) when a scan cannot be produced."""

    error: str  # machine code: invalid_url | not_found | rate_limited | empty | github_error
    message: str  # user-facing text
    retry_after_seconds: int | None = None
