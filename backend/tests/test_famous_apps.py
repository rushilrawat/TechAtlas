"""Famous apps (data/seed/apps.json) only reference technologies that exist in the atlas."""
from __future__ import annotations

import json
from pathlib import Path

import validate_dataset as vd

ROOT = Path(__file__).resolve().parents[2]
APPS = json.loads((ROOT / "data" / "seed" / "apps.json").read_text(encoding="utf-8"))
GRAPH = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
_SEED = ROOT / "data" / "seed" / "technologies.json"
SEED_TECH = {t["slug"] for t in json.loads(_SEED.read_text(encoding="utf-8"))}


def test_every_referenced_technology_exists_in_the_seed():
    missing = [f"{a['id']}: {s['tech']}"
               for a in APPS for s in a["stack"] if s["tech"] not in SEED_TECH]
    assert missing == []


def test_committed_apps_pass_the_validator():
    report = vd.Report()
    vd.validate_apps(GRAPH, APPS, report)
    assert report.errors == []


def test_validator_rejects_unknown_tech_layer_and_missing_source():
    bad = [{"id": "x", "stack": [{"tech": "python", "layer": "backend", "note": "n"},
                                 {"tech": "nope", "layer": "backend", "note": "n"},
                                 {"tech": "go", "layer": "space", "note": ""}],
            "sources": [{"title": "t", "url": "http://insecure"}]}]
    report = vd.Report()
    vd.validate_apps(GRAPH, bad, report)
    text = "\n".join(report.errors)
    assert "unknown technology: nope" in text
    assert "unknown layer: space" in text
    assert "go has no note" in text
    assert "https source" in text


def test_validator_rejects_duplicate_ids():
    stack = [{"tech": t, "layer": "backend", "note": "n"} for t in ("python", "go", "rust")]
    app = {"id": "dup", "stack": stack,
           "sources": [{"title": "t", "url": "https://example.com"}]}
    report = vd.Report()
    vd.validate_apps(GRAPH, [app, app], report)
    assert any("Duplicate famous app id: dup" in e for e in report.errors)
