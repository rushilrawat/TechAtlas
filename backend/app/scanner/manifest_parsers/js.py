"""JavaScript / TypeScript parsing (1.5A).

package.json dependencies -> declared (direct). Lockfiles -> transitive packages.
Config files (vite/next/tsconfig/angular) -> declared signals. Source imports ->
confirmed usage. All static: no npm install, no code execution.
"""
from __future__ import annotations

import json
import re

from .common import RawDetection

ECO = "npm"


def parse_package_json(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return out
    if not isinstance(data, dict):
        return out
    for field, direct in (
        ("dependencies", True),
        ("devDependencies", True),
        ("peerDependencies", True),
        ("optionalDependencies", True),
    ):
        deps = data.get(field)
        if not isinstance(deps, dict):
            continue
        for name in deps:
            if not isinstance(name, str) or not name:
                continue
            out.append(RawDetection(
                ecosystem=ECO, package=name, node_id=None,
                evidence_type="dependency_manifest", file_path=path,
                description=f"{name} declared in package.json ({field})",
                detection_status="declared", rule="js.package_json", direct=direct,
            ))
    return out


_LOCK_NAME_RE = {
    # package-lock.json is JSON; handled separately. These are text scans for the
    # presence of a package name as a transitive entry (best-effort, never "confirmed").
}


def parse_package_lock(path: str, text: str) -> list[RawDetection]:
    """package-lock.json (npm v2/v3): collect package names as transitive unless root."""
    out: list[RawDetection] = []
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return out
    pkgs = data.get("packages") if isinstance(data, dict) else None
    if isinstance(pkgs, dict):
        for key in pkgs:
            # key "" is the root project; "node_modules/<name>" are installed deps.
            if not key.startswith("node_modules/"):
                continue
            name = key.split("node_modules/")[-1]
            if not name:
                continue
            out.append(RawDetection(
                ecosystem=ECO, package=name, node_id=None,
                evidence_type="lockfile", file_path=path,
                description=f"{name} present in package-lock.json",
                detection_status="declared", rule="js.package_lock", direct=False,
            ))
    return out


# Config files are strong signals for specific tools.
_CONFIG_SIGNALS = {
    "vite.config": "vite",
    "next.config": "next",
    "angular.json": "@angular/core",
}


def parse_config(path: str, text: str) -> list[RawDetection]:
    base = path.rsplit("/", 1)[-1]
    out: list[RawDetection] = []
    for prefix, pkg in _CONFIG_SIGNALS.items():
        if base == prefix or base.startswith(prefix):
            out.append(RawDetection(
                ecosystem=ECO, package=pkg, node_id=None,
                evidence_type="configuration", file_path=path,
                description=f"{base} configuration present",
                detection_status="declared", rule="js.config",
            ))
    if base == "tsconfig.json":
        out.append(RawDetection(
            ecosystem=ECO, package="typescript", node_id=None,
            evidence_type="configuration", file_path=path,
            description="tsconfig.json present (TypeScript project)",
            detection_status="declared", rule="js.tsconfig",
        ))
    return out


# import x from "pkg"  /  require("pkg")  /  import("pkg")
_IMPORT_RE = re.compile(
    r"""(?:import[^'"]*from\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]""",
)


def _pkg_from_specifier(spec: str) -> str | None:
    if spec.startswith("."):  # relative import, not a package
        return None
    if spec.startswith("@"):  # scoped: @scope/name
        parts = spec.split("/")
        return "/".join(parts[:2]) if len(parts) >= 2 else None
    return spec.split("/")[0]


def parse_source_imports(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()
    for m in _IMPORT_RE.finditer(text):
        pkg = _pkg_from_specifier(m.group(1))
        if not pkg or pkg in seen:
            continue
        seen.add(pkg)
        out.append(RawDetection(
            ecosystem=ECO, package=pkg, node_id=None,
            evidence_type="source_import", file_path=path,
            description=f"import of '{pkg}' in source",
            detection_status="confirmed", rule="js.source_import",
        ))
    return out
