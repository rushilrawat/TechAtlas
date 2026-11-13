"""Phase 1.5E accuracy work: package catalog, new ecosystems, languages, infra signals."""
from __future__ import annotations

import json
from pathlib import Path

from app.graph_service import GraphService
from app.scanner.evaluation.harness import run_evaluation
from app.scanner.manifest_parsers import extra
from app.scanner.technology_matcher import TechnologyMatcher
from app.scanner.tree_inspector import _excluded, _is_manifest

MAP = Path(__file__).resolve().parents[1] / "app" / "scanner" / "package_map.json"
MATCHER = TechnologyMatcher(GraphService().all_nodes())


def test_every_catalog_target_exists_in_the_atlas():
    catalog = json.loads(MAP.read_text())
    missing = [(eco, k, v) for eco, d in catalog.items() if isinstance(d, dict)
               for k, v in d.items() if not MATCHER.has(v)]
    assert missing == []


def test_catalog_exact_and_prefix_rules():
    assert MATCHER.match_package("npm", "@prisma/client") == "technology:prisma"
    assert MATCHER.match_package("npm", "@angular/router") == "technology:angular"
    # Longest prefix wins: @langchain/langgraph is LangGraph, not LangChain.
    assert MATCHER.match_package("npm", "@langchain/langgraph") == "technology:langgraph"
    assert MATCHER.match_package("npm", "@langchain/openai") == "technology:langchain"
    assert MATCHER.match_package("pypi", "torch") == "technology:pytorch"
    assert MATCHER.match_package("nuget", "Npgsql.EntityFrameworkCore.PostgreSQL") == \
        "technology:postgresql"
    assert MATCHER.match_package("rubygems", "pg") == "technology:postgresql"
    assert MATCHER.match_package("npm", "totally-unknown-pkg-xyz") is None


def _ids(dets):
    return {d.node_id for d in dets if d.node_id} | {
        MATCHER.match_package(d.ecosystem, d.package) for d in dets if d.package} - {None}


def test_gemfile_composer_csproj_pubspec():
    gem = 'source "https://rubygems.org"\nruby "3.3"\ngem "rails"\ngem \'pg\'\n'
    assert {"technology:rails", "technology:postgresql", "technology:ruby"} <= \
        _ids(extra.parse_gemfile("Gemfile", gem))
    comp = json.dumps({"require": {"php": "^8.2", "ext-json": "*", "laravel/framework": "^11"}})
    got = _ids(extra.parse_composer_json("composer.json", comp))
    assert {"technology:php", "technology:laravel"} <= got
    csproj = ('<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup>'
              '<PackageReference Include="StackExchange.Redis" Version="2" />'
              '</ItemGroup></Project>')
    assert {"technology:dotnet", "technology:csharp", "technology:aspnet-core",
            "technology:redis"} <= _ids(extra.parse_dotnet_project("Api.csproj", csproj))
    pub = "name: x\ndependencies:\n  flutter:\n    sdk: flutter\n  cloud_firestore: ^5.0.0\n"
    assert {"technology:dart", "technology:flutter", "technology:firebase"} <= \
        _ids(extra.parse_pubspec("pubspec.yaml", pub))


def test_terraform_k8s_helm_prisma():
    tf = 'provider "aws" {}\nresource "aws_s3_bucket" "b" {}\n'
    assert {"technology:terraform", "technology:aws", "technology:amazon-s3",
            "concept:infrastructure-as-code"} <= _ids(extra.parse_terraform("main.tf", tf))
    k8s = "apiVersion: apps/v1\nkind: Deployment\n"
    assert "technology:kubernetes" in _ids(extra.parse_k8s_manifest("k8s/app.yaml", k8s))
    # A YAML that is not a Kubernetes object yields nothing.
    assert extra.parse_k8s_manifest("k8s/values.yaml", "replicas: 2\n") == []
    assert "technology:helm" in _ids(extra.parse_helm_chart("chart/Chart.yaml", "name: x"))
    prisma = 'datasource db {\n  provider = "mysql"\n  url = env("X")\n}\n'
    assert {"technology:prisma", "technology:mysql", "concept:orm"} <= \
        _ids(extra.parse_prisma_schema("prisma/schema.prisma", prisma))


def test_language_thresholds_ignore_noise():
    paths = [f"pkg/m{i}.py" for i in range(30)] + ["scripts/release.sh", "vite.config.js",
                                                    "web/one.ts"]
    found = {d.node_id for d in extra.language_detections(paths)}
    assert found == {"technology:python"}
    # In a small repo a single file is enough.
    assert {d.node_id for d in extra.language_detections(["main.go"])} == {"technology:go"}


def test_selection_rules():
    assert _is_manifest("services/api/Api.csproj")
    assert _is_manifest("infra/main.tf")
    assert _is_manifest("deploy/web.yaml")
    assert not _is_manifest("docs/web.yaml")
    assert _is_manifest("tailwind.config.ts")
    # Fixtures and example apps describe other projects, not this one.
    assert _excluded("tests/fixtures/rails-app/Gemfile")
    assert _excluded("examples/nextjs/package.json")


def test_expanded_corpus_is_fully_accurate():
    run = run_evaluation(0.0)
    names = {r.fixture for r in run.per_repo}
    assert {"js-next-saas", "py-ml-service", "ruby-rails-app", "php-laravel-app",
            "dotnet-api", "flutter-app", "infra-terraform-k8s", "neg-noise-guard"} <= names
    bad = [(r.fixture, r.false_positives, r.false_negatives) for r in run.per_repo
           if r.false_positives or r.false_negatives]
    assert bad == []
