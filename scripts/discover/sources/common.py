"""Shared types for discovery sources.

A RawCandidate is a loosely-structured observation about a possible technology from one
source. It carries only what the source actually provided (never guessed), plus
provenance. Enrichment later turns surviving candidates into schema-shaped proposals.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RawCandidate:
    name: str
    source: str  # e.g. "wikidata", "github"
    source_ref: str  # canonical URL/id for auditing
    retrieved_at: str  # ISO-8601 UTC
    # Optional source-provided facts (None when the source didn't supply them):
    wikidata_id: str | None = None
    wikipedia_title: str | None = None
    official_url: str | None = None
    description: str | None = None
    # A node_subtype the SOURCE's entity class maps to, when it maps cleanly; else None.
    subtype_hint: str | None = None
    # Free-form extra provenance (e.g. which entity class matched).
    extra: dict = field(default_factory=dict)
