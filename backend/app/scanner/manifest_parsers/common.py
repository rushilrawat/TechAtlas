"""Shared types for manifest/source parsers.

A RawDetection is a pre-matching observation: a package name (within an ecosystem) or a
direct technology/concept signal, plus the evidence that produced it. The matcher later
maps package-type detections onto canonical node ids; direct node_id detections (e.g.
Docker from a Dockerfile) are already canonical.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RawDetection:
    # Exactly one of (ecosystem+package) or node_id is the identity:
    ecosystem: str | None          # "npm" | "pypi" | ... when this is a package
    package: str | None            # package name within that ecosystem
    node_id: str | None            # canonical node id when known directly (e.g. technology:docker)
    # Evidence:
    evidence_type: str             # EvidenceType literal value
    file_path: str
    description: str
    detection_status: str          # "confirmed" | "declared" | "inferred"
    rule: str
    direct: bool = True            # direct vs transitive dependency (when known)
    line: int | None = None
    # Phase 1.5C optional metadata, carried to build_scan for classification/scoping:
    section: str | None = None     # e.g. rust: 'dependencies'|'dev'|'build'
    scope: str | None = None       # e.g. java/go: 'test' when known
