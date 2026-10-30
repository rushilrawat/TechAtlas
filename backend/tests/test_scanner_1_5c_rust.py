"""Phase 1.5C Rust parser tests + property checks (design Properties 2, 3, 4, 5).

Unit tests cover Cargo.toml/Cargo.lock/.rs parsing and graceful failure; property tests
use Hypothesis to assert the literal-token invariant, graceful-absence, direct/transitive
flag correctness, and internal/stdlib-root exclusion.
"""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from app.scanner.manifest_parsers import rust


def test_cargo_toml_sections_and_direct():
    toml = (
        "[dependencies]\n"
        'serde = "1.0"\n'
        'tokio = { version = "1", features = ["full"] }\n'
        "[dev-dependencies]\n"
        'criterion = "0.5"\n'
        "[build-dependencies]\n"
        'cc = "1"\n'
    )
    d = rust.parse_cargo_toml("Cargo.toml", toml)
    by = {x.package: x for x in d}
    assert by["serde"].direct is True and by["serde"].section == "dependencies"
    assert by["criterion"].section == "dev" and by["criterion"].scope == "dev"
    assert by["cc"].section == "build"
    assert all(x.ecosystem == "cargo" and x.detection_status == "declared" for x in d)


def test_cargo_lock_is_transitive():
    lock = (
        '[[package]]\nname = "serde"\nversion = "1.0.1"\n'
        '[[package]]\nname = "libc"\nversion = "0.2"\n'
    )
    d = rust.parse_cargo_lock("Cargo.lock", lock)
    assert {x.package for x in d} == {"serde", "libc"}
    assert all(x.direct is False and x.evidence_type == "lockfile" for x in d)


def test_source_imports_exclude_internal_roots_and_carry_line():
    rs = (
        "use serde::Serialize;\n"          # line 1
        "extern crate libc;\n"              # line 2
        "use std::collections::HashMap;\n"  # line 3 (excluded: std)
        "use crate::foo;\n"                 # line 4 (excluded: crate)
        "pub use tokio::spawn;\n"           # line 5
    )
    d = rust.parse_source_imports("src/main.rs", rs)
    got = {x.package: x.line for x in d}
    assert got == {"serde": 1, "libc": 2, "tokio": 5}
    assert all(x.detection_status == "confirmed" for x in d)


def test_unparseable_cargo_toml_returns_empty():
    assert rust.parse_cargo_toml("Cargo.toml", "this is not = valid toml [[[") == []
    assert rust.parse_cargo_lock("Cargo.lock", "}}}not toml") == []


# ---- property tests ----

_crate = st.text(alphabet="abcdefghijklmnopqrstuvwxyz_", min_size=1, max_size=12).filter(
    lambda s: s not in rust._RUST_INTERNAL
)


@settings(max_examples=150)
@given(st.lists(_crate, max_size=8, unique=True))
def test_property_literal_token_invariant(crates):
    # Property 2: every emitted package appears literally in the source text.
    text = "".join(f"use {c}::x;\n" for c in crates)
    out = rust.parse_source_imports("a.rs", text)
    for d in out:
        assert d.package in text


@settings(max_examples=100)
@given(st.text(max_size=200))
def test_property_graceful_on_arbitrary_text(text):
    # Property 3: never raises; returns a list.
    assert isinstance(rust.parse_cargo_toml("Cargo.toml", text), list)
    assert isinstance(rust.parse_cargo_lock("Cargo.lock", text), list)
    assert isinstance(rust.parse_source_imports("a.rs", text), list)


@settings(max_examples=100)
@given(st.sampled_from(sorted(rust._RUST_INTERNAL)))
def test_property_internal_roots_never_emitted(root):
    # Property 5 (subset): internal/stdlib roots are never emitted as crates.
    out = rust.parse_source_imports("a.rs", f"use {root}::thing;\n")
    assert out == []
