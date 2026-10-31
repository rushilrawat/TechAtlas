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
    skipped_limit: int = 0            # total files not inspected (back-compat)
    # Coverage detail (1.5D): distinguish high-signal "important" files (manifests,
    # lockfiles, configs, workflows) from bounded SOURCE sampling. Capping source
    # samples does not reduce detection quality, so it must not be reported the same
    # way as a genuinely missed manifest.
    source_files_skipped: int = 0     # source beyond the sampling budget (benign)
    important_files_skipped: int = 0  # manifests/configs dropped by max_files (real)
    manifests_total: int = 0          # manifests+workflows discovered in the tree
    manifests_selected: int = 0       # of those, how many are inspected


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

    # High-signal files (manifests, lockfiles, configs, workflows) are ALWAYS inspected —
    # they drive confirmed/declared detection. Source files are a bounded SAMPLE only.
    high_signal = manifests + workflows
    sel.manifests_total = len(high_signal)

    # Source sampling (design 1.5D): instead of "shallowest N", spread the budget ACROSS
    # top-level directories and prefer entrypoint-like filenames, so the sample represents
    # the whole repo (incl. monorepo packages) rather than just the root. This changes
    # WHICH source files are read, not HOW MANY — the per-scan work stays bounded, so it is
    # fully compatible with Render Free + the GitHub request budget.
    kept_sources = _prioritize_sources(sources, max_source_files)
    sel.source_files_skipped = len(sources) - len(kept_sources)

    # Enforce the overall file cap. High-signal files win the budget over source samples;
    # only if the high-signal set alone exceeds max_files do we drop important files (rare,
    # and reported distinctly so coverage is honest).
    combined = high_signal + kept_sources
    if len(combined) > max_files:
        overflow = len(combined) - max_files
        # Trim source samples first.
        trim_src = min(overflow, len(kept_sources))
        if trim_src:
            kept_sources = kept_sources[: len(kept_sources) - trim_src]
            sel.source_files_skipped += trim_src
            overflow -= trim_src
        # Only then drop important files (counts as a real coverage gap).
        if overflow > 0:
            high_signal = high_signal[: len(high_signal) - overflow]
            sel.important_files_skipped += overflow
        combined = high_signal + kept_sources

    sel.manifests_selected = sum(1 for f in combined if f.kind in ("manifest", "workflow"))
    sel.skipped_limit = sel.source_files_skipped + sel.important_files_skipped
    sel.files = combined
    return sel


# Entrypoint-ish basenames (stem match) that are the highest-signal source files for
# import/usage detection. Case-insensitive stem comparison.
_ENTRYPOINT_STEMS = {
    "main", "index", "app", "__init__", "server", "cli", "mod", "lib", "setup",
    "application", "manage", "wsgi", "asgi", "entry", "bootstrap",
}


def _prioritize_sources(
    sources: list[SelectedFile], budget: int
) -> list[SelectedFile]:
    """Pick up to `budget` source files that best represent the repo.

    Deterministic. Strategy:
      1. Rank each file: entrypoint-stem first, then shallower path, then path (stable).
      2. Distribute the budget round-robin across top-level directories so one giant
         package cannot starve the others (monorepo/workspace coverage).
    """
    if budget <= 0 or not sources:
        return []

    def top_dir(path: str) -> str:
        return path.split("/", 1)[0] if "/" in path else ""

    def stem(path: str) -> str:
        base = path.rsplit("/", 1)[-1]
        return base.rsplit(".", 1)[0].lower() if "." in base else base.lower()

    def rank(f: SelectedFile) -> tuple:
        return (0 if stem(f.path) in _ENTRYPOINT_STEMS else 1,
                f.path.count("/"), f.path)

    # Bucket by top-level directory, each bucket internally ranked.
    buckets: dict[str, list[SelectedFile]] = {}
    for f in sources:
        buckets.setdefault(top_dir(f.path), []).append(f)
    for b in buckets.values():
        b.sort(key=rank)

    # Round-robin across buckets ordered by name for determinism.
    order = sorted(buckets.keys())
    picked: list[SelectedFile] = []
    idx = 0
    while len(picked) < budget and any(buckets[k] for k in order):
        k = order[idx % len(order)]
        if buckets[k]:
            picked.append(buckets[k].pop(0))
        idx += 1
        if idx > len(order) * 10000:  # safety against pathological loops
            break
    return picked[:budget]


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
