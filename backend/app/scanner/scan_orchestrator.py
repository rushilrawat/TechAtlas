"""Scan pipeline: URL -> RepoScan (1.5A).

resolve -> select tree -> fetch+parse relevant files -> match to canonical nodes ->
consolidate (one Detection per node, many Evidence) -> assemble RepoScan with coverage.
Bounded throughout (request budget + file/byte caps + truncation handling); partial
coverage is labeled, never hidden. No repository code is executed.
"""
from __future__ import annotations

import hashlib
import time
from urllib.parse import quote

from .github_client import BudgetExceeded, GitHubClient, GitHubError
from .import_role import role_for_node
from .manifest_parsers import infra, js
from .manifest_parsers import python as pyparser
from .manifest_parsers.common import RawDetection
from .models import (
    SCANNER_VERSION,
    Detection,
    Evidence,
    RepoScan,
    ScanCoverage,
    ScanRepository,
    ScanSummary,
    UnmappedPackage,
)
from .repository_resolver import RepoIdentity
from .technology_matcher import TechnologyMatcher

# Rank so a stronger status wins when the same node has mixed evidence.
_STATUS_RANK = {"related": 0, "inferred": 1, "declared": 2, "confirmed": 3}


def _blob_url(owner: str, name: str, sha: str, path: str) -> str:
    return f"https://github.com/{owner}/{name}/blob/{sha}/{quote(path)}"


def _parse_file(path: str, kind: str, text: str) -> list[RawDetection]:
    base = path.rsplit("/", 1)[-1]
    out: list[RawDetection] = []
    if kind == "workflow":
        return infra.parse_workflow(path, text)
    if kind == "manifest":
        if base == "package.json":
            out += js.parse_package_json(path, text)
        elif base == "package-lock.json":
            out += js.parse_package_lock(path, text)
        elif base in ("tsconfig.json", "angular.json") or base.startswith(
            ("vite.config", "next.config")
        ):
            out += js.parse_config(path, text)
        elif base == "pyproject.toml":
            out += pyparser.parse_pyproject(path, text)
        elif base == "poetry.lock":
            out += pyparser.parse_poetry_lock(path, text)
        elif base == "uv.lock":
            out += pyparser.parse_uv_lock(path, text)
        elif base.startswith("requirements") and base.endswith(".txt"):
            out += pyparser.parse_requirements(path, text)
        elif base.startswith("Dockerfile"):
            out += infra.parse_dockerfile(path, text)
        elif base in ("docker-compose.yml", "docker-compose.yaml",
                      "compose.yml", "compose.yaml"):
            out += infra.parse_compose(path, text)
        return out
    if kind == "source":
        if path.endswith(".py"):
            out += pyparser.parse_source_imports(path, text)
        else:
            out += js.parse_source_imports(path, text)
    return out


def build_scan(
    identity: RepoIdentity,
    selection,          # TreeSelection
    file_texts: dict[str, str],  # path -> text (already bounded/fetched)
    matcher: TechnologyMatcher,
    mapping_version: str,
    *,
    requests_used: int = 0,
    coverage_extra: dict | None = None,
) -> RepoScan:
    """Pure assembly step (no network) — easy to unit-test with fixtures."""
    raw: list[RawDetection] = []
    manifests = sources = 0
    for f in selection.files:
        text = file_texts.get(f.path)
        if text is None:
            continue
        if f.kind == "manifest":
            manifests += 1
        elif f.kind == "source":
            sources += 1
        raw += _parse_file(f.path, f.kind, text)

    # Consolidate per node id. Package detections -> match; node_id detections direct.
    evidence: list[Evidence] = []
    by_node: dict[str, dict] = {}   # node_id -> {status, evidence_ids, components}
    unmapped: dict[tuple[str, str], dict] = {}
    ev_seq = 0

    def add_evidence(node_id: str, rd: RawDetection) -> str:
        nonlocal ev_seq
        ev_seq += 1
        eid = f"ev_{ev_seq:04d}"
        evidence.append(Evidence(
            id=eid, node_id=node_id, type=rd.evidence_type, file_path=rd.file_path,
            description=rd.description, detection_status=rd.detection_status,
            source_url=_blob_url(identity.owner, identity.name,
                                 identity.commit_sha, rd.file_path),
            rule=rd.rule, line=rd.line,
        ))
        return eid

    def component_of(path: str) -> str | None:
        return path.split("/", 1)[0] if "/" in path else None

    for rd in raw:
        node_id = rd.node_id
        if node_id is None and rd.ecosystem and rd.package:
            node_id = matcher.match_package(rd.ecosystem, rd.package)
        if node_id is None:
            if rd.ecosystem and rd.package:  # record unmapped package
                key = (rd.ecosystem, rd.package.lower())
                u = unmapped.setdefault(key, {"status": rd.detection_status, "eids": []})
                eid = add_evidence(f"unmapped:{rd.ecosystem}:{rd.package}", rd)
                u["eids"].append(eid)
                if _STATUS_RANK[rd.detection_status] > _STATUS_RANK[u["status"]]:
                    u["status"] = rd.detection_status
            continue
        if not matcher.has(node_id):
            continue  # a direct node_id (e.g. a tool) not present in this dataset
        eid = add_evidence(node_id, rd)
        slot = by_node.setdefault(
            node_id, {"status": rd.detection_status, "eids": [], "components": set()}
        )
        slot["eids"].append(eid)
        if _STATUS_RANK[rd.detection_status] > _STATUS_RANK[slot["status"]]:
            slot["status"] = rd.detection_status
        comp = component_of(rd.file_path)
        if comp:
            slot["components"].add(comp)

    detections: list[Detection] = []
    tech_count = concept_count = 0
    for node_id, slot in by_node.items():
        node_type = "concept" if node_id.startswith("concept:") else "technology"
        if node_type == "technology":
            tech_count += 1
        else:
            concept_count += 1
        detections.append(Detection(
            node_id=node_id, node_type=node_type,
            role=role_for_node(node_id, matcher),
            detection_status=slot["status"], evidence_ids=slot["eids"],
            component_paths=sorted(slot["components"]),
        ))

    unmapped_list = [
        UnmappedPackage(name=name, ecosystem=eco, detection_status=d["status"],
                        evidence_ids=d["eids"])
        for (eco, name), d in unmapped.items()
    ]

    cov = ScanCoverage(
        files_listed=selection.files_listed,
        files_inspected=len(file_texts),
        manifests_inspected=manifests,
        source_files_inspected=sources,
        files_skipped_limit=selection.skipped_limit,
        tree_truncated=selection.truncated,
    )
    if coverage_extra:
        for k, v in coverage_extra.items():
            setattr(cov, k, v)
    cov.partial = bool(cov.tree_truncated or cov.files_skipped_limit > 0
                       or (coverage_extra or {}).get("partial"))
    if cov.tree_truncated:
        cov.notes.append("GitHub returned a truncated file tree; coverage is incomplete.")
    if cov.files_skipped_limit > 0:
        cov.notes.append(
            f"{cov.files_skipped_limit} file(s) skipped due to scan budgets."
        )

    scan_id = "scan_" + hashlib.sha1(
        f"{identity.owner}/{identity.name}@{identity.commit_sha}:{SCANNER_VERSION}:{mapping_version}".encode()
    ).hexdigest()[:16]

    return RepoScan(
        scan_id=scan_id,
        status="partial" if cov.partial else "completed",
        mapping_version=mapping_version,
        repository=ScanRepository(
            owner=identity.owner, name=identity.name, url=identity.url,
            default_branch=identity.default_branch, commit_sha=identity.commit_sha,
            description=identity.description, primary_language=identity.primary_language,
            stars=identity.stars,
        ),
        summary=ScanSummary(
            matched_technology_count=tech_count,
            matched_concept_count=concept_count,
            unmapped_package_count=len(unmapped_list),
        ),
        coverage=cov,
        detections=detections,
        evidence=evidence,
        unmapped=unmapped_list,
    )


def run_scan(
    raw_url: str,
    gh: GitHubClient,
    matcher: TechnologyMatcher,
    mapping_version: str,
    *,
    max_files: int = 300,
    max_source_files: int = 120,
    max_bytes: int = 256 * 1024,
    deadline: float | None = None,
) -> RepoScan:
    """Full pipeline (does network via gh). Validation/resolution errors propagate as
    the resolver's typed exceptions / GitHubError for the route to translate."""
    from .repository_resolver import resolve
    from .tree_inspector import fetch_text, select_files

    identity = resolve(raw_url, gh)
    budget_hit = False
    try:
        selection = select_files(
            identity.owner, identity.name, identity.commit_sha, gh,
            max_files=max_files, max_source_files=max_source_files,
        )
    except BudgetExceeded:
        budget_hit = True
        selection = None

    file_texts: dict[str, str] = {}
    if selection is not None:
        for f in selection.files:
            if deadline is not None and time.monotonic() > deadline:
                budget_hit = True  # overall wall-clock cap reached -> partial
                break
            try:
                txt = fetch_text(
                    identity.owner, identity.name, identity.commit_sha, f.path, gh,
                    max_bytes=max_bytes,
                )
            except BudgetExceeded:
                budget_hit = True
                break
            if txt is not None:
                file_texts[f.path] = txt
    else:
        from .tree_inspector import TreeSelection
        selection = TreeSelection()

    return build_scan(
        identity, selection, file_texts, matcher, mapping_version,
        requests_used=gh.requests_used,
        coverage_extra={"partial": True} if budget_hit else None,
    )


__all__ = ["run_scan", "build_scan", "GitHubError"]
