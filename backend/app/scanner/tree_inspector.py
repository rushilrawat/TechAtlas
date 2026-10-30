"""Fetch the repo git tree and select relevant files within budgets (1.5A).

Handles GitHub's `truncated` flag (spec §7.4) — a truncated tree is never treated as a
complete inventory. Selects manifests/lockfiles/config + a bounded set of source files,
excluding vendored/generated/binary paths, and enforces file-count/byte budgets so a
huge monorepo yields a labeled PARTIAL scan rather than an unbounded crawl.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass, field

from .github_client import BudgetExceeded, GitHubClient

# Directories never worth inspecting (dependencies / build output / VCS).
_EXCLUDE_DIR_PARTS = {
    "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", "vendor",
    "venv", ".venv", "__pycache__", ".tox", "target", "bin", "obj", ".idea",
    ".vscode", "coverage", ".cache", "site-packages", "third_party", "Pods",
}
# Binary / non-source extensions to skip for source analysis.
_BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".wav", ".so", ".dll", ".dylib",
    ".class", ".jar", ".wasm", ".bin", ".lock-cache", ".parquet", ".onnx", ".pt", ".pth",
}

# Manifest/config basenames we always want (high signal, cheap).
MANIFEST_BASENAMES = {
    # JS/TS
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock",
    "bun.lockb", "tsconfig.json", "angular.json",
    # Python
    "pyproject.toml", "requirements.txt", "poetry.lock", "uv.lock", "Pipfile",
    "Pipfile.lock", "setup.py", "setup.cfg",
    # Docker / infra
    "Dockerfile", ".dockerignore", "docker-compose.yml", "docker-compose.yaml",
    "compose.yml", "compose.yaml",
    # Rust (cargo)
    "Cargo.toml", "Cargo.lock",
    # Java / Kotlin (maven / gradle)
    "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle",
    "settings.gradle.kts",
    # Go
    "go.mod", "go.sum",
}
# Prefix/suffix patterns for manifests/config.
def _is_manifest(path: str) -> bool:
    base = path.rsplit("/", 1)[-1]
    if base in MANIFEST_BASENAMES:
        return True
    if base.startswith("requirements") and base.endswith(".txt"):
        return True
    if base.startswith("Dockerfile"):
        return True
    if base.startswith("vite.config.") or base.startswith("next.config."):
        return True
    # Gradle version catalog: only when it lives under a gradle/ directory, to avoid
    # scooping up unrelated TOML files elsewhere in the tree.
    if base == "libs.versions.toml" and "gradle/" in path:
        return True
    return False


def _is_workflow(path: str) -> bool:
    return path.startswith(".github/workflows/") and (
        path.endswith(".yml") or path.endswith(".yaml")
    )


# Source extensions we do a bounded import scan on.
SOURCE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rs", ".go"}


def _excluded(path: str) -> bool:
    parts = path.split("/")
    return any(p in _EXCLUDE_DIR_PARTS for p in parts)


@dataclass
class SelectedFile:
    path: str
    size: int
    kind: str  # "manifest" | "workflow" | "source"


@dataclass
class TreeSelection:
    files: list[SelectedFile] = field(default_factory=list)
    files_listed: int = 0
    truncated: bool = False
    skipped_limit: int = 0


def select_files(
    owner: str,
    repo: str,
    commit_sha: str,
    gh: GitHubClient,
    *,
    max_files: int = 300,
    max_source_files: int = 120,
) -> TreeSelection:
    """List the tree at the commit and pick relevant files within budgets."""
    sel = TreeSelection()
    try:
        resp = gh.get(
            f"/repos/{owner}/{repo}/git/trees/{commit_sha}", params={"recursive": "1"}
        )
    except BudgetExceeded:
        sel.skipped_limit += 1
        return sel
    if resp.status_code != 200 or not isinstance(resp.json_body, dict):
        return sel

    tree = resp.json_body.get("tree", [])
    sel.truncated = bool(resp.json_body.get("truncated"))
    blobs = [t for t in tree if t.get("type") == "blob"]
    sel.files_listed = len(blobs)

    manifests: list[SelectedFile] = []
    workflows: list[SelectedFile] = []
    sources: list[SelectedFile] = []
    for t in blobs:
        path = t.get("path", "")
        size = int(t.get("size") or 0)
        if _excluded(path):
            continue
        if _is_manifest(path):
            manifests.append(SelectedFile(path, size, "manifest"))
        elif _is_workflow(path):
            workflows.append(SelectedFile(path, size, "workflow"))
        else:
            ext = path[path.rfind("."):] if "." in path.rsplit("/", 1)[-1] else ""
            if ext in SOURCE_EXT and ext not in _BINARY_EXT:
                sources.append(SelectedFile(path, size, "source"))

    # Manifests + workflows are always included (bounded high-signal set).
    # Source files are capped (prefer shallower paths = likelier app entrypoints).
    sources.sort(key=lambda f: (f.path.count("/"), f.path))
    kept_sources = sources[:max_source_files]
    sel.skipped_limit += len(sources) - len(kept_sources)

    combined = manifests + workflows + kept_sources
    if len(combined) > max_files:
        sel.skipped_limit += len(combined) - max_files
        combined = combined[:max_files]
    sel.files = combined
    return sel


def fetch_text(
    owner: str, repo: str, commit_sha: str, path: str, gh: GitHubClient,
    *, max_bytes: int = 256 * 1024,
) -> str | None:
    """Fetch a single text file's content at the commit, or None (binary/too big/err)."""
    try:
        resp = gh.get(
            f"/repos/{owner}/{repo}/contents/{path}", params={"ref": commit_sha}
        )
    except BudgetExceeded:
        return None
    if resp.status_code != 200 or not isinstance(resp.json_body, dict):
        return None
    body = resp.json_body
    if body.get("encoding") != "base64" or not body.get("content"):
        return None
    if int(body.get("size") or 0) > max_bytes:
        return None
    try:
        raw = base64.b64decode(body["content"])
    except (ValueError, TypeError):
        return None
    if b"\x00" in raw[:1024]:  # binary sniff
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
