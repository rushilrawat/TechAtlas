"""Phase 1.5C Java/Kotlin parser tests + property checks (design Properties 2, 3).

Covers Maven pom.xml, Gradle Groovy/Kotlin DSL, version-catalog resolution (including the
cross-file resolution through build_scan), test scope, unresolved-variable verbatim output,
and graceful failure.
"""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from app.scanner.github_client import GitHubClient
from app.scanner.manifest_parsers import java
from app.scanner.scan_orchestrator import run_scan

from .test_scanner import FakeGitHub


def test_pom_coordinates_and_test_scope():
    pom = (
        '<project xmlns="http://maven.apache.org/POM/4.0.0"><dependencies>'
        "<dependency><groupId>org.springframework.boot</groupId>"
        "<artifactId>spring-boot-starter-web</artifactId></dependency>"
        "<dependency><groupId>junit</groupId><artifactId>junit</artifactId>"
        "<scope>test</scope></dependency>"
        "</dependencies></project>"
    )
    d = java.parse_pom_xml("pom.xml", pom)
    by = {x.package: x for x in d}
    assert "org.springframework.boot:spring-boot-starter-web" in by
    assert by["junit:junit"].scope == "test"
    assert all(x.ecosystem == "maven" and x.direct for x in d)


def test_gradle_configs_scope_and_unresolved_variable_verbatim():
    gradle = (
        'dependencies {\n'
        '  implementation "com.squareup.okhttp3:okhttp:4.12.0"\n'
        '  testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")\n'
        '  implementation "org.example:$myVar"\n'
        '}\n'
    )
    d = java.parse_gradle("build.gradle.kts", gradle)
    by = {x.package: x for x in d}
    assert "com.squareup.okhttp3:okhttp" in by
    assert by["org.junit.jupiter:junit-jupiter"].scope == "test"
    # unresolved $var is emitted verbatim, never fabricated into a version/node.
    assert "org.example:$myVar" in by


def test_gradle_catalog_resolution_direct():
    cat = (
        "[libraries]\n"
        'spring-web = { group = "org.springframework.boot", name = "spring-boot-starter-web" }\n'
        'guava = "com.google.guava:guava:33.0"\n'
    )
    catalog = java.resolve_version_catalog(cat)
    gradle = "dependencies {\n  implementation libs.spring.web\n  implementation(libs.guava)\n}\n"
    d = java.parse_gradle("build.gradle", gradle, catalog)
    coords = {x.package for x in d}
    assert "org.springframework.boot:spring-boot-starter-web" in coords
    assert "com.google.guava:guava" in coords


def test_unresolved_catalog_alias_is_skipped_not_fabricated():
    gradle = "dependencies {\n  implementation libs.unknown.thing\n}\n"
    d = java.parse_gradle("build.gradle", gradle, {})
    assert d == []  # no catalog entry -> no fabricated coordinate


def test_unparseable_pom_and_gradle_return_empty():
    assert java.parse_pom_xml("pom.xml", "<not valid xml") == []
    assert java.resolve_version_catalog("}}}not toml") == {}
    # gradle is regex-based; arbitrary text simply yields no matches
    assert java.parse_gradle("build.gradle", "nonsense content") == []


def test_build_scan_resolves_catalog_across_files():
    # End-to-end: a build.gradle referencing libs.* resolves via gradle/libs.versions.toml.
    files = {
        "build.gradle": "dependencies {\n  implementation libs.okhttp\n}\n",
        "gradle/libs.versions.toml": (
            "[libraries]\nokhttp = \"com.squareup.okhttp3:okhttp:4.12.0\"\n"
        ),
    }
    fake = FakeGitHub(files=files)
    gh = GitHubClient(client=fake, token=None, request_budget=200)
    # matcher=None path: we only assert the unmapped coordinate surfaces (no canonical node
    # for okhttp is required for this test). Use the real matcher via run_scan's default.
    from app.graph_service import GraphService
    from app.scanner.technology_matcher import TechnologyMatcher
    matcher = TechnologyMatcher(GraphService().all_nodes())
    scan = run_scan(f"https://github.com/{fake.owner}/{fake.name}", gh, matcher,
                    mapping_version="0.2.0")
    # The okhttp coordinate must appear somewhere (detection or unmapped), proving the
    # catalog alias resolved and reached matching.
    coords = {u.name for u in scan.unmapped} | {d.node_id for d in scan.detections}
    assert any("okhttp" in c for c in coords)


# ---- property tests ----

@settings(max_examples=100)
@given(st.text(max_size=200))
def test_property_graceful_on_arbitrary_text(text):
    # Property 3: parsers never raise on arbitrary input.
    assert isinstance(java.parse_pom_xml("pom.xml", text), list)
    assert isinstance(java.parse_gradle("build.gradle", text), list)
    assert isinstance(java.resolve_version_catalog(text), dict)


_coord = st.from_regex(r"[a-z]{1,8}\.[a-z]{1,8}:[a-z-]{1,10}", fullmatch=True)


@settings(max_examples=100)
@given(st.lists(_coord, max_size=6, unique=True))
def test_property_gradle_literal_token(coords):
    # Property 2: emitted coordinates appear literally in the source.
    body = "".join(f'  implementation "{c}:1.0"\n' for c in coords)
    text = "dependencies {\n" + body + "}\n"
    for d in java.parse_gradle("build.gradle", text):
        assert d.package in text
