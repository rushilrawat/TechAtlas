"""Java / Kotlin (maven) parsing (Phase 1.5C).

pom.xml (Maven) and build.gradle / build.gradle.kts (Gradle) -> declared dependencies as
"group:artifact" coordinates, ecosystem "maven". Gradle version-catalog aliases
(gradle/libs.versions.toml) are resolved to coordinates. Static only: no Maven/Gradle
execution. Unresolved ${property} / $var references are emitted verbatim, never a
fabricated version or node. Test scope is recorded.
"""
from __future__ import annotations

import re
import tomllib
import xml.etree.ElementTree as ET

from .common import RawDetection

ECO = "maven"

# Strip XML namespaces so <project xmlns="..."> tags match plainly.
def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_pom_xml(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return out
    seen: set[tuple[str, str]] = set()
    for dep in root.iter():
        if _strip_ns(dep.tag) != "dependency":
            continue
        gid = aid = scope = None
        for child in dep:
            t = _strip_ns(child.tag)
            if t == "groupId":
                gid = (child.text or "").strip()
            elif t == "artifactId":
                aid = (child.text or "").strip()
            elif t == "scope":
                scope = (child.text or "").strip().lower()
        if not gid or not aid:
            continue
        coord = f"{gid}:{aid}"
        key = (coord, scope or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(RawDetection(
            ecosystem=ECO, package=coord, node_id=None,
            evidence_type="dependency_manifest", file_path=path,
            description=f"{coord} declared in pom.xml",
            detection_status="declared", rule="java.pom",
            direct=True, scope="test" if scope == "test" else None,
        ))
    return out


def resolve_version_catalog(text: str) -> dict[str, str]:
    """[libraries] alias = { group, name } -> {alias (dotted or dashed): 'group:name'}."""
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return {}
    out: dict[str, str] = {}
    for alias, spec in (data.get("libraries", {}) or {}).items():
        if isinstance(spec, dict):
            grp, nm = spec.get("group"), spec.get("name")
            module = spec.get("module")
            if grp and nm:
                coord = f"{grp}:{nm}"
            elif isinstance(module, str) and ":" in module:
                coord = module
            else:
                continue
        elif isinstance(spec, str) and ":" in spec:
            coord = ":".join(spec.split(":")[:2])
        else:
            continue
        # Gradle exposes `libs.foo.bar` for an alias "foo-bar"; index both forms.
        out[alias] = coord
        out[alias.replace("-", ".")] = coord
    return out


# Gradle dependency lines: `config "group:name:ver"`, `config('group:name:ver')`,
# `config "g:n"`, and catalog refs `config libs.foo.bar` / `config(libs.foo.bar)`.
_GRADLE_CONFIGS = (
    "implementation", "api", "compileOnly", "runtimeOnly", "testImplementation",
    "testRuntimeOnly", "testCompileOnly", "annotationProcessor", "kapt", "ksp",
    "developmentOnly", "classpath",
)
_COORD_RE = re.compile(
    r"\b(" + "|".join(_GRADLE_CONFIGS) + r")\b\s*\(?\s*['\"]([^'\"]+)['\"]"
)
_CATALOG_RE = re.compile(
    r"\b(" + "|".join(_GRADLE_CONFIGS) + r")\b\s*\(?\s*libs\.([A-Za-z0-9_.]+)"
)
_TEST_CONFIGS = {"testImplementation", "testRuntimeOnly", "testCompileOnly"}


def parse_gradle(path: str, text: str, catalog: dict[str, str] | None = None) -> list[RawDetection]:
    out: list[RawDetection] = []
    catalog = catalog or {}
    seen: set[str] = set()

    def emit(config: str, coord: str, line: int):
        if coord in seen:
            return
        seen.add(coord)
        out.append(RawDetection(
            ecosystem=ECO, package=coord, node_id=None,
            evidence_type="dependency_manifest", file_path=path,
            description=f"{coord} declared in {path.rsplit('/',1)[-1]}",
            detection_status="declared", rule="java.gradle",
            direct=True, scope="test" if config in _TEST_CONFIGS else None, line=line,
        ))

    for m in _COORD_RE.finditer(text):
        config, raw = m.group(1), m.group(2)
        # Keep group:name (drop version if present); emit verbatim if it has a $var.
        parts = raw.split(":")
        coord = ":".join(parts[:2]) if len(parts) >= 2 else raw
        line = text.count("\n", 0, m.start()) + 1
        emit(config, coord, line)

    for m in _CATALOG_RE.finditer(text):
        config, alias = m.group(1), m.group(2)
        coord = catalog.get(alias) or catalog.get(alias.replace(".", "-"))
        if coord is None:
            continue  # unresolved alias -> do not fabricate a coordinate
        line = text.count("\n", 0, m.start()) + 1
        emit(config, coord, line)

    return out
