"""Go (go modules) parsing (Phase 1.5C).

go.mod -> required modules (direct, with `// indirect` -> transitive), own-module and
stdlib excluded; go.sum -> presence evidence (always transitive, never a direct signal);
*.go import blocks -> confirmed external-module imports. Static only, literal-token only.

Stdlib heuristic (matches the "never fabricate" rule): an external module path always has
a dotted host as its first segment (e.g. github.com/..., golang.org/...). A first segment
with no dot is the Go standard library (fmt, net/http, encoding/json) or an internal
relative path and is skipped — so no external detection is ever synthesized for stdlib.
"""
from __future__ import annotations

import re

from .common import RawDetection

ECO = "go"

_MODULE_RE = re.compile(r"^\s*module\s+(\S+)", re.MULTILINE)


def own_module(go_mod_text: str) -> str | None:
    """Return the module path declared by a go.mod, for own-import exclusion."""
    m = _MODULE_RE.search(go_mod_text)
    return m.group(1) if m else None
# require lines: single `require path v1.2.3 [// indirect]` or inside a require ( ... ) block.
_REQUIRE_SINGLE_RE = re.compile(
    r"^\s*require\s+(\S+)\s+\S+(\s*//\s*indirect)?\s*$", re.MULTILINE
)
_REQUIRE_BLOCK_RE = re.compile(r"require\s*\((.*?)\)", re.DOTALL)
_BLOCK_LINE_RE = re.compile(r"^\s*(\S+)\s+\S+(\s*//\s*indirect)?\s*$", re.MULTILINE)


def _is_external_module(path: str, own_module: str | None) -> bool:
    if not path or path.startswith(("./", "../")):
        return False
    first = path.split("/", 1)[0]
    if "." not in first:
        return False  # stdlib (fmt, net/http, ...) or non-host internal path
    if own_module and (path == own_module or path.startswith(own_module + "/")):
        return False
    return True


def parse_go_mod(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    mm = _MODULE_RE.search(text)
    own = mm.group(1) if mm else None
    seen: set[str] = set()

    def emit(module: str, indirect: bool, line: int):
        if module in seen or not _is_external_module(module, own):
            return
        seen.add(module)
        out.append(RawDetection(
            ecosystem=ECO, package=module, node_id=None,
            evidence_type="dependency_manifest", file_path=path,
            description=f"{module} required in go.mod"
                        + (" (indirect)" if indirect else ""),
            detection_status="declared", rule="go.mod",
            direct=not indirect, line=line,
        ))

    # Single-line requires.
    for m in _REQUIRE_SINGLE_RE.finditer(text):
        emit(m.group(1), bool(m.group(2)), text.count("\n", 0, m.start()) + 1)
    # require ( ... ) blocks.
    for blk in _REQUIRE_BLOCK_RE.finditer(text):
        block_start = blk.start(1)
        for m in _BLOCK_LINE_RE.finditer(blk.group(1)):
            mod = m.group(1)
            if mod in ("require", "(", ")"):
                continue
            line = text.count("\n", 0, block_start + m.start()) + 1
            emit(mod, bool(m.group(2)), line)
    return out


_GOSUM_RE = re.compile(r"^(\S+)\s+v\S+\s+h1:", re.MULTILINE)


def parse_go_sum(path: str, text: str) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()
    for m in _GOSUM_RE.finditer(text):
        mod = m.group(1)
        if mod in seen or not _is_external_module(mod, None):
            continue
        seen.add(mod)
        out.append(RawDetection(
            ecosystem=ECO, package=mod, node_id=None,
            evidence_type="lockfile", file_path=path,
            description=f"{mod} present in go.sum",
            detection_status="declared", rule="go.sum", direct=False,
        ))
    return out


# import "path"  OR  import ( "path"\n "path2" )
_IMPORT_BLOCK_RE = re.compile(r"import\s*\((.*?)\)", re.DOTALL)
_IMPORT_SINGLE_RE = re.compile(r'^\s*import\s+(?:[A-Za-z0-9_.]+\s+)?"([^"]+)"', re.MULTILINE)
_QUOTED_RE = re.compile(r'"([^"]+)"')


def parse_source_imports(path: str, text: str,
                         go_own_module: str | None = None) -> list[RawDetection]:
    out: list[RawDetection] = []
    seen: set[str] = set()

    def emit(mod: str, line: int):
        if mod in seen or not _is_external_module(mod, go_own_module):
            return
        seen.add(mod)
        out.append(RawDetection(
            ecosystem=ECO, package=mod, node_id=None,
            evidence_type="source_import", file_path=path,
            description=f"import of '{mod}' in Go source",
            detection_status="confirmed", rule="go.source_import", line=line,
        ))

    for blk in _IMPORT_BLOCK_RE.finditer(text):
        block_start = blk.start(1)
        for m in _QUOTED_RE.finditer(blk.group(1)):
            line = text.count("\n", 0, block_start + m.start()) + 1
            emit(m.group(1), line)
    for m in _IMPORT_SINGLE_RE.finditer(text):
        emit(m.group(1), text.count("\n", 0, m.start()) + 1)
    return out
