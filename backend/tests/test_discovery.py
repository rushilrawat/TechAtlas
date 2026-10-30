"""Tests for the discovery-assist tool (scripts/discover/*).

No live network: a fake client returns a recorded SPARQL fixture. Covers the Wikidata
source parse, dedup against the graph + self-collisions, enrichment (verifiable facts
only; never domain/edges), and promotion through a stubbed _apply.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from discover import enrich as enrich_mod  # noqa: E402
from discover.dedup import GraphIndex, dedup, normalize, slugify  # noqa: E402
from discover.sources import wikidata  # noqa: E402
from discover.sources.common import RawCandidate  # noqa: E402

# ---- fakes ------------------------------------------------------------------

class FakeResp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeClient:
    def __init__(self, status_code: int = 200, payload: dict | None = None, raise_error=False):
        self.status_code = status_code
        self.payload = payload or {"results": {"bindings": []}}
        self.raise_error = raise_error
        self.calls = 0

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls += 1
        if self.raise_error:
            raise RuntimeError("network down")
        return FakeResp(self.status_code, self.payload)


def _sparql_fixture() -> dict:
    """A minimal SPARQL JSON result with two entities."""
    return {
        "results": {
            "bindings": [
                {
                    "item": {"value": "http://www.wikidata.org/entity/Q98376046"},
                    "itemLabel": {"value": "Deno"},
                    "itemDescription": {"value": "secure runtime for JavaScript and TypeScript"},
                    "website": {"value": "https://deno.com"},
                    "article": {"value": "https://en.wikipedia.org/wiki/Deno_(software)"},
                },
                {
                    # label == QID (no real label) -> must be skipped
                    "item": {"value": "http://www.wikidata.org/entity/Q99999999"},
                    "itemLabel": {"value": "Q99999999"},
                },
            ]
        }
    }


# ---- wikidata source --------------------------------------------------------

def test_wikidata_parses_structured_facts():
    client = FakeClient(payload=_sparql_fixture())
    out = wikidata.fetch(client=client, classes=["Q9143"], limit_per_class=10)
    assert len(out) == 1  # the label==QID row is skipped
    c = out[0]
    assert c.name == "Deno"
    assert c.wikidata_id == "Q98376046"
    assert c.official_url == "https://deno.com"
    assert c.wikipedia_title == "Deno (software)"
    assert c.subtype_hint == "programming_language"  # Q9143 maps here
    assert c.source == "wikidata"


def test_wikidata_error_returns_empty():
    assert wikidata.fetch(client=FakeClient(raise_error=True), classes=["Q9143"]) == []
    assert wikidata.fetch(client=FakeClient(status_code=500), classes=["Q9143"]) == []


def test_wikidata_unmapped_class_is_skipped():
    client = FakeClient(payload=_sparql_fixture())
    assert wikidata.fetch(client=client, classes=["Q0000"]) == []
    assert client.calls == 0  # nothing queried for an unmapped class


# ---- slug / normalize -------------------------------------------------------

@pytest.mark.parametrize(
    "name,expected",
    [
        ("Deno", "deno"),
        ("Node.js", "node-js"),
        ("C++", "cplusplus"),
        ("C#", "csharp"),
        ("Vue.js 3", "vue-js-3"),
    ],
)
def test_slugify(name, expected):
    assert slugify(name) == expected


def test_normalize_matches_validator_rule():
    # keeps + and #, lowercases, drops spaces/punctuation
    assert normalize("C++") == "c++"
    assert normalize("C#") == "c#"
    assert normalize("Node.js") == "nodejs"


# ---- dedup ------------------------------------------------------------------

def _index() -> GraphIndex:
    return GraphIndex(
        ids={"technology:react"},
        type_slugs={("technology", "react")},
        wikidata_ids={"Q19399674"},
        norm_names={"react", "vuejs"},
    )


def _raw(name, qid=None):
    return RawCandidate(
        name=name, source="wikidata", source_ref="x", retrieved_at="t", wikidata_id=qid
    )


def test_dedup_drops_existing_slug_name_and_qid():
    idx = _index()
    res = dedup(
        [
            _raw("React"),  # name + slug collide
            _raw("Vue.js"),  # normalized name collides ("vuejs")
            _raw("Svelte", qid="Q19399674"),  # qid collides
            _raw("Deno", qid="Q98376046"),  # unique -> kept
        ],
        idx,
    )
    kept = {c.name for c in res.kept}
    assert kept == {"Deno"}
    assert len(res.dropped) == 3


def test_dedup_collapses_self_collisions():
    idx = GraphIndex(set(), set(), set(), set())
    res = dedup([_raw("Deno"), _raw("Deno")], idx)
    assert len(res.kept) == 1
    assert len(res.dropped) == 1


def test_dedup_drops_unslugglable():
    idx = GraphIndex(set(), set(), set(), set())
    res = dedup([_raw("***")], idx)
    assert res.kept == []
    assert "slug" in res.dropped[0][1]


# ---- enrich -----------------------------------------------------------------

def test_enrich_fills_only_verifiable_facts_and_flags_the_rest():
    c = RawCandidate(
        name="Deno", source="wikidata", source_ref="https://www.wikidata.org/wiki/Q98376046",
        retrieved_at="t", wikidata_id="Q98376046", wikipedia_title="Deno (software)",
        official_url="https://deno.com", description="secure runtime", subtype_hint="runtime",
        extra={"wikidata_class": "runtime"},
    )
    [p] = enrich_mod.enrich([c])
    assert p.status == "NEEDS_REVIEW"
    assert p.node["id"] == "technology:deno"
    assert p.node["node_subtype"] == "runtime"
    assert p.node["wikidata_id"] == "Q98376046"
    assert p.node["official_url"] == "https://deno.com"
    # judgment fields are NEVER auto-filled
    assert p.node["primary_domain"] is None
    assert p.edges == []
    assert "primary_domain" in p.review["needs"]
    assert "edges" in p.review["needs"]
    assert p.provenance["source_ref"].endswith("Q98376046")


def test_enrich_flags_missing_subtype():
    c = RawCandidate(name="Mystery", source="wikidata", source_ref="x", retrieved_at="t",
                     subtype_hint=None)
    [p] = enrich_mod.enrich([c])
    assert p.node["node_subtype"] is None
    assert "node_subtype" in p.review["needs"]
    assert p.review["subtype_confident"] is False


def test_enrich_truncates_long_description():
    long = "x" * 400
    c = RawCandidate(name="Thing", source="wikidata", source_ref="x", retrieved_at="t",
                     description=long, subtype_hint="library")
    [p] = enrich_mod.enrich([c])
    assert len(p.node["short_description"]) <= 280


# ---- promote (stubbed _apply) ----------------------------------------------

def _write_candidates(tmp_path, candidates):
    d = tmp_path / "discovery"
    d.mkdir()
    f = d / "candidates.json"
    f.write_text(json.dumps({"candidates": candidates}))
    return f


def _candidate(slug, status, domain, edges):
    return {
        "status": status,
        "node": {
            "id": f"technology:{slug}", "slug": slug, "name": slug.title(),
            "node_type": "technology", "node_subtype": "runtime",
            "primary_domain": domain, "short_description": "d",
        },
        "edges": edges,
        "review": {}, "provenance": {},
    }


def test_promote_selects_only_approved_and_complete(monkeypatch, tmp_path):
    from discover import promote as promote_mod

    edges = [{"source": "technology:x", "target": "domain:backend",
              "relationship_type": "belongs_to_domain"}]
    candidates = [
        _candidate("ready", "APPROVED", "domain:backend", edges),
        _candidate("notapproved", "NEEDS_REVIEW", "domain:backend", edges),
        _candidate("nodomain", "APPROVED", None, edges),
        _candidate("noedges", "APPROVED", "domain:backend", []),
    ]
    ready, refused = promote_mod.select(candidates, None)
    ready_slugs = {c["node"]["slug"] for c in ready}
    refused_slugs = {s for s, _ in refused}
    assert ready_slugs == {"ready"}
    assert refused_slugs == {"notapproved", "nodomain", "noedges"}


def test_promote_hands_ready_to_apply_batch(monkeypatch, tmp_path):
    from discover import promote as promote_mod

    captured = {}

    def fake_apply_batch(name, technologies=None, edges=None):
        captured["name"] = name
        captured["technologies"] = technologies
        captured["edges"] = edges

    # Inject a stub _apply module so nothing touches data/seed.
    import types

    stub = types.ModuleType("_apply")
    stub.apply_batch = fake_apply_batch
    monkeypatch.setitem(sys.modules, "_apply", stub)

    edges = [{"source": "technology:ready", "target": "domain:backend",
              "relationship_type": "belongs_to_domain"}]
    f = _write_candidates(tmp_path, [_candidate("ready", "APPROVED", "domain:backend", edges)])
    monkeypatch.setattr(promote_mod, "CANDIDATES", f)
    monkeypatch.setattr(sys, "argv", ["promote.py"])

    promote_mod.main()
    assert captured["name"] == "discovery"
    assert captured["technologies"][0]["slug"] == "ready"
    # null optional fields are stripped before writing
    assert "official_url" not in captured["technologies"][0]
    assert captured["edges"] == edges


# ---- optional registries pass -----------------------------------------------

def test_registries_proposes_only_reachable_watchlist_entries():
    from discover.sources import registries

    class RegClient:
        def get(self, url, headers=None, timeout=None):
            # Only honojs/hono "exists"; everything else 404s.
            if "honojs/hono" in url:
                return FakeResp(
                    200,
                    {"stargazers_count": 21000, "pushed_at": "2026-10-20T00:00:00Z"},
                )
            return FakeResp(404, {})

    out = registries.fetch(client=RegClient())
    names = {c.name for c in out}
    assert "Hono" in names
    # unreachable watchlist entries are not proposed
    assert all(c.subtype_hint is None for c in out)  # reviewer decides subtype
    assert all(c.source == "github" for c in out)


def test_registries_error_safe():
    from discover.sources import registries

    class Boom:
        def get(self, *a, **k):
            raise RuntimeError("down")

    # every entry errors -> no candidates, no raise
    assert registries.fetch(client=Boom()) == []


# ---- auto-ingest (scheduled, safe placement) --------------------------------

def _wikidata_client_for(class_qid: str, rows: list[dict]):
    """A fake client that returns `rows` only for the query mentioning class_qid."""

    class _C:
        def get(self, url, params=None, headers=None, timeout=None):
            q = (params or {}).get("query", "")
            if class_qid in q:
                return FakeResp(200, {"results": {"bindings": rows}})
            return FakeResp(200, {"results": {"bindings": []}})

    return _C()


def test_auto_ingest_places_node_with_deterministic_domain_and_single_edge():
    from discover import auto_ingest

    rows = [
        {
            "item": {"value": "http://www.wikidata.org/entity/Q111"},
            "itemLabel": {"value": "Hono"},
            "itemDescription": {"value": "edge web framework"},
            "article": {"value": "https://en.wikipedia.org/wiki/Hono_(web_framework)"},
        }
    ]
    client = _wikidata_client_for("Q1330354", rows)
    nodes, edges, report = auto_ingest.build_candidates(
        client=client, classes=["Q1330354"], limit_per_class=10
    )
    assert len(nodes) == 1
    n = nodes[0]
    # web framework -> frontend (deterministic), identity from source, auto_added flag
    assert n["primary_domain"] == "domain:frontend"
    assert n["node_subtype"] == "framework"
    assert n["wikidata_id"] == "Q111"
    assert n["auto_added"] is True
    # exactly ONE edge, and it's the definitionally-true belongs_to_domain
    assert len(edges) == 1
    assert edges[0] == {
        "source": "technology:hono",
        "target": "domain:frontend",
        "relationship_type": "belongs_to_domain",
    }


def test_auto_ingest_never_invents_rich_edges():
    from discover import auto_ingest

    rows = [
        {
            "item": {"value": "http://www.wikidata.org/entity/Q7777777"},
            "itemLabel": {"value": "SomeNewLang"},
        }
    ]
    # programming language class -> software-engineering home
    client = _wikidata_client_for("Q9143", rows)
    nodes, edges, _ = auto_ingest.build_candidates(
        client=client, classes=["Q9143"], limit_per_class=10
    )
    assert nodes[0]["primary_domain"] == "domain:software-engineering"
    # only belongs_to_domain edges exist — no implements/alternative_to/etc.
    assert {e["relationship_type"] for e in edges} == {"belongs_to_domain"}


def test_auto_ingest_dedups_against_existing_graph():
    from discover import auto_ingest

    rows = [
        {
            "item": {"value": "http://www.wikidata.org/entity/Q111"},
            "itemLabel": {"value": "React"},  # already in the graph
        }
    ]
    client = _wikidata_client_for("Q1330354", rows)
    nodes, _edges, report = auto_ingest.build_candidates(
        client=client, classes=["Q1330354"], limit_per_class=10
    )
    assert nodes == []
    assert report["deduped_out"] == 1
