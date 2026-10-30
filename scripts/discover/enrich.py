"""Enrich surviving candidates into schema-shaped proposals — verifiable facts only.

Fills name / wikidata_id / wikipedia_title / official_url and a schema-valid slug/id
from the source. Sets node_subtype only when the source class mapped cleanly; otherwise
leaves it null and flags it. NEVER sets primary_domain or edges — those are human
judgment and are left blank with an explicit review marker (requirement 3.3).

Descriptions taken from a source are drafts (trimmed to the schema's 280-char max) and
are always flagged for human verification (requirement 3.4).
"""
from __future__ import annotations

from dataclasses import dataclass

from .dedup import slugify
from .sources.common import RawCandidate

_DESC_MAX = 280


@dataclass
class Proposal:
    status: str  # "NEEDS_REVIEW" | "APPROVED"
    node: dict
    edges: list[dict]
    review: dict
    provenance: dict


def _draft_description(desc: str | None) -> str:
    if not desc:
        return ""
    desc = desc.strip()
    if len(desc) > _DESC_MAX:
        desc = desc[: _DESC_MAX - 1].rstrip() + "…"
    return desc


def enrich_one(c: RawCandidate) -> Proposal | None:
    slug = slugify(c.name)
    if slug is None:
        return None  # dedup should have caught this; belt-and-suspenders

    needs: list[str] = []

    node: dict = {
        "id": f"technology:{slug}",
        "slug": slug,
        "name": c.name,
        "node_type": "technology",
        "node_subtype": c.subtype_hint,  # may be None
        "primary_domain": None,  # HUMAN decides (never auto-assigned)
        "short_description": _draft_description(c.description),
    }
    # Optional source-backed identity fields, only when present.
    if c.official_url:
        node["official_url"] = c.official_url
    if c.wikipedia_title:
        node["wikipedia_title"] = c.wikipedia_title
    if c.wikidata_id:
        node["wikidata_id"] = c.wikidata_id

    if node["node_subtype"] is None:
        needs.append("node_subtype")
    needs.append("primary_domain")  # always human-decided
    needs.append("edges")  # always human-decided
    if node["short_description"]:
        needs.append("verify_description")
    else:
        needs.append("short_description")

    return Proposal(
        status="NEEDS_REVIEW",
        node=node,
        edges=[],
        review={
            "needs": needs,
            "subtype_confident": c.subtype_hint is not None,
        },
        provenance={
            "source": c.source,
            "source_ref": c.source_ref,
            "retrieved_at": c.retrieved_at,
            "description_source": f"{c.source}:description" if c.description else None,
            **({"wikidata_subtype": c.extra.get("wikidata_subtype")} if c.extra else {}),
        },
    )


def enrich(candidates: list[RawCandidate]) -> list[Proposal]:
    out: list[Proposal] = []
    for c in candidates:
        p = enrich_one(c)
        if p is not None:
            out.append(p)
    return out
