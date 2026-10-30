"""Deduplicate discovered candidates against the existing graph and each other.

A candidate is dropped when its proposed id, (node_type, slug), wikidata_id, or any
normalized name/alias already exists in the dataset (requirement 2.1). Normalization
matches the validator's rule exactly so matches are consistent (requirement 2.2).
Candidate-vs-candidate collisions collapse to the first seen (requirement 2.3).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .sources.common import RawCandidate

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET = ROOT / "data" / "graph.json"


def normalize(text: str) -> str:
    """Same rule as scripts/validate_dataset.py::_normalize — lowercase, keep + and #."""
    return "".join(ch for ch in text.lower() if ch.isalnum() or ch in "+#")


def slugify(name: str) -> str | None:
    """Derive a schema-valid slug (^[a-z0-9][a-z0-9-]*$) or None if impossible."""
    import re

    s = name.lower().strip()
    s = s.replace("+", "plus").replace("#", "sharp").replace(".", "-")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    if not s or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", s):
        return None
    return s


@dataclass(frozen=True)
class GraphIndex:
    ids: set[str]
    type_slugs: set[tuple[str, str]]
    wikidata_ids: set[str]
    norm_names: set[str]

    @classmethod
    def from_dataset(cls, path: Path = DATASET) -> GraphIndex:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        ids: set[str] = set()
        type_slugs: set[tuple[str, str]] = set()
        wikidata_ids: set[str] = set()
        norm_names: set[str] = set()
        for n in data.get("nodes", []):
            ids.add(n["id"])
            type_slugs.add((n["node_type"], n["slug"]))
            if n.get("wikidata_id"):
                wikidata_ids.add(n["wikidata_id"])
            for alias in [n.get("name", ""), *n.get("aliases", [])]:
                norm = normalize(alias)
                if norm:
                    norm_names.add(norm)
        return cls(ids, type_slugs, wikidata_ids, norm_names)


@dataclass
class DedupResult:
    kept: list[RawCandidate]
    dropped: list[tuple[RawCandidate, str]]  # (candidate, reason)


def dedup(candidates: list[RawCandidate], index: GraphIndex) -> DedupResult:
    kept: list[RawCandidate] = []
    dropped: list[tuple[RawCandidate, str]] = []

    seen_slugs: set[str] = set()
    seen_norm: set[str] = set()
    seen_qids: set[str] = set()

    for c in candidates:
        slug = slugify(c.name)
        if slug is None:
            dropped.append((c, "could not derive a schema-valid slug"))
            continue
        norm = normalize(c.name)

        # Against the existing graph.
        if f"technology:{slug}" in index.ids or ("technology", slug) in index.type_slugs:
            dropped.append((c, f"slug '{slug}' already in graph"))
            continue
        if c.wikidata_id and c.wikidata_id in index.wikidata_ids:
            dropped.append((c, f"wikidata_id {c.wikidata_id} already in graph"))
            continue
        if norm and norm in index.norm_names:
            dropped.append((c, f"name '{c.name}' already in graph"))
            continue

        # Against earlier candidates in this batch.
        if slug in seen_slugs or (norm and norm in seen_norm) or (
            c.wikidata_id and c.wikidata_id in seen_qids
        ):
            dropped.append((c, "duplicate of another candidate in this run"))
            continue

        seen_slugs.add(slug)
        if norm:
            seen_norm.add(norm)
        if c.wikidata_id:
            seen_qids.add(c.wikidata_id)
        kept.append(c)

    return DedupResult(kept=kept, dropped=dropped)
