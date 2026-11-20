#!/usr/bin/env python3
"""The 2,000-node expansion (dataset 0.8.0): new fields, legacy and emerging technology.

Researched against roadmap.sh's role and skill roadmaps, the Thoughtworks Technology Radar
(vols 33-34), the CNCF landscape categories and the famous-apps `not_in_atlas` list.

1. Three new top-level fields: Programming Languages, Data Science & Analytics, and
   Enterprise & Business Software.
2. Eight new sub-fields inside existing territories: Generative AI (AI & ML), Cryptography
   (Security), Observability & SRE (Cloud & DevOps), Mainframes & Legacy Systems (Systems),
   Audio & Music Technology and Automotive & Aerospace Software (Computer Engineering),
   Geospatial & Mapping (Interdisciplinary) and CMS & E-commerce (Backend). The layout is
   two-level, so every sub-field hangs directly off a top-level field.
3. A few existing nodes move into the new sub-field of the territory they already live in,
   so no node changes top-level field.
4. ~800 curated nodes from the part modules (atlas_2000_*.py), each with typed edges.

Authoring rules: a node only gets a wikipedia_title when that exact article is known; no
wikidata ids or URLs are guessed. Edges are written inline as `code:slug` (see _dsl.py).

Run from scripts/expand:  python atlas_2000.py [--check]   (idempotent)
"""
from __future__ import annotations

import json
import sys
from collections import Counter

from _apply import SEED, apply_batch
from _dsl import CODES

import atlas_2000_languages
import atlas_2000_data
import atlas_2000_ai
import atlas_2000_cloud
import atlas_2000_web
import atlas_2000_systems
import atlas_2000_security
import atlas_2000_fields

PARTS = [atlas_2000_languages, atlas_2000_data, atlas_2000_ai, atlas_2000_cloud,
         atlas_2000_web, atlas_2000_systems, atlas_2000_security, atlas_2000_fields]

TOP = "domain:software-engineering"
NEW_DOMAINS = [
    # (id suffix, name, description, importance, parent). The slug is SLUGS.get(id, id).
    ("programming-languages", "Programming Languages",
     "The languages we program in, the ideas behind them, and the compilers and runtimes "
     "that run them.", 0.85, TOP),
    ("data-science", "Data Science & Analytics",
     "Statistics, analysis, visualisation and business intelligence: turning data into "
     "decisions.", 0.8, TOP),
    ("enterprise-software", "Enterprise & Business Software",
     "The systems companies run on: ERP, CRM, workflow automation, low-code and "
     "collaboration platforms.", 0.65, TOP),
    ("generative-ai", "Generative AI & LLMs",
     "Large language models, diffusion models and the tooling for building with them.",
     0.75, "domain:ai-ml"),
    ("cryptography", "Applied Cryptography",
     "The mathematics of secrecy and trust: ciphers, hashes, signatures and protocols.",
     0.65, "domain:security"),
    ("observability", "Observability & SRE",
     "Metrics, logs, traces and the practices that keep production systems reliable.",
     0.6, "domain:cloud-devops"),
    ("legacy-mainframe", "Mainframes & Legacy Systems",
     "Mainframes, COBOL and the decades-old systems that still run banks, airlines and "
     "governments.", 0.5, "domain:systems"),
    ("audio-music", "Audio & Music Technology",
     "Digital audio, synthesis, music software and the standards that connect instruments.",
     0.5, "domain:computer-engineering"),
    ("automotive-aerospace", "Automotive & Aerospace Software",
     "Safety-critical software for cars, aircraft and spacecraft, and the standards that "
     "certify it.", 0.5, "domain:computer-engineering"),
    ("geospatial", "Geospatial & Mapping",
     "Maps, coordinates and location data: GIS, satellite imagery and navigation.",
     0.5, "domain:interdisciplinary"),
    ("cms-ecommerce", "CMS & E-commerce",
     "Content management systems, headless CMSs and online-store platforms.",
     0.5, "domain:backend"),
]

# Domain slugs that differ from their id, because a concept already owns the bare slug.
SLUGS = {"generative-ai": "generative-ai-llms", "cryptography": "applied-cryptography",
         "observability": "observability-sre", "data-science": "data-science-analytics"}

# Existing nodes whose home becomes a new sub-field of the SAME top-level territory.
MOVES = {
    # Generative AI (inside AI & ML)
    "concept:large-language-models": "generative-ai", "concept:prompt-engineering": "generative-ai",
    "concept:retrieval-augmented-generation": "generative-ai", "concept:diffusion-models": "generative-ai",
    "concept:generative-adversarial-network": "generative-ai", "concept:small-language-models": "generative-ai",
    "concept:reasoning-models": "generative-ai", "concept:text-to-video": "generative-ai",
    "concept:tool-use": "generative-ai", "concept:llm-evaluation": "generative-ai",
    "concept:ai-guardrails": "generative-ai", "concept:speculative-decoding": "generative-ai",
    "concept:kv-cache": "generative-ai", "concept:low-rank-adaptation": "generative-ai",
    "technology:langchain": "generative-ai", "technology:langgraph": "generative-ai",
    "technology:llamaindex": "generative-ai", "technology:openai-api": "generative-ai",
    "technology:ollama": "generative-ai", "technology:llama-cpp": "generative-ai",
    "technology:vllm": "generative-ai", "technology:stable-diffusion": "generative-ai",
    "technology:dspy": "generative-ai", "technology:model-context-protocol": "generative-ai",
    "technology:a2a-protocol": "generative-ai",
    # Cryptography (inside Security)
    "concept:cryptography": "cryptography", "concept:encryption": "cryptography",
    "concept:hashing": "cryptography", "concept:public-key-cryptography": "cryptography",
    "concept:symmetric-key-cryptography": "cryptography", "concept:digital-signature": "cryptography",
    "concept:key-exchange": "cryptography", "concept:post-quantum-cryptography": "cryptography",
    "concept:homomorphic-encryption": "cryptography", "concept:zero-knowledge-proof": "cryptography",
    "technology:openssl": "cryptography", "technology:gpg": "cryptography",
    # Observability & SRE (inside Cloud & DevOps)
    "concept:observability": "observability", "concept:distributed-tracing": "observability",
    "concept:site-reliability-engineering": "observability",
    "concept:service-level-objectives": "observability", "concept:incident-management": "observability",
    "concept:chaos-engineering": "observability",
    "technology:prometheus": "observability", "technology:grafana": "observability",
    "technology:loki": "observability", "technology:jaeger": "observability",
    "technology:opentelemetry": "observability", "technology:datadog": "observability",
}


def _rewrite(name: str, fn) -> None:
    path = SEED / name
    data = json.loads(path.read_text(encoding="utf-8"))
    data = fn(data)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def restructure() -> None:
    """Add the new domains with their has_subdomain links and move existing nodes."""
    def add_domains(domains):
        have = {d["id"] for d in domains}
        for slug, name, desc, imp, _parent in NEW_DOMAINS:
            if f"domain:{slug}" not in have:
                domains.append({"id": f"domain:{slug}", "slug": SLUGS.get(slug, slug),
                                "name": name,
                                "node_type": "domain", "primary_domain": f"domain:{slug}",
                                "short_description": desc, "importance": imp,
                                "lifecycle_status": "active"})
        return domains

    moved: dict[str, tuple[str, str]] = {}

    def move(nodes):
        for n in nodes:
            new = MOVES.get(n["id"])
            if new and n["primary_domain"] != f"domain:{new}":
                moved[n["id"]] = (n["primary_domain"], f"domain:{new}")
                n["primary_domain"] = f"domain:{new}"
        return nodes

    def fix_edges(edges):
        # Retarget the spoke in place so edge order (and ids) of everything else is kept.
        for x in edges:
            if x["relationship_type"] == "belongs_to_domain" and x["source"] in moved:
                old, new = moved[x["source"]]
                if x["target"] == old:
                    x["target"] = new
        have = {(x["source"], x["target"]) for x in edges
                if x["relationship_type"] == "has_subdomain"}
        for slug, *_rest, parent in NEW_DOMAINS:
            if (parent, f"domain:{slug}") not in have:
                edges.append({"source": parent, "target": f"domain:{slug}",
                              "relationship_type": "has_subdomain"})
        return edges

    _rewrite("domains.json", add_domains)
    _rewrite("concepts.json", move)
    _rewrite("technologies.json", move)
    _rewrite("edges.json", fix_edges)


# Authored nodes that turned out to duplicate an existing node (found through the
# validator's alias check). They are dropped and their edges move to the existing node.
DUPLICATES = {
    "dbt": "duckdb-dbt", "openid-connect": "oauth-spec", "big-o-notation": "asymptotic-analysis",
    "webauthn": "passkeys", "generic-programming": "generics", "ble": "bluetooth", "elt": "etl",
}


def collect():
    nodes, extra = [], []
    for part in PARTS:
        nodes.extend(part.NODES)
        extra.extend(getattr(part, "EXTRA", []))
    kept = []
    for n in nodes:
        into = DUPLICATES.get(n["slug"])
        if into is None:
            kept.append(n)
            continue
        for tok in n["_edges"].split():
            code, _, tgt = tok.partition(":")
            if tgt != into:
                extra.append((into, code, tgt))
    redirect = lambda slug: DUPLICATES.get(slug, slug)  # noqa: E731
    for n in kept:
        toks = []
        for tok in n["_edges"].split():
            code, _, tgt = tok.partition(":")
            if redirect(tgt) != n["slug"]:
                toks.append(f"{code}:{redirect(tgt)}")
        n["_edges"] = " ".join(toks)
    extra = [(redirect(s), c, redirect(t)) for s, c, t in extra if redirect(s) != redirect(t)]
    return kept, extra


def build(nodes, extra):
    """Resolve inline edges to ids; return (concepts, technologies, edges, problems)."""
    existing = []
    for fragment in ("domains.json", "concepts.json", "technologies.json"):
        existing.extend(json.loads((SEED / fragment).read_text(encoding="utf-8")))
    existing_ids = {n["id"] for n in existing}
    domain_slugs = {s for s, *_ in NEW_DOMAINS} | {
        n["id"].split(":", 1)[1] for n in existing if n["node_type"] == "domain"}
    by_slug = {n["slug"]: n for n in existing if n["node_type"] != "domain"}
    problems = []
    new = []
    seen = Counter(n["slug"] for n in nodes)
    for slug, k in seen.items():
        if k > 1:
            problems.append(f"slug authored twice: {slug}")
    for n in nodes:
        if n["slug"] in by_slug and n["id"] not in existing_ids:
            problems.append(f"slug already used by {by_slug[n['slug']]['id']}: {n['id']}")
        if n["id"] in existing_ids:
            continue
        if n["primary_domain"].split(":", 1)[1] not in domain_slugs:
            problems.append(f"unknown domain {n['primary_domain']} on {n['id']}")
        by_slug[n["slug"]] = n
        new.append(n)
    edges = []

    def add(src_slug, code, tgt_slug, where):
        if code not in CODES:
            problems.append(f"{where}: unknown edge code '{code}'")
            return
        s, t = by_slug.get(src_slug), by_slug.get(tgt_slug)
        if s is None or t is None:
            problems.append(f"{where}: unknown slug {src_slug if s is None else tgt_slug}")
            return
        rel = CODES[code]
        # implements/used_for/supports/enables point at concepts. A technology that targets
        # another technology this way (an IDE "used for" Java) is recorded as related_to.
        if rel in ("implements", "used_for", "supports", "enables") and \
                t["node_type"] == "technology":
            rel = "related_to"
        edges.append({"source": s["id"], "target": t["id"], "relationship_type": rel})

    for n in new:
        edges.append({"source": n["id"], "target": n["primary_domain"],
                      "relationship_type": "belongs_to_domain"})
        for tok in n["_edges"].split():
            code, _, tgt = tok.partition(":")
            add(n["slug"], code, tgt, n["id"])
    for src, code, tgt in extra:
        add(src, code, tgt, f"extra {src}")
    clean = [{k: v for k, v in n.items() if k != "_edges"} for n in new]
    concepts = [n for n in clean if n["node_type"] == "concept"]
    techs = [n for n in clean if n["node_type"] == "technology"]
    return concepts, techs, edges, problems


def typed_degree_problems(new_ids, edges):
    all_edges = json.loads((SEED / "edges.json").read_text(encoding="utf-8")) + edges
    deg = Counter()
    seen = set()
    for e in all_edges:
        r = e["relationship_type"]
        key = (r, frozenset((e["source"], e["target"]))) if r in {
            "related_to", "integrates_with", "alternative_to", "commonly_used_with"} else (
            r, e["source"], e["target"])
        if key in seen or r == "belongs_to_domain":
            continue
        seen.add(key)
        deg[e["source"]] += 1
        deg[e["target"]] += 1
    return [f"only {deg[i]} typed edge(s): {i}" for i in sorted(new_ids) if deg[i] < 2]


# Famous apps: labels in `not_in_atlas` that are now atlas nodes move into the stack.
# Each note restates only what the app's existing sources already say.
APP_MOVES = {
    "netflix": [("EVCache (memcached)", "memcached", "data", "EVCache, the distributed cache, is built on memcached"),
                ("Zuul", "netflix-zuul", "backend", "Edge gateway (Netflix OSS)"),
                ("Eureka", "netflix-eureka", "backend", "Service discovery (Netflix OSS)")],
    "spotify": [("Google Cloud Pub/Sub", "google-pubsub", "data", "Event delivery"),
                ("Dataflow / Apache Beam", "apache-beam", "data", "Batch and streaming pipelines, run on Dataflow"),
                ("Luigi", "luigi", "data", "Batch job pipelines (built at Spotify)")],
    "airbnb": [("Hive", "apache-hive", "data", "Data warehouse on Hadoop"),
               ("Superset", "apache-superset", "data", "Dashboards (created at Airbnb)")],
    "uber": [("Cadence", "cadence-workflow", "backend", "Workflow orchestration (built at Uber)"),
             ("Hadoop/HDFS", "hadoop", "data", "Data lake storage"),
             ("Presto", "presto", "data", "Interactive SQL analytics"),
             ("Apache Pinot", "apache-pinot", "data", "Real-time analytics")],
    "instagram": [("memcached", "memcached", "data", "Caching layer")],
    "discord": [("ScyllaDB", "scylladb", "data", "Message storage after the move from Cassandra")],
    "github": [("Vitess", "vitess", "data", "MySQL sharding"), ("memcached", "memcached", "data", "Caching")],
    "shopify": [("memcached", "memcached", "data", "Caching")],
    "reddit": [("memcached", "memcached", "data", "Caching")],
    "slack": [("Hack (the language)", "hack", "backend", "Web application code on HHVM"),
              ("Vitess", "vitess", "data", "MySQL sharding")],
    "pinterest": [("HBase", "hbase", "data", "Wide-column storage"), ("memcached", "memcached", "data", "Caching")],
    "linkedin": [("Ember.js", "ember-js", "web", "Web front end"),
                 ("Samza", "apache-samza", "data", "Stream processing (built at LinkedIn)"),
                 ("Apache Pinot", "apache-pinot", "data", "Real-time analytics (built at LinkedIn)"),
                 ("Hadoop", "hadoop", "data", "Offline data processing")],
    "notion": [("Debezium", "debezium", "data", "Change data capture into the data lake"),
               ("Apache Hudi", "apache-hudi", "data", "Data lake table format")],
    "cloudflare": [("Pingora", "pingora", "backend", "Rust proxy framework that replaced NGINX"),
                   ("OpenResty", "openresty", "backend", "NGINX + Lua edge logic"),
                   ("V8", "v8", "infra", "JavaScript engine whose isolates run Workers")],
    "wikipedia": [("MediaWiki", "mediawiki", "backend", "The wiki software Wikipedia runs on"),
                  ("Varnish", "varnish", "infra", "HTTP caching"),
                  ("memcached", "memcached", "data", "Caching"),
                  # The Elasticsearch entry already notes the OpenSearch move; no new claim.
                  ("OpenSearch", None, None, None)],
    "lyft": [("Flyte", "flyte", "data", "Workflow orchestration (built at Lyft)")],
    "chatgpt": [("Triton (OpenAI)", "triton-lang", "ml", "GPU kernel language")],
}


def update_apps() -> None:
    from accuracy_pass import load, save_apps
    apps = load("apps.json")
    for app in apps:
        for label, tech, layer, note in APP_MOVES.get(app["id"], []):
            if label in app["not_in_atlas"]:
                app["not_in_atlas"].remove(label)
            if tech and all(s["tech"] != tech for s in app["stack"]):
                app["stack"].append({"tech": tech, "layer": layer, "note": note})
    save_apps(apps)


def main() -> None:
    check = "--check" in sys.argv
    nodes, extra = collect()
    if not check:
        restructure()
    concepts, techs, edges, problems = build(nodes, extra)
    problems += typed_degree_problems({n["id"] for n in concepts + techs}, edges)
    print(f"authored {len(nodes)} nodes; new: {len(concepts)} concepts, {len(techs)} "
          f"technologies, {len(edges)} edges")
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  " + p)
        if not check:
            raise SystemExit(1)
        return
    if not check:
        apply_batch("atlas-2000", concepts=concepts, technologies=techs, edges=edges)
        update_apps()


if __name__ == "__main__":
    main()
