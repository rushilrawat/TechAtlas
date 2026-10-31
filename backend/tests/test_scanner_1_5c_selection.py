"""Phase 1.5C tree-inspector selection tests + bounded-work property (design Property 17).

Reuses the FakeGitHub harness from test_scanner to drive select_files over trees that
include the new Rust/Java/Go manifests and .rs/.go sources, and asserts the selection
stays within budgets and excludes build-output dirs.
"""
from __future__ import annotations

from app.scanner.github_client import GitHubClient
from app.scanner.tree_inspector import select_files

from .test_scanner import FakeGitHub


def _select(files, **kw):
    fake = FakeGitHub(files=files)
    gh = GitHubClient(client=fake, token=None, request_budget=500)
    return select_files(fake.owner, fake.name, fake.sha, gh, **kw)


def _paths(sel):
    return {f.path for f in sel.files}


def test_selects_new_ecosystem_manifests_and_sources():
    sel = _select({
        "Cargo.toml": "[dependencies]\nserde = \"1\"\n",
        "Cargo.lock": "[[package]]\nname = \"serde\"\n",
        "src/main.rs": "use serde::Serialize;\n",
        "pom.xml": "<project></project>",
        "build.gradle.kts": "dependencies {}",
        "gradle/libs.versions.toml": "[libraries]",
        "go.mod": "module example.com/x\n",
        "go.sum": "example.com/y v1.0.0 h1:abc=\n",
        "cmd/main.go": 'package main\nimport "github.com/gin-gonic/gin"\n',
    })
    got = _paths(sel)
    for p in ["Cargo.toml", "Cargo.lock", "src/main.rs", "pom.xml", "build.gradle.kts",
              "gradle/libs.versions.toml", "go.mod", "go.sum", "cmd/main.go"]:
        assert p in got, f"{p} not selected"


def test_excludes_build_output_dirs_for_new_ecosystems():
    sel = _select({
        "src/main.rs": "use serde::Serialize;",
        "target/debug/build/thing.rs": "generated",       # Rust build output
        "vendor/github.com/x/y/z.go": "package z",          # Go vendored
        "build/classes/Main.class": "bytecode",             # excluded dir + binary ext
    })
    got = _paths(sel)
    assert "src/main.rs" in got
    assert "target/debug/build/thing.rs" not in got
    assert "vendor/github.com/x/y/z.go" not in got
    assert "build/classes/Main.class" not in got


def test_libs_versions_toml_only_under_gradle_dir():
    sel = _select({
        "gradle/libs.versions.toml": "[libraries]",
        "config/libs.versions.toml": "[libraries]",  # not under gradle/ -> not a manifest
    })
    got = _paths(sel)
    assert "gradle/libs.versions.toml" in got
    assert "config/libs.versions.toml" not in got


def test_source_budget_shared_not_grown_by_new_exts():
    # 10 .go sources + manifests, cap source at 3 -> only 3 sources kept, rest skipped.
    files = {f"pkg{i}/a.go": "package a" for i in range(10)}
    files["go.mod"] = "module x"
    sel = _select(files, max_source_files=3)
    sources = [f for f in sel.files if f.kind == "source"]
    assert len(sources) == 3
    assert sel.skipped_limit >= 7
    # go.mod (manifest) is always kept regardless of the source cap.
    assert "go.mod" in _paths(sel)


def test_each_selected_file_is_unique_bounded_work():
    # Property 17 (bounded work / each file once): no path appears twice; counts within caps.
    files = {f"src/f{i}.rs": "use serde::Serialize;" for i in range(50)}
    files.update({"Cargo.toml": "[dependencies]", "Cargo.lock": "[[package]]"})
    sel = _select(files, max_files=20, max_source_files=15)
    paths = [f.path for f in sel.files]
    assert len(paths) == len(set(paths)), "a file was selected more than once"
    assert len(sel.files) <= 20
    assert sum(1 for f in sel.files if f.kind == "source") <= 15


def test_source_sampling_spreads_across_monorepo_packages():
    # Coverage improvement (1.5D): with many packages and a small source budget, the
    # sampler must represent MULTIPLE top-level packages, not drain the budget on one.
    files = {}
    for pkg in ("apps", "packages", "services", "libs"):
        for i in range(20):
            files[f"{pkg}/mod{i}/index.ts"] = 'import React from "react";'
    files["package.json"] = '{"workspaces":["apps/*","packages/*"]}'
    sel = _select(files, max_source_files=8)
    srcs = [f.path for f in sel.files if f.kind == "source"]
    top_dirs = {p.split("/", 1)[0] for p in srcs}
    assert len(srcs) == 8
    # All four packages are represented (round-robin), not just one.
    assert top_dirs == {"apps", "packages", "services", "libs"}, top_dirs


def test_source_sampling_prefers_entrypoints():
    # Entrypoint-like filenames rank above incidental files at the same depth.
    files = {
        "src/zzz_util.ts": "export const x = 1;",
        "src/main.ts": 'import React from "react";',
        "src/helpers.ts": "export const y = 2;",
        "package.json": '{"dependencies":{"react":"1"}}',
    }
    sel = _select(files, max_source_files=1)
    srcs = [f.path for f in sel.files if f.kind == "source"]
    assert srcs == ["src/main.ts"], srcs


def test_manifests_always_inspected_even_under_tiny_source_budget():
    # The honest coverage signal: all discovered manifests inspected; only source sampled.
    files = {f"src/f{i}.py": "import flask" for i in range(50)}
    files.update({"pyproject.toml": "[project]\ndependencies=['flask']",
                  "Dockerfile": "FROM python:3.12", "requirements.txt": "flask\n"})
    sel = _select(files, max_source_files=2)
    man = {f.path for f in sel.files if f.kind == "manifest"}
    assert {"pyproject.toml", "Dockerfile", "requirements.txt"} <= man
    assert sel.important_files_skipped == 0
    assert sel.source_files_skipped == 48
