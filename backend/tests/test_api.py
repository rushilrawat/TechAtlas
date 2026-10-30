"""API tests for the TechAtlas backend."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_graph_payload_shape():
    r = client.get("/api/v1/graph")
    assert r.status_code == 200
    body = r.json()
    assert body["version"]
    assert len(body["nodes"]) > 100
    assert len(body["edges"]) > 200
    node = body["nodes"][0]
    # lightweight payload must NOT carry long descriptions
    assert "long_description" not in node
    assert {"id", "label", "node_type", "size", "color"} <= set(node)


def test_graph_nodes_have_coordinates():
    r = client.get("/api/v1/graph")
    nodes = r.json()["nodes"]
    assert all(n["x"] is not None and n["y"] is not None for n in nodes)


def test_domains_listed():
    r = client.get("/api/v1/domains")
    assert r.status_code == 200
    domains = r.json()
    assert len(domains) == 11
    assert all(d["node_count"] > 0 for d in domains)


def test_node_detail_by_slug_and_id():
    by_slug = client.get("/api/v1/nodes/python").json()
    by_id = client.get("/api/v1/nodes/technology:python").json()
    assert by_slug["id"] == "technology:python"
    assert by_id["id"] == "technology:python"
    assert by_slug["neighbors"]
    assert by_slug["wikipedia_title"] == "Python (programming language)"


def test_node_detail_neighbors_have_direction():
    detail = client.get("/api/v1/nodes/react").json()
    directions = {n["direction"] for n in detail["neighbors"]}
    assert directions <= {"in", "out", "undirected"}
    # Next.js is built_on React => React should see an incoming built_on edge
    labels = {
        (n["node"]["label"], n["relationship_type"], n["direction"])
        for n in detail["neighbors"]
    }
    assert ("Next.js", "built_on", "in") in labels


def test_node_not_found():
    r = client.get("/api/v1/nodes/does-not-exist")
    assert r.status_code == 404


def test_node_summary_field_is_optional_and_present_when_available(monkeypatch):
    """The summary field is additive/optional. We stub the summary service so CI
    never hits the network, and confirm the field round-trips when populated and is
    simply null when the service returns nothing."""
    from app import main
    from app.summary_service import NodeSummary

    class StubService:
        def __init__(self, result):
            self._result = result

        def get(self, slug, title):
            return self._result

    # Present case: populated summary attaches cleanly.
    present = NodeSummary(
        extract="Example extract.",
        source_url="https://en.wikipedia.org/wiki/Python_(programming_language)",
        lang="en",
        fetched_at="2026-10-29T00:00:00Z",
        license="CC BY-SA 4.0",
    )
    monkeypatch.setattr(main, "get_summary_service", lambda: StubService(present))
    body = client.get("/api/v1/nodes/python").json()
    assert body["summary"]["extract"] == "Example extract."
    assert body["summary"]["license"] == "CC BY-SA 4.0"

    # Absent case: service returns None -> field is null, response still valid.
    monkeypatch.setattr(main, "get_summary_service", lambda: StubService(None))
    body2 = client.get("/api/v1/nodes/python").json()
    assert body2["summary"] is None


def test_search_alias_and_partial():
    def first_id(q: str) -> str:
        return client.get("/api/v1/search", params={"q": q}).json()[0]["id"]

    assert first_id("postgres") == "technology:postgresql"
    assert first_id("js") == "technology:javascript"
    assert first_id("RAG") == "concept:retrieval-augmented-generation"
    auth = client.get("/api/v1/search", params={"q": "auth"}).json()
    assert any(r["id"] == "concept:authentication" for r in auth)


def test_search_empty():
    r = client.get("/api/v1/search", params={"q": "zzzznotathing"})
    assert r.status_code == 200
    assert r.json() == []


def test_graph_nodes_report_size_basis(monkeypatch):
    """Phase 1D: technology nodes carry size_basis + popularity. Without a
    popularity.json (the CI default), every technology falls back to connectivity
    and popularity is null; domains/concepts have no basis."""
    body = client.get("/api/v1/graph").json()
    by_type = {}
    for n in body["nodes"]:
        by_type.setdefault(n["node_type"], []).append(n)
    # technologies: basis present and (absent popularity data) == "connectivity", null score
    tech = by_type["technology"][0]
    assert tech["size_basis"] == "connectivity"
    assert tech["popularity"] is None
    # domains/concepts: no basis, no score
    assert by_type["domain"][0]["size_basis"] is None
    assert by_type["concept"][0]["size_basis"] is None


def test_size_basis_flips_to_popularity_when_scored(tmp_path, monkeypatch):
    """When a popularity.json provides a score for a technology, the service sizes it
    by adoption and reports size_basis='popularity'."""
    from app import graph_service

    # Build a GraphService whose data dir has a popularity.json with one scored tech.
    real = graph_service.get_graph_service()
    scored_id = next(
        n["id"] for n in real._raw_nodes.values() if n["node_type"] == "technology"
    )
    # Reuse the real data dir but inject a popularity map directly (unit-level).
    svc = graph_service.GraphService()
    svc._popularity = {scored_id: 0.95}
    node = svc._raw_nodes[scored_id]
    assert svc._size_basis(node) == "popularity"
    assert svc._popularity_of(node) == 0.95
    # an unscored technology still reports connectivity
    other = next(
        n for n in svc._raw_nodes.values()
        if n["node_type"] == "technology" and n["id"] != scored_id
    )
    assert svc._size_basis(other) == "connectivity"
    assert svc._popularity_of(other) is None
