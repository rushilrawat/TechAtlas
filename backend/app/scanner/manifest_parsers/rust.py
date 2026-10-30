"""Rust (cargo) parsing (Phase 1.5C).

Cargo.toml -> declared direct dependencies (with dev/build section recorded);
Cargo.lock -> locked packages (transitive); *.rs source -> confirmed `use` /
`extern crate` of external crates. Static only; literal-token output only (every crate
name appears verbatim in the file). Internal/stdlib roots are never emitted.
"""
from __future__ import annotations

import re
import tomllib

from .common import RawDetection

ECO = "cargo"

# Roots that are never external crates (language keywords + the Rust std family).
_RUST_INTERNAL = {"crate", "self", "super", "std", "core", "alloc", "test", "proc_macro"}

_DEP_SECTIONS = {
    "dependencies": "dependencies",
    "dev-dependencies": "dev",
    "build-dependencies": "build",
}


def _cargo_dep_names(table: dict) -> list[str]:
    # keys are crate names; values are version strings or tables (with optional `package`
    # rename). We take the declared key (the crate id used in the manifest).
    return [k for k in table if isinstance(k, str)]


def parse_cargo_toml(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return out
    # Top-level dep tables + per-target [target.'cfg(...)'.dependencies] tables.
    tables: list[tuple[str, dict]] = []
    for sect, label in _DEP_SECTIONS.items():
        t = data.get(sect)
        if isinstance(t, dict):
            tables.append((label, t))
    targets = data.get("target")
    if isinstance(targets, dict):
        for tcfg in targets.values():
            if not isinstance(tcfg, dict):
                continue
            for sect, label in _DEP_SECTIONS.items():
                t = tcfg.get(sect)
                if isinstance(t, dict):
                    tables.append((label, t))

    seen: set[tuple[str, str]] = set()
    for label, table in tables:
        for name in _cargo_dep_names(table):
            key = (name, label)
            if key in seen:
                continue
            seen.add(key)
            out.append(RawDetection(
                ecosystem=ECO, package=name, node_id=None,
                evidence_type="dependency_manifest", file_path=path,
                description=f"{name} declared in Cargo.toml [{label}]",
                detection_status="declared", rule="rust.cargo_toml",
                direct=True, section=label,
                scope="dev" if label in ("dev", "build") else None,
            ))
    return out


def parse_cargo_lock(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return out
    seen: set[str] = set()
    for pkg in data.get("package", []) or []:
        name = pkg.get("name") if isinstance(pkg, dict) else None
        if name and name not in seen:
            seen.add(name)
            out.append(RawDetection(
                ecosystem=ECO, package=name, node_id=None,
                evidence_type="lockfile", file_path=path,
                description=f"{name} present in Cargo.lock",
                detection_status="declared", rule="rust.cargo_lock", direct=False,
            ))
    return out


# `use foo::...;`, `use foo;`, optional `pub`; and `extern crate foo;`.
_USE_RE = re.compile(r"^\s*(?:pub\s+)?use\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
_EXTERN_RE = re.compile(r"^\s*extern\s+crate\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def parse_source_imports(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()
    for rx in (_USE_RE, _EXTERN_RE):
        for m in rx.finditer(text):
            root = m.group(1)
            if root in _RUST_INTERNAL or root in seen:
                continue
            seen.add(root)
            out.append(RawDetection(
                ecosystem=ECO, package=root, node_id=None,
                evidence_type="source_import", file_path=path,
                description=f"use of crate '{root}' in Rust source",
                detection_status="confirmed", rule="rust.source_import",
                line=_line_of(text, m.start(1)),
            ))
    return out
