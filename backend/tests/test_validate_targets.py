"""Tests for the Phase 1B milestone gate in scripts/validate_dataset.py.

check_targets is pure, so we test it directly at the boundaries
(requirements.md 1.1): technologies >= 250 and 150 <= concepts <= 170.
"""
from __future__ import annotations

import validate_dataset as vd


def _counts(technology: int, concept: int, domain: int = 11) -> dict[str, int]:
    return {"technology": technology, "concept": concept, "domain": domain}


# --- technology boundary (>= 250) -------------------------------------------

def test_tech_just_below_target_fails():
    errors = vd.check_targets(_counts(technology=249, concept=160))
    assert any("technolog" in e for e in errors)


def test_tech_exactly_at_target_passes():
    assert vd.check_targets(_counts(technology=250, concept=160)) == []


def test_tech_above_target_passes():
    assert vd.check_targets(_counts(technology=400, concept=160)) == []


# --- concept range boundaries (150..170 inclusive) --------------------------

def test_concepts_just_below_range_fails():
    errors = vd.check_targets(_counts(technology=300, concept=149))
    assert any("concept" in e for e in errors)


def test_concepts_at_low_bound_passes():
    assert vd.check_targets(_counts(technology=300, concept=150)) == []


def test_concepts_at_high_bound_passes():
    assert vd.check_targets(_counts(technology=300, concept=170)) == []


def test_concepts_just_above_range_fails():
    errors = vd.check_targets(_counts(technology=300, concept=171))
    assert any("concept" in e for e in errors)


# --- both wrong reports both --------------------------------------------------

def test_both_out_of_range_reports_two_errors():
    errors = vd.check_targets(_counts(technology=10, concept=10))
    assert len(errors) == 2


# --- missing keys treated as zero (defensive) --------------------------------

def test_missing_counts_treated_as_zero():
    errors = vd.check_targets({})
    assert len(errors) == 2


# --- cross-type slug collisions + URL scheme (P3 hardening) ------------------

def _ds(nodes, edges=None):
    return {"version": "0.0.0", "nodes": nodes, "edges": edges or []}


def _node(nid, slug, ntype, **extra):
    n = {"id": nid, "slug": slug, "name": slug, "node_type": ntype,
         "primary_domain": "domain:d", "short_description": "x"}
    n.update(extra)
    return n


def test_cross_type_slug_collision_is_error():
    ds = _ds([
        _node("domain:d", "d", "domain"),
        _node("technology:x", "x", "technology"),
        _node("concept:x", "x", "concept"),
    ])
    r = vd.validate(ds)
    assert any("multiple node types" in e for e in r.errors)


def test_unique_slugs_across_types_pass():
    ds = _ds([
        _node("domain:d", "d", "domain"),
        _node("technology:x", "x", "technology"),
        _node("concept:y", "y", "concept"),
    ])
    r = vd.validate(ds)
    assert not any("multiple node types" in e for e in r.errors)


def test_non_http_url_is_error():
    ds = _ds([
        _node("domain:d", "d", "domain"),
        _node("technology:x", "x", "technology", official_url="javascript:alert(1)"),
    ])
    r = vd.validate(ds)
    assert any("not an http(s) URL" in e for e in r.errors)


def test_https_url_passes():
    ds = _ds([
        _node("domain:d", "d", "domain"),
        _node("technology:x", "x", "technology", official_url="https://x.dev"),
    ])
    r = vd.validate(ds)
    assert not any("not an http(s) URL" in e for e in r.errors)
