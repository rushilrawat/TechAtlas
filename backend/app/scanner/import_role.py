"""Assign a functional role label to a detected node (1.5A).

Roles drive the categorized summary in 1.5B (Frontend/Backend/Databases/...). Derived
deterministically from the node's subtype and primary domain — no guessing.
"""
from __future__ import annotations

_SUBTYPE_ROLE = {
    "programming_language": "programming_language",
    "framework": "framework",
    "library": "library",
    "database": "database",
    "runtime": "runtime",
    "platform": "platform",
    "cloud_service": "cloud_service",
    "developer_tool": "developer_tool",
    "engine": "engine",
    "sdk": "sdk",
    "operating_system": "operating_system",
    "standard": "standard",
}


def role_for_node(node_id: str, matcher) -> str:
    if node_id.startswith("concept:"):
        return "engineering_concept"
    node = getattr(matcher, "_node_by_id", {}).get(node_id)
    if node:
        sub = node.get("node_subtype")
        if sub in _SUBTYPE_ROLE:
            return _SUBTYPE_ROLE[sub]
    return "technology"
