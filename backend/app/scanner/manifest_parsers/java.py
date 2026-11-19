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


PLUGIN_ECO = "gradle-plugin"


def resolve_plugin_catalog(text: str) -> dict[str, str]:
    """[plugins] alias = { id = "..." } -> {alias (dotted or dashed): plugin id}."""
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError):
        return {}
    out: dict[str, str] = {}
    for alias, spec in (data.get("plugins", {}) or {}).items():
        pid = spec.get("id") if isinstance(spec, dict) else (
            spec.split(":")[0] if isinstance(spec, str) else None)
        if not isinstance(pid, str) or not pid:
            continue
        out[alias] = pid
        out[alias.replace("-", ".")] = pid
    return out


def parse_version_catalog(path: str, text: str) -> list[RawDetection]:
    """gradle/libs.versions.toml: every [libraries] coordinate and [plugins] id is declared.

    Large builds apply catalog entries from convention plugins (build-logic/) that a
    manifest-only scan never sees, so the catalog itself is the declaration of record.
    Test-only libraries cannot be told apart here, so scope is left unknown.
    """
    out: list[RawDetection] = []
    seen: set[tuple[str, str]] = set()
    for eco, mapping, what in (
        (ECO, resolve_version_catalog(text), "library"),
        (PLUGIN_ECO, resolve_plugin_catalog(text), "plugin"),
    ):
        for coord in mapping.values():
            if (eco, coord) in seen:
                continue
            seen.add((eco, coord))
            out.append(RawDetection(
                ecosystem=eco, package=coord, node_id=None,
                evidence_type="dependency_manifest", file_path=path,
                description=f"{coord} {what} declared in the Gradle version catalog",
                detection_status="declared", rule="java.gradle_catalog", direct=True,
            ))
    return out


# plugins { id("x") / id 'x' / kotlin("multiplatform") / alias(libs.plugins.x) }
_PLUGIN_ID_RE = re.compile(r"""\bid\s*\(?\s*['"]([A-Za-z0-9_.\-]+)['"]""")
_PLUGIN_KOTLIN_RE = re.compile(r"""\bkotlin\s*\(\s*['"]([A-Za-z0-9_.\-]+)['"]\s*\)""")
_PLUGIN_ALIAS_RE = re.compile(r"\balias\s*\(\s*libs\.plugins\.([A-Za-z0-9_.]+)\s*\)")


def _plugins_block(text: str) -> str:
    """Text of every top-level `plugins { ... }` block (brace-matched)."""
    chunks = []
    for m in re.finditer(r"(?m)^\s*plugins\s*\{", text):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        chunks.append(text[m.end():i - 1])
    return "\n".join(chunks)


def parse_gradle_plugins(path: str, text: str,
                         plugin_catalog: dict[str, str] | None = None) -> list[RawDetection]:
    plugin_catalog = plugin_catalog or {}
    block = _plugins_block(text)
    ids: list[str] = [m.group(1) for m in _PLUGIN_ID_RE.finditer(block)]
    ids += [f"org.jetbrains.kotlin.{m.group(1)}" for m in _PLUGIN_KOTLIN_RE.finditer(block)]
    for m in _PLUGIN_ALIAS_RE.finditer(block):
        alias = m.group(1)
        pid = plugin_catalog.get(alias) or plugin_catalog.get(alias.replace(".", "-"))
        if pid:
            ids.append(pid)  # unresolved alias -> nothing fabricated
    out: list[RawDetection] = []
    for pid in dict.fromkeys(ids):
        out.append(RawDetection(
            ecosystem=PLUGIN_ECO, package=pid, node_id=None,
            evidence_type="dependency_manifest", file_path=path,
            description=f"Gradle plugin {pid} applied in {path.rsplit('/', 1)[-1]}",
            detection_status="declared", rule="java.gradle_plugin", direct=True,
        ))
    return out


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
