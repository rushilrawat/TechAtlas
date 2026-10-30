#!/usr/bin/env python3
"""Shared helper for Phase 1B dataset-expansion batches.

Each batch module (frontend.py, backend.py, ...) defines curated NODES and EDGES
as plain Python dicts of REAL, hand-verified data, then calls apply_batch(). This
helper:

  - refuses to add a node id or (node_type, slug) that already exists,
  - refuses to add a duplicate edge (symmetric types deduped by unordered pair),
  - appends only new records to the data/seed/*.json fragments, preserving order,
  - writes JSON in the same 2-space-indented style as the existing fragments.

It never invents data — it only merges the curated literals the batch provides.
Re-running a batch is safe: already-present records are skipped.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SEED = ROOT / "data" / "seed"

SYMMETRIC_TYPES = {"related_to", "integrates_with", "alternative_to", "commonly_used_with"}


def _load(name: str) -> list[dict]:
    return json.loads((SEED / name).read_text(encoding="utf-8"))


def _write(name: str, data: list[dict]) -> None:
    (SEED / name).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def _edge_key(e: dict):
    s, t, r = e["source"], e["target"], e["relationship_type"]
    if r in SYMMETRIC_TYPES:
        return (r, frozenset((s, t)))
    return (r, s, t)


# Endpoint rules mirrored from scripts/validate_dataset.py so a batch fails fast,
# in-memory, BEFORE anything is written (no stale invalid edge can persist).
ENDPOINT_RULES: dict[str, tuple[set | None, set | None]] = {
    "belongs_to_domain": ({"technology", "concept"}, {"domain"}),
    "has_subdomain": ({"domain"}, {"domain"}),
    "implements": ({"technology"}, {"concept"}),
    "used_for": ({"technology"}, {"concept", "domain"}),
    "supports": ({"technology"}, {"concept"}),
    "enables": ({"concept", "technology"}, {"concept"}),
}


def _precheck(all_nodes_by_id: dict[str, dict], new_edges: list[dict]) -> list[str]:
    """Return problems with the new edges, checked against the merged node set."""
    problems: list[str] = []
    for e in new_edges:
        s, t, r = e["source"], e["target"], e["relationship_type"]
        if s not in all_nodes_by_id:
            problems.append(f"edge source missing: {s} -{r}-> {t}")
            continue
        if t not in all_nodes_by_id:
            problems.append(f"edge target missing: {s} -{r}-> {t}")
            continue
        if s == t:
            problems.append(f"self-edge: {s} -{r}-> {t}")
        rule = ENDPOINT_RULES.get(r)
        if rule:
            asrc, atgt = rule
            st = all_nodes_by_id[s]["node_type"]
            tt = all_nodes_by_id[t]["node_type"]
            if asrc and st not in asrc:
                problems.append(f"{r}: source {s} is '{st}', expected {sorted(asrc)}")
            if atgt and tt not in atgt:
                problems.append(f"{r}: target {t} is '{tt}', expected {sorted(atgt)}")
        if r == "written_in" and all_nodes_by_id[t].get("node_subtype") != "programming_language":
            problems.append(f"written_in: target {t} must be a programming_language")
    return problems


def apply_batch(
    batch_name: str,
    concepts: list[dict] | None = None,
    technologies: list[dict] | None = None,
    edges: list[dict] | None = None,
) -> None:
    concepts = concepts or []
    technologies = technologies or []
    edges = edges or []

    added = {"concept": 0, "technology": 0, "edge": 0}

    # Build the merged node-id map first (existing + all curated new nodes) and
    # precheck every new edge against it. Fail fast, in-memory, before writing —
    # so an invalid edge can never be persisted to the fragment files.
    merged_by_id: dict[str, dict] = {}
    for fragment in ("domains.json", "concepts.json", "technologies.json"):
        for n in _load(fragment):
            merged_by_id[n["id"]] = n
    for n in concepts + technologies:
        merged_by_id[n["id"]] = n

    problems = _precheck(merged_by_id, edges)
    if problems:
        raise SystemExit(
            f"[{batch_name}] REFUSED to write — {len(problems)} edge problem(s):\n  "
            + "\n  ".join(problems)
        )

    # --- nodes ---
    for fragment, new_nodes, kind in (
        ("concepts.json", concepts, "concept"),
        ("technologies.json", technologies, "technology"),
    ):
        existing = _load(fragment)
        by_id = {n["id"] for n in existing}
        by_type_slug = {(n["node_type"], n["slug"]) for n in existing}
        for node in new_nodes:
            key = (node["node_type"], node["slug"])
            if node["id"] in by_id or key in by_type_slug:
                continue
            existing.append(node)
            by_id.add(node["id"])
            by_type_slug.add(key)
            added[kind] += 1
        _write(fragment, existing)

    # --- edges ---
    existing_edges = _load("edges.json")
    seen = {_edge_key(e) for e in existing_edges}
    for e in edges:
        k = _edge_key(e)
        if k in seen:
            continue
        existing_edges.append(e)
        seen.add(k)
        added["edge"] += 1
    _write("edges.json", existing_edges)

    print(
        f"[{batch_name}] added "
        f"{added['concept']} concepts, {added['technology']} technologies, "
        f"{added['edge']} edges"
    )
