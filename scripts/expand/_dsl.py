"""Compact authoring helpers for the 2,000-node expansion (atlas_2000*.py).

Each node is written on one line with its typed edges inline, as a space-separated string
of ``code:slug`` tokens. Slugs are unique across node types (the validator enforces it), so
an edge target is resolved from its bare slug. Every node also gets its belongs_to_domain
spoke automatically.

Edge codes:
  r  related_to          i  implements        u  used_for        w  written_in
  b  built_on            d  depends_on        ig integrates_with a  alternative_to
  cw commonly_used_with  s  supports          p  part_of_ecosystem
  en enables

wiki: an exact Wikipedia article title, "=" for "same as the name", or None when no article
is known for certain (better no summary than the wrong one).
"""
from __future__ import annotations

CODES = {
    "r": "related_to", "i": "implements", "u": "used_for", "w": "written_in", "b": "built_on",
    "d": "depends_on", "ig": "integrates_with", "a": "alternative_to",
    "cw": "commonly_used_with", "s": "supports", "p": "part_of_ecosystem", "en": "enables",
}


def _wiki(node: dict, wiki: str | None) -> None:
    if wiki:
        node["wikipedia_title"] = node["name"] if wiki == "=" else wiki


def T(slug, name, subtype, domain, desc, wiki=None, edges="", life="active", aliases=None,
      url=None):
    """A technology. `domain` is the domain slug without the 'domain:' prefix."""
    node = {"id": f"technology:{slug}", "slug": slug, "name": name, "node_type": "technology",
            "node_subtype": subtype, "primary_domain": f"domain:{domain}",
            "short_description": desc}
    _wiki(node, wiki)
    if url:
        node["official_url"] = url
    if aliases:
        node["aliases"] = aliases
    node["lifecycle_status"] = life
    node["_edges"] = edges
    return node


def K(slug, name, domain, desc, wiki=None, edges="", imp=0.4, aliases=None, subtype=None,
      life=None):
    """A concept (term, technique, standard, protocol, methodology...)."""
    node = {"id": f"concept:{slug}", "slug": slug, "name": name, "node_type": "concept",
            "primary_domain": f"domain:{domain}", "short_description": desc, "importance": imp}
    if subtype:
        node["node_subtype"] = subtype
    _wiki(node, wiki)
    if aliases:
        node["aliases"] = aliases
    if life:
        node["lifecycle_status"] = life
    node["_edges"] = edges
    return node


def X(src, code, tgt):
    """An extra edge between two slugs (used to wire new nodes into existing ones)."""
    return (src, code, tgt)
