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
