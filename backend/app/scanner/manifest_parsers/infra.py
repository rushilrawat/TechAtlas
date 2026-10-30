"""Docker / Compose / GitHub Actions parsing (1.5A).

These emit DIRECT canonical node_id detections (the node ids are known: docker,
github-actions) plus conservatively-inferred concept detections (containerization,
ci-cd). Presence of config establishes configuration — NOT deployment (spec §6.3,
§8.9): a Dockerfile does not prove the app is deployed to any platform.
"""
from __future__ import annotations

import re

from .common import RawDetection


def parse_dockerfile(path: str, text: str) -> list[RawDetection]:
    return [
        RawDetection(
            ecosystem=None, package=None, node_id="technology:docker",
            evidence_type="container_definition", file_path=path,
            description="Dockerfile present (container build configuration)",
            detection_status="declared", rule="infra.dockerfile",
        ),
        RawDetection(
            ecosystem=None, package=None, node_id="concept:containerization",
            evidence_type="inferred_pattern", file_path=path,
            description="containerization inferred from a Dockerfile",
            detection_status="inferred", rule="infra.dockerfile.concept",
        ),
    ]


def parse_compose(path: str, text: str) -> list[RawDetection]:
    out = [
        RawDetection(
            ecosystem=None, package=None, node_id="technology:docker-compose",
            evidence_type="configuration", file_path=path,
            description="Docker Compose file present",
            detection_status="declared", rule="infra.compose",
        ),
        RawDetection(
            ecosystem=None, package=None, node_id="concept:containerization",
            evidence_type="inferred_pattern", file_path=path,
            description="containerization inferred from a Compose file",
            detection_status="inferred", rule="infra.compose.concept",
        ),
    ]
    return out


def parse_workflow(path: str, text: str) -> list[RawDetection]:
    out = [
        RawDetection(
            ecosystem=None, package=None, node_id="technology:github-actions",
            evidence_type="workflow_definition", file_path=path,
            description="GitHub Actions workflow present",
            detection_status="declared", rule="infra.gha",
        ),
        RawDetection(
            ecosystem=None, package=None, node_id="concept:ci-cd",
            evidence_type="inferred_pattern", file_path=path,
            description="CI/CD inferred from a GitHub Actions workflow",
            detection_status="inferred", rule="infra.gha.concept",
        ),
    ]
    # If the workflow deploys (not just tests), that's still only configuration evidence.
    if re.search(r"\b(deploy|release|publish)\b", text, re.IGNORECASE):
        out.append(RawDetection(
            ecosystem=None, package=None, node_id="concept:ci-cd",
            evidence_type="workflow_definition", file_path=path,
            description="workflow defines a deploy/release/publish job",
            detection_status="inferred", rule="infra.gha.deploy",
        ))
    return out
