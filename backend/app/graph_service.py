"""In-memory graph service.

Loads the curated dataset (data/graph.json) and layout snapshot (data/layout.json),
builds adjacency and search indexes once at startup, and answers API queries.

Serving from the validated JSON keeps Phase 0 operationally simple (spec §8.7). The
service boundary is deliberately narrow so a PostgreSQL-backed implementation can
replace it later without changing the API layer.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from .models import (
    DomainSummary,
    GraphEdge,
    GraphNode,
    NeighborEdge,
    NodeDetail,
    SearchResult,
)

# Share the exact sizing formula with the offline layout generator so the radius the
# API serves matches what the overlap pass packed against (scripts/sizing.py, Task 1).
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
from sizing import load_popularity, node_radius  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

SYMMETRIC_TYPES = {"related_to", "integrates_with", "alternative_to", "commonly_used_with"}

# Stable, color-blind-conscious palette per domain. Node type is ALSO conveyed by
# shape/subtype in the UI so color is never the sole signal (spec §14.2).
DOMAIN_COLORS: dict[str, str] = {
    "domain:software-engineering": "#8b9dc3",
    "domain:frontend": "#7aa2f7",
    "domain:backend": "#9ece6a",
    "domain:databases": "#e0af68",
    "domain:ai-ml": "#bb9af7",
    "domain:cloud-devops": "#7dcfff",
    "domain:security": "#f7768e",
    "domain:mobile": "#73daca",
    "domain:systems": "#ff9e64",
    "domain:testing-tooling": "#c0caf5",
    "domain:gamedev": "#ff75a0",
}
FALLBACK_COLOR = "#9aa5ce"

# Render size bands come from scripts/sizing.py (single source of truth, Task 1):
# SIZE_DOMAIN, SIZE_CONCEPT, SIZE_TECH are imported above.


class GraphService:
    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self._data_dir = data_dir
        self._load()

    def _load(self) -> None:
        dataset = json.loads((self._data_dir / "graph.json").read_text(encoding="utf-8"))
        self.version: str = dataset["version"]
        self._raw_nodes: dict[str, dict] = {n["id"]: n for n in dataset["nodes"]}
        self._raw_edges: list[dict] = dataset["edges"]

        layout_path = self._data_dir / "layout.json"
        if layout_path.exists():
            layout = json.loads(layout_path.read_text(encoding="utf-8"))
            self.layout_version: str | None = layout.get("layout_version")
            self._coords: dict[str, dict] = layout.get("coordinates", {})
        else:
            self.layout_version = None
            self._coords = {}

        # adjacency: node id -> list of (relationship_type, direction, other_id)
        self._adj: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
        self._edges: list[GraphEdge] = []
        for i, e in enumerate(self._raw_edges):
            s, t, r = e["source"], e["target"], e["relationship_type"]
            self._edges.append(
                GraphEdge(
                    id=f"e{i}",
                    source=s,
                    target=t,
                    relationship_type=r,
                    weight=e.get("weight"),
                )
            )
            if r in SYMMETRIC_TYPES:
                self._adj[s].append((r, "undirected", t))
                self._adj[t].append((r, "undirected", s))
            else:
                self._adj[s].append((r, "out", t))
                self._adj[t].append((r, "in", s))

        # degree, used for importance-aware tech sizing
        self._degree: dict[str, int] = defaultdict(int)
        for e in self._raw_edges:
            self._degree[e["source"]] += 1
            self._degree[e["target"]] += 1
        self._max_tech_degree = max(
            (self._degree[n["id"]] for n in self._raw_nodes.values()
             if n["node_type"] == "technology"),
            default=1,
        )

        # Phase 1D: sourced popularity scores (technology id -> 0..1), or {} if none.
        # Loaded via the shared loader so the backend sizes identically to the layout.
        self._popularity: dict[str, float] = load_popularity(
            self._data_dir / "popularity.json"
        )

    # ---- helpers -------------------------------------------------------------

    def _color(self, node: dict) -> str:
        return DOMAIN_COLORS.get(node.get("primary_domain", ""), FALLBACK_COLOR)

    def _popularity_of(self, node: dict) -> float | None:
        if node["node_type"] != "technology":
            return None
        return self._popularity.get(node["id"])

    def _size_basis(self, node: dict) -> str | None:
        """'popularity' | 'connectivity' for technologies; None for domain/concept."""
        if node["node_type"] != "technology":
            return None
        return "popularity" if node["id"] in self._popularity else "connectivity"

    def _size(self, node: dict) -> float:
        # Keep the served size consistent with size_basis. If this node has a sourced
        # popularity score, the authoritative size is the popularity-based radius —
        # even if the committed layout was generated without popularity (otherwise the
        # panel could say "sized by popularity" while serving a connectivity radius).
        # When there is NO popularity score, prefer the layout's radius (identical
        # formula, and it's what the overlap pass packed against); fall back to
        # computing it if no layout file is present.
        pop = self._popularity_of(node)
        if pop is None:
            coord = self._coords.get(node["id"])
            if coord and isinstance(coord.get("radius"), (int, float)):
                return float(coord["radius"])
        return node_radius(node, self._degree, self._max_tech_degree, pop)

    def _to_graph_node(self, node: dict) -> GraphNode:
        coord = self._coords.get(node["id"], {})
        return GraphNode(
            id=node["id"],
            slug=node["slug"],
            label=node["name"],
            node_type=node["node_type"],
            node_subtype=node.get("node_subtype"),
            primary_domain=node["primary_domain"],
            x=coord.get("x"),
            y=coord.get("y"),
            cluster=coord.get("cluster", node.get("primary_domain")),
            size=self._size(node),
            color=self._color(node),
            popularity=self._popularity_of(node),
            size_basis=self._size_basis(node),
        )

    def _resolve(self, slug_or_id: str) -> dict | None:
        if slug_or_id in self._raw_nodes:
            return self._raw_nodes[slug_or_id]
        for node in self._raw_nodes.values():
            if node["slug"] == slug_or_id:
                return node
        return None

    # ---- queries -------------------------------------------------------------

    def graph(self) -> tuple[list[GraphNode], list[GraphEdge]]:
        nodes = [self._to_graph_node(n) for n in self._raw_nodes.values()]
        return nodes, self._edges

    def all_nodes(self) -> list[dict]:
        """Raw node dicts (id, slug, name, node_type, package, repo, aliases, ...).

        Exposed read-only for the Repo X-Ray matcher so it can reuse the canonical
        package/repo/alias data instead of maintaining a second catalog (spec §9.1).
        """
        return list(self._raw_nodes.values())

    def has_node(self, node_id: str) -> bool:
        return node_id in self._raw_nodes

    def domains(self) -> list[DomainSummary]:
        counts: dict[str, int] = defaultdict(int)
        for n in self._raw_nodes.values():
            counts[n["primary_domain"]] += 1
        out = []
        for n in self._raw_nodes.values():
            if n["node_type"] != "domain":
                continue
            out.append(
                DomainSummary(
                    id=n["id"],
                    slug=n["slug"],
                    name=n["name"],
                    short_description=n["short_description"],
                    color=self._color(n),
                    node_count=counts[n["id"]],
                )
            )
        return sorted(out, key=lambda d: d.name)

    def node_detail(self, slug_or_id: str) -> NodeDetail | None:
        node = self._resolve(slug_or_id)
        if node is None:
            return None
        neighbors: list[NeighborEdge] = []
        for rtype, direction, other_id in self._adj.get(node["id"], []):
            other = self._raw_nodes.get(other_id)
            if other is None:
                continue
            neighbors.append(
                NeighborEdge(
                    relationship_type=rtype,
                    direction=direction,
                    node=self._to_graph_node(other),
                )
            )
        neighbors.sort(key=lambda n: (n.node.node_type, n.node.label))
        return NodeDetail(
            id=node["id"],
            slug=node["slug"],
            name=node["name"],
            node_type=node["node_type"],
            node_subtype=node.get("node_subtype"),
            primary_domain=node["primary_domain"],
            short_description=node["short_description"],
            long_description=node.get("long_description"),
            official_url=node.get("official_url"),
            documentation_url=node.get("documentation_url"),
            wikipedia_title=node.get("wikipedia_title"),
            wikidata_id=node.get("wikidata_id"),
            lifecycle_status=node.get("lifecycle_status", "active"),
            aliases=node.get("aliases", []),
            color=self._color(node),
            neighbors=neighbors,
            popularity=self._popularity_of(node),
            size_basis=self._size_basis(node),
        )

    def neighbors(self, slug_or_id: str) -> list[NeighborEdge] | None:
        detail = self.node_detail(slug_or_id)
        return detail.neighbors if detail else None

    def search(self, query: str, limit: int = 20) -> list[SearchResult]:
        q = query.strip().lower()
        if not q:
            return []
        results: list[tuple[int, SearchResult]] = []
        for node in self._raw_nodes.values():
            name = node["name"].lower()
            aliases = [a.lower() for a in node.get("aliases", [])]
            rank: int | None = None
            matched = ""
            if name == q or q in aliases:
                rank, matched = 0, "name" if name == q else "alias"
            elif name.startswith(q):
                rank, matched = 1, "name"
            elif any(a.startswith(q) for a in aliases):
                rank, matched = 2, "alias"
            elif q in name:
                rank, matched = 3, "substring"
            elif any(q in a for a in aliases):
                rank, matched = 4, "alias"
            if rank is not None:
                results.append(
                    (
                        rank,
                        SearchResult(
                            id=node["id"],
                            slug=node["slug"],
                            name=node["name"],
                            node_type=node["node_type"],
                            node_subtype=node.get("node_subtype"),
                            primary_domain=node["primary_domain"],
                            matched_on=matched,
                        ),
                    )
                )
        results.sort(key=lambda r: (r[0], r[1].name))
        return [r for _, r in results[:limit]]


@lru_cache(maxsize=1)
def get_graph_service() -> GraphService:
    return GraphService()
