"""Map detected packages to canonical TechAtlas node ids (1.5A).

Reuses the dataset's own `package` ({ecosystem,name}), `repo` ("owner/name"), and
`aliases` fields (Phase 1D) — the single canonical catalog, not a second one (spec
§9.1). Resolution priority (spec §9.3):
  1. exact ecosystem-qualified package match
  2. repo match (owner/name)
  3. exact normalized official name
  4. approved alias (dataset aliases + a small import-name alias file)
Never loose-substring (spec §9.2). Packages that resolve to nothing are unmapped.
"""
from __future__ import annotations

import json
from pathlib import Path

_ALIAS_FILE = Path(__file__).resolve().parent / "import_aliases.json"


def _norm(s: str) -> str:
    # Mirror the validator's rule enough for matching: lowercase, keep + and #.
    return "".join(ch for ch in s.lower() if ch.isalnum() or ch in "+#")


class TechnologyMatcher:
    def __init__(self, nodes: list[dict]) -> None:
        self._by_pkg: dict[tuple[str, str], str] = {}   # (ecosystem, lower name) -> id
        self._by_repo: dict[str, str] = {}              # lower "owner/name" -> id
        self._by_name: dict[str, str] = {}              # normalized name/alias -> id
        self._valid_ids: set[str] = set()
        self._node_by_id: dict[str, dict] = {}
        for n in nodes:
            nid = n["id"]
            self._valid_ids.add(nid)
            self._node_by_id[nid] = n
            pkg = n.get("package")
            if isinstance(pkg, dict) and pkg.get("ecosystem") and pkg.get("name"):
                self._by_pkg[(pkg["ecosystem"], pkg["name"].lower())] = nid
            repo = n.get("repo")
            if isinstance(repo, str) and "/" in repo:
                self._by_repo[repo.lower()] = nid
            for nm in [n.get("name", ""), *n.get("aliases", [])]:
                k = _norm(nm)
                if k:
                    self._by_name.setdefault(k, nid)
        # import-name alias file (ecosystem -> {importName: distributionName})
        try:
            self._import_aliases = json.loads(_ALIAS_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self._import_aliases = {}

    def has(self, node_id: str) -> bool:
        return node_id in self._valid_ids

    def match_package(self, ecosystem: str, package: str) -> str | None:
        """Resolve a package to a canonical node id, or None (unmapped)."""
        name = package.strip()
        if not name:
            return None
        lower = name.lower()

        # 0. import-name alias (e.g. sklearn -> scikit-learn) before anything else.
        eco_aliases = self._import_aliases.get(ecosystem, {})
        if isinstance(eco_aliases, dict) and name in eco_aliases:
            lower = str(eco_aliases[name]).lower()

        # 1. exact ecosystem-qualified package match
        hit = self._by_pkg.get((ecosystem, lower))
        if hit:
            return hit
        # 3. exact normalized official name / 4. approved alias
        hit = self._by_name.get(_norm(lower))
        if hit:
            return hit
        return None

    def match_repo(self, owner_name: str) -> str | None:
        return self._by_repo.get(owner_name.lower())
