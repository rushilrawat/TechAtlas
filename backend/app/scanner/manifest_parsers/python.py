"""Python parsing (1.5A).

pyproject.toml / requirements*.txt / Pipfile / poetry.lock / uv.lock -> declared
dependencies; Python source imports -> confirmed. Static only; setup.py is NOT executed
(we do a light regex scan of its install_requires if present). PyPI distribution names
are normalized (lowercase, '_'->'-') so the matcher can map them to canonical nodes.
"""
from __future__ import annotations

import re
import tomllib

from .common import RawDetection

ECO = "pypi"

# A PEP 508 requirement's leading distribution name (before version/extras/markers).
_REQ_NAME_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def _norm(name: str) -> str:
    return name.strip().lower().replace("_", "-")


def _req_name(line: str) -> str | None:
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("-"):
        return None  # comments, pip flags (-r, -e, --hash)
    m = _REQ_NAME_RE.match(line)
    if not m:
        return None
    return _norm(m.group(1))


def parse_requirements(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()
    for line in text.splitlines():
        name = _req_name(line)
        if name and name not in seen:
            seen.add(name)
            out.append(RawDetection(
                ecosystem=ECO, package=name, node_id=None,
                evidence_type="dependency_manifest", file_path=path,
                description=f"{name} declared in {path.rsplit('/',1)[-1]}",
                detection_status="declared", rule="python.requirements",
            ))
    return out


def parse_pyproject(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return out
    seen: set[str] = set()

    def add(name: str):
        n = _norm(name)
        if n and n not in seen:
            seen.add(n)
            out.append(RawDetection(
                ecosystem=ECO, package=n, node_id=None,
                evidence_type="dependency_manifest", file_path=path,
                description=f"{n} declared in pyproject.toml",
                detection_status="declared", rule="python.pyproject",
            ))

    # PEP 621 [project].dependencies = ["fastapi>=0.1", ...]
    proj = data.get("project", {})
    for dep in proj.get("dependencies", []) or []:
        if isinstance(dep, str):
            nm = _req_name(dep)
            if nm:
                add(nm)
    for group in (proj.get("optional-dependencies", {}) or {}).values():
        for dep in group or []:
            if isinstance(dep, str):
                nm = _req_name(dep)
                if nm:
                    add(nm)
    # Poetry: [tool.poetry.dependencies] (keys are names; skip "python")
    poetry = data.get("tool", {}).get("poetry", {})
    for key in (poetry.get("dependencies", {}) or {}):
        if key.lower() != "python":
            add(key)
    for key in (poetry.get("dev-dependencies", {}) or {}):
        if key.lower() != "python":
            add(key)
    return out


def parse_poetry_lock(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return out
    for pkg in data.get("package", []) or []:
        name = pkg.get("name") if isinstance(pkg, dict) else None
        if name:
            out.append(RawDetection(
                ecosystem=ECO, package=_norm(name), node_id=None,
                evidence_type="lockfile", file_path=path,
                description=f"{_norm(name)} present in {path.rsplit('/',1)[-1]}",
                detection_status="declared", rule="python.poetry_lock", direct=False,
            ))
    return out


def parse_uv_lock(path: str, text: str) -> list[RawDetection]:
    # uv.lock is TOML with [[package]] tables, same shape as poetry for our needs.
    out = parse_poetry_lock(path, text)
    return [RawDetection(**{**d.__dict__, "rule": "python.uv_lock"}) for d in out]


# import x / from x import y (top-level module only)
_IMPORT_RE = re.compile(r"^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.MULTILINE)


def parse_source_imports(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()
    for m in _IMPORT_RE.finditer(text):
        mod = m.group(1)
        if mod in seen:
            continue
        seen.add(mod)
        out.append(RawDetection(
            ecosystem=ECO, package=mod, node_id=None,
            evidence_type="source_import", file_path=path,
            description=f"import of '{mod}' in Python source",
            detection_status="confirmed", rule="python.source_import",
        ))
    return out
