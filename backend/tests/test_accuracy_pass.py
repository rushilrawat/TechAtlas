"""Guards for the Nov 2026 accuracy pass: facts that were wrong must stay fixed, and the
validator's semantic rules must keep catching the kinds of mistakes that slipped in."""
from __future__ import annotations

import json
from pathlib import Path

import validate_dataset as vd

from app.graph_service import GraphService
from app.scanner.manifest_parsers import java, python as pyparser
from app.scanner.technology_matcher import TechnologyMatcher

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed"


def _seed(name):
    return json.loads((SEED / name).read_text(encoding="utf-8"))


def _edges():
    return {(e["source"], e["target"], e["relationship_type"]) for e in _seed("edges.json")}


def _nodes():
    return {n["id"]: n for n in _seed("technologies.json") + _seed("concepts.json")}


# ---- data facts ---------------------------------------------------------------------

def test_implementation_languages_are_right():
    edges = _edges()
    for tech, lang in [("vite", "typescript"), ("vue", "typescript"), ("nmap", "cpp")]:
        assert (f"technology:{tech}", f"technology:{lang}", "written_in") in edges, tech
    assert ("technology:vue", "technology:javascript", "written_in") not in edges
    assert ("technology:nmap", "technology:c", "written_in") not in edges


def test_optional_runtimes_are_not_hard_dependencies():
    edges = _edges()
    # CUDA is optional for PyTorch and TensorFlow; Kubernetes accepts any CRI runtime.
    assert ("technology:pytorch", "technology:cuda", "depends_on") not in edges
    assert ("technology:tensorflow", "technology:cuda", "depends_on") not in edges
    assert ("technology:kubernetes", "technology:containerd", "depends_on") not in edges


def test_no_edge_says_threat_modeling_is_a_detection_tool():
    for src, tgt, _ in _edges():
        if tgt == "concept:threat-modeling":
            assert src not in {"technology:falco", "technology:trivy", "technology:snort"}


def test_node_facts():
    nodes = _nodes()
    assert nodes["technology:esp32"]["node_subtype"] == "platform"
    assert nodes["technology:opengl"]["lifecycle_status"] == "mature"
    assert nodes["technology:cuckoo-sandbox"]["lifecycle_status"] == "deprecated"
    assert "Rocq" in nodes["technology:coq"]["name"]
    assert "Coq" in nodes["technology:coq"]["aliases"]
    assert nodes["concept:embodied-ai"]["wikipedia_title"] != "Embodied cognition"
    assert nodes["concept:database-sharding"]["name"] == "Database Sharding"


def test_deprecated_technologies_are_not_taught_in_roles():
    dead = {n["slug"] for n in _nodes().values()
            if n.get("lifecycle_status") in ("deprecated", "historical")}
    for role in _seed("roles.json"):
        for stage in role["stages"]:
            assert not dead & set(stage["nodes"]), (role["id"], dead & set(stage["nodes"]))


def test_accuracy_script_is_idempotent(capsys):
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "accuracy_pass", ROOT / "scripts" / "expand" / "accuracy_pass.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    before = {p.name: p.read_bytes() for p in SEED.glob("*.json")}
    mod.main()
    after = {p.name: p.read_bytes() for p in SEED.glob("*.json")}
    assert before == after, "accuracy_pass.py would change the committed seed data"
    assert capsys.readouterr().out.startswith("0 change(s)")


# ---- validator semantic rules -------------------------------------------------------

def _n(nid, domain="domain:d", **kw):
    kind, slug = nid.split(":", 1)
    return {"id": nid, "slug": slug, "name": slug, "node_type": kind, "primary_domain": domain, **kw}


def _report(nodes, edges):
    r = vd.Report()
    vd.validate_semantics({"nodes": nodes, "edges": [
        {"source": s, "target": t, "relationship_type": rt} for s, rt, t in edges]}, r)
    return r.errors


def test_defensive_tool_cannot_support_an_attack():
    nodes = [_n("domain:d"), _n("technology:cdn", "domain:d"), _n("concept:ddos-attack")]
    assert _report(nodes, [("technology:cdn", "supports", "concept:ddos-attack")])
    assert not _report(nodes, [("technology:cdn", "related_to", "concept:ddos-attack")])


def test_offensive_tool_may_support_an_attack():
    nodes = [_n("domain:offensive-security"), _n("technology:hashcat", "domain:offensive-security"),
             _n("concept:brute-force-attack")]
    assert not _report(nodes, [("technology:hashcat", "supports", "concept:brute-force-attack")])


def test_directional_edges_cannot_run_both_ways():
    nodes = [_n("domain:d"), _n("technology:a"), _n("technology:b")]
    assert _report(nodes, [("technology:a", "built_on", "technology:b"),
                           ("technology:b", "built_on", "technology:a")])


def test_alternative_cannot_also_be_a_foundation():
    nodes = [_n("domain:d"), _n("technology:a"), _n("technology:b"), _n("concept:c")]
    assert _report(nodes, [("technology:a", "built_on", "technology:b"),
                           ("technology:a", "alternative_to", "technology:b")])
    assert _report(nodes, [("technology:a", "alternative_to", "concept:c")])


def test_committed_dataset_passes_semantic_rules():
    graph = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
    r = vd.Report()
    vd.validate_semantics(graph, r)
    assert r.errors == []


# ---- scanner ------------------------------------------------------------------------

def _matcher():
    return TechnologyMatcher(GraphService().all_nodes())


def test_huggingface_hub_is_not_transformers():
    assert _matcher().match_package("pypi", "huggingface-hub") is None
    assert _matcher().match_package("pypi", "transformers") == "technology:huggingface-transformers"


def test_gradle_plugins_map_to_platforms():
    m = _matcher()
    assert m.match_package("gradle-plugin", "com.android.application") == "technology:android-sdk"
    assert m.match_package("gradle-plugin", "org.jetbrains.kotlin.multiplatform") == "technology:kotlin-multiplatform"
    assert m.match_package("gradle-plugin", "com.google.gms.google-services") == "technology:firebase"
    assert m.match_package("gradle-plugin", "com.diffplug.spotless") is None
    assert m.match_package("maven", "com.google.firebase:firebase-analytics") == "technology:firebase"


def test_gradle_plugins_block_only():
    text = '''
// id("com.android.application") in a comment outside the block
plugins {
    id("org.jetbrains.kotlin.jvm") version "2.1.0"
    kotlin("multiplatform")
    alias(libs.plugins.gms)
    alias(libs.plugins.unknown.thing)
}
val s = "id(\\"com.android.library\\")"
'''
    ids = [d.package for d in java.parse_gradle_plugins(
        "build.gradle.kts", text, {"gms": "com.google.gms.google-services"})]
    assert ids == ["org.jetbrains.kotlin.jvm", "org.jetbrains.kotlin.multiplatform",
                   "com.google.gms.google-services"]


def test_version_catalog_declares_libraries_and_plugins():
    toml = '''
[libraries]
junit = { module = "junit:junit", version = "4.13.2" }
ui = { group = "androidx.compose.ui", name = "ui" }
[plugins]
android-application = { id = "com.android.application", version = "8.7.0" }
'''
    got = {(d.ecosystem, d.package) for d in java.parse_version_catalog("gradle/libs.versions.toml", toml)}
    assert got == {("maven", "junit:junit"), ("maven", "androidx.compose.ui:ui"),
                   ("gradle-plugin", "com.android.application")}


def test_setup_py_reads_requirements_without_running_code():
    text = '''
import os
os.system("echo should never run")
_deps = ["numpy>=1.17", "python>=3.9", "torch"]
setup(
    name="x",
    description="Not a requirement at all",
    install_requires=["requests>=2"],
    extras_require={"test": ["pytest"]},
)
'''
    got = [d.package for d in pyparser.parse_setup_py("setup.py", text)]
    assert sorted(got) == ["numpy", "pytest", "requests", "torch"]


def test_setup_py_syntax_error_is_empty():
    assert pyparser.parse_setup_py("setup.py", "def broken(:") == []
