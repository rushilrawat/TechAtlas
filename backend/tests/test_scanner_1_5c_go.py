"""Phase 1.5C Go parser tests + property checks (design Properties 2, 3, 4, 5)."""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from app.scanner.manifest_parsers import go


def test_go_mod_direct_vs_indirect_and_own_module_excluded():
    mod = (
        "module github.com/acme/myapp\n\ngo 1.22\n\n"
        "require (\n"
        "\tgithub.com/gin-gonic/gin v1.9.1\n"
        "\tgolang.org/x/sync v0.5.0 // indirect\n"
        ")\n\n"
        "require github.com/stretchr/testify v1.8.0\n"
    )
    d = go.parse_go_mod("go.mod", mod)
    by = {x.package: x for x in d}
    assert by["github.com/gin-gonic/gin"].direct is True
    assert by["golang.org/x/sync"].direct is False
    assert by["github.com/stretchr/testify"].direct is True
    assert all(x.ecosystem == "go" for x in d)


def test_go_sum_always_transitive():
    summ = (
        "github.com/gin-gonic/gin v1.9.1 h1:abc=\n"
        "github.com/gin-gonic/gin v1.9.1/go.mod h1:def=\n"
    )
    d = go.parse_go_sum("go.sum", summ)
    assert {x.package for x in d} == {"github.com/gin-gonic/gin"}
    assert all(x.direct is False and x.evidence_type == "lockfile" for x in d)


def test_source_imports_exclude_stdlib_and_own_module():
    src = (
        "package main\n\nimport (\n"
        '\t"fmt"\n'                                    # stdlib (no dot)
        '\t"net/http"\n'                               # stdlib
        '\t"github.com/gin-gonic/gin"\n'               # external (line 6)
        '\t"github.com/acme/myapp/internal/x"\n'       # own module
        ")\n"
    )
    d = go.parse_source_imports("main.go", src, "github.com/acme/myapp")
    got = {x.package: x.line for x in d}
    assert got == {"github.com/gin-gonic/gin": 6}
    assert all(x.detection_status == "confirmed" for x in d)


def test_single_line_import():
    d = go.parse_source_imports("x.go", 'package x\nimport "github.com/pkg/errors"\n')
    assert [x.package for x in d] == ["github.com/pkg/errors"]


def test_unparseable_returns_empty():
    assert go.parse_go_mod("go.mod", "\x00garbage") == []
    assert go.parse_go_sum("go.sum", "nonsense") == []
    assert go.parse_source_imports("x.go", "not go code") == []


def test_own_module_helper():
    assert go.own_module("module github.com/a/b\n") == "github.com/a/b"
    assert go.own_module("no module here") is None


# ---- property tests ----

_mod = st.from_regex(r"github\.com/[a-z]{1,8}/[a-z]{1,8}", fullmatch=True)


@settings(max_examples=120)
@given(st.lists(_mod, max_size=6, unique=True))
def test_property_literal_token(mods):
    # Property 2: emitted modules appear literally in source.
    body = "".join(f'\t"{m}"\n' for m in mods)
    text = "package main\nimport (\n" + body + ")\n"
    for d in go.parse_source_imports("a.go", text):
        assert d.package in text


@settings(max_examples=100)
@given(st.text(max_size=200))
def test_property_graceful(text):
    # Property 3: never raises.
    assert isinstance(go.parse_go_mod("go.mod", text), list)
    assert isinstance(go.parse_go_sum("go.sum", text), list)
    assert isinstance(go.parse_source_imports("a.go", text), list)


@settings(max_examples=60)
@given(st.sampled_from(["fmt", "net/http", "encoding/json", "os", "strings", "errors"]))
def test_property_stdlib_never_external(stdlib_pkg):
    # Property 5 (subset): stdlib (no-dot first segment) is never an external import.
    d = go.parse_source_imports("a.go", f'package x\nimport "{stdlib_pkg}"\n')
    assert d == []
