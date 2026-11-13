#!/usr/bin/env python3
"""Phase 1G expansion: close the gaps found in the November 2026 review.

1. Computer Graphics becomes a real (sub)domain. Its graphics nodes were filed under
   Game Development with a second, conflicting belongs_to_domain edge; they now live in
   Computer Graphics only, and Game Development drops "& Graphics" from its name.
2. Every node that had no typed relationship (only belongs_to_domain) gets at least one
   curated edge, so nothing floats without context.
3. Missing topics: SRE/observability, privacy, UX and design, product analytics, AR/VR,
   modern AI, lakehouse data formats, web platform, networking, tooling.

Run from scripts/expand:  python review_gaps.py   (idempotent; re-running is a no-op)
"""
from __future__ import annotations

import json

from _apply import SEED, apply_batch

CG = "domain:computer-graphics"
GAME = "domain:gamedev"


def t(slug, name, subtype, domain, desc, **extra):
    node = {
        "id": f"technology:{slug}", "slug": slug, "name": name,
        "node_type": "technology", "node_subtype": subtype,
        "primary_domain": domain, "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


def c(slug, name, domain, desc, **extra):
    node = {
        "id": f"concept:{slug}", "slug": slug, "name": name,
        "node_type": "concept", "primary_domain": domain,
        "short_description": desc,
    }
    node.update(extra)
    return node


NET, OPS, SEC, FE, SE = (
    "domain:networks", "domain:cloud-devops", "domain:security", "domain:frontend",
    "domain:software-engineering",
)
AI, DB, BE, TOOL = "domain:ai-ml", "domain:databases", "domain:backend", "domain:testing-tooling"

CONCEPTS = [
    # Computer graphics
    c("rasterization", "Rasterization", CG,
      "Converting triangles into screen pixels; the core of real-time GPU rendering.",
      importance=0.65, wikipedia_title="Rasterisation"),
    c("texture-mapping", "Texture Mapping", CG,
      "Wrapping 2D images onto 3D surfaces to add colour and detail.",
      importance=0.5, wikipedia_title="Texture mapping"),
    c("physically-based-rendering", "Physically Based Rendering", CG,
      "Shading that models how light really interacts with materials.",
      aliases=["PBR"], importance=0.55, wikipedia_title="Physically based rendering"),
    c("global-illumination", "Global Illumination", CG,
      "Lighting that accounts for light bouncing between surfaces, not just direct light.",
      importance=0.5, wikipedia_title="Global illumination"),
    c("polygon-mesh", "Polygon Mesh", CG,
      "Vertices, edges and faces that define the shape of a 3D object.",
      aliases=["3D mesh"], importance=0.5, wikipedia_title="Polygon mesh"),
    # Networks
    c("https", "HTTPS", NET,
      "HTTP carried over TLS, so requests are encrypted and the server is authenticated.",
      node_subtype="protocol", importance=0.75, wikipedia_title="HTTPS"),
    c("bgp", "BGP", NET,
      "Border Gateway Protocol: how networks on the internet announce routes to each other.",
      node_subtype="protocol", aliases=["Border Gateway Protocol"], importance=0.55,
      wikipedia_title="Border Gateway Protocol"),
    c("wi-fi", "Wi-Fi", NET,
      "The IEEE 802.11 family of wireless local-area networking standards.",
      node_subtype="standard", aliases=["WiFi", "802.11"], importance=0.6,
      wikipedia_title="Wi-Fi"),
    c("bluetooth", "Bluetooth", NET,
      "Short-range wireless standard for connecting peripherals and low-power devices.",
      node_subtype="standard", aliases=["BLE", "Bluetooth Low Energy"], importance=0.55,
      wikipedia_title="Bluetooth"),
    c("cellular-5g", "5G", NET,
      "Fifth-generation cellular networks with higher bandwidth and lower latency.",
      node_subtype="standard", aliases=["5G NR"], importance=0.55, wikipedia_title="5G"),
    c("nat", "Network Address Translation", NET,
      "Rewriting addresses at a router so many devices share one public IP.",
      aliases=["NAT"], importance=0.45, wikipedia_title="Network address translation"),
    # SRE and observability
    c("site-reliability-engineering", "Site Reliability Engineering", OPS,
      "Running production systems with software engineering: error budgets, automation, SLOs.",
      node_subtype="methodology", aliases=["SRE"], importance=0.7,
      wikipedia_title="Site reliability engineering"),
    c("service-level-objectives", "Service Level Objectives", OPS,
      "Target reliability levels (SLOs) measured by indicators (SLIs) such as latency.",
      aliases=["SLO", "SLI", "SLA"], importance=0.6,
      wikipedia_title="Service-level objective"),
    c("incident-management", "Incident Management", OPS,
      "Detecting, responding to and learning from outages, including on-call and postmortems.",
      node_subtype="methodology", aliases=["On-call", "Postmortem"], importance=0.55,
      wikipedia_title="Incident management"),
    c("chaos-engineering", "Chaos Engineering", OPS,
      "Injecting failures on purpose to prove a system survives them.",
      node_subtype="technique", importance=0.5, wikipedia_title="Chaos engineering"),
    # Privacy
    c("data-privacy", "Data Privacy", SEC,
      "Collecting and handling personal data lawfully, minimally and with consent.",
      aliases=["Information privacy"], importance=0.6, wikipedia_title="Information privacy"),
    c("gdpr", "GDPR", SEC,
      "The EU General Data Protection Regulation governing personal data.",
      node_subtype="standard", aliases=["General Data Protection Regulation"],
      importance=0.55, wikipedia_title="General Data Protection Regulation"),
    c("differential-privacy", "Differential Privacy", SEC,
      "Adding calibrated noise so aggregate results reveal nothing about any one person.",
      node_subtype="technique", importance=0.5, wikipedia_title="Differential privacy"),
    # UX and design
    c("design-systems", "Design Systems", FE,
      "Shared components, tokens and guidelines that keep a product's UI consistent.",
      importance=0.6, wikipedia_title="Design system"),
    c("usability-testing", "Usability Testing", FE,
      "Watching real users attempt tasks to find where an interface confuses them.",
      node_subtype="technique", importance=0.5, wikipedia_title="Usability testing"),
    c("wcag", "WCAG", FE,
      "Web Content Accessibility Guidelines: the W3C standard for accessible web content.",
      node_subtype="standard", aliases=["Web Content Accessibility Guidelines"],
      importance=0.55, wikipedia_title="Web Content Accessibility Guidelines"),
    # Product analytics
    c("ab-testing", "A/B Testing", SE,
      "Comparing two variants with real users to see which performs better.",
      node_subtype="technique", aliases=["Split testing"], importance=0.55,
      wikipedia_title="A/B testing"),
    c("product-analytics", "Product Analytics", SE,
      "Measuring how people use a product: events, funnels, retention.",
      importance=0.5, wikipedia_title="Web analytics"),
    # Web platform
    c("service-workers", "Service Workers", FE,
      "Background scripts that let web apps work offline and receive push messages.",
      node_subtype="standard", importance=0.5, wikipedia_title="Service worker"),
    c("core-web-vitals", "Core Web Vitals", FE,
      "Google's page-experience metrics: loading (LCP), responsiveness (INP), stability (CLS).",
      aliases=["Web Vitals", "LCP", "CLS", "INP"], importance=0.5,
      wikipedia_title="Web performance"),
    c("internationalization", "Internationalization", FE,
      "Designing software so it can be translated and adapted to locales.",
      aliases=["i18n", "Localization", "l10n"], importance=0.5,
      wikipedia_title="Internationalization and localization"),
    # Modern AI
    c("tokenization", "Tokenization", AI,
      "Splitting text into the sub-word units a language model reads and writes.",
      node_subtype="technique", importance=0.55,
      wikipedia_title="Large language model"),
    c("ai-agents", "AI Agents", AI,
      "LLM-driven systems that plan, call tools and act over multiple steps.",
      aliases=["Agentic AI", "LLM agents"], importance=0.65,
      wikipedia_title="Intelligent agent"),
    c("low-rank-adaptation", "LoRA", AI,
      "Fine-tuning a large model by training small low-rank weight updates.",
      node_subtype="technique", aliases=["Low-Rank Adaptation"], importance=0.5,
      wikipedia_title="Fine-tuning (deep learning)"),
    # Data
    c("data-lakehouse", "Data Lakehouse", DB,
      "A data lake with warehouse features: tables, transactions and schemas on open files.",
      node_subtype="architecture", aliases=["Lakehouse"], importance=0.55,
      wikipedia_title="Data lake"),
]

TECHNOLOGIES = [
    # SRE and observability
    t("sentry", "Sentry", "developer_tool", OPS,
      "Error and performance monitoring that groups crashes and traces them to code.",
      official_url="https://sentry.io", documentation_url="https://docs.sentry.io",
      wikipedia_title="Sentry (software)"),
    t("jaeger", "Jaeger", "developer_tool", OPS,
      "An open-source distributed tracing platform from the CNCF.",
      official_url="https://www.jaegertracing.io",
      documentation_url="https://www.jaegertracing.io/docs/"),
    t("opentofu", "OpenTofu", "developer_tool", OPS,
      "An open-source, community-governed fork of Terraform under the Linux Foundation.",
      official_url="https://opentofu.org", documentation_url="https://opentofu.org/docs/",
      lifecycle_status="emerging"),
    t("cloudflare-workers", "Cloudflare Workers", "cloud_service", OPS,
      "Serverless functions that run at Cloudflare's edge locations.",
      official_url="https://workers.cloudflare.com",
      documentation_url="https://developers.cloudflare.com/workers/"),
    t("netlify", "Netlify", "platform", OPS,
      "A platform for building and hosting static sites and serverless functions.",
      official_url="https://www.netlify.com", documentation_url="https://docs.netlify.com",
      wikipedia_title="Netlify"),
    t("amazon-s3", "Amazon S3", "cloud_service", OPS,
      "AWS object storage; its API is the de facto standard for storing blobs.",
      aliases=["S3"], official_url="https://aws.amazon.com/s3/",
      documentation_url="https://docs.aws.amazon.com/s3/", wikipedia_title="Amazon S3"),
    # Data
    t("apache-parquet", "Apache Parquet", "standard", DB,
      "A columnar file format for efficient analytical storage and queries.",
      aliases=["Parquet"], official_url="https://parquet.apache.org",
      documentation_url="https://parquet.apache.org/docs/", wikipedia_title="Apache Parquet"),
    t("apache-iceberg", "Apache Iceberg", "standard", DB,
      "An open table format that adds transactions and schema evolution to data-lake files.",
      aliases=["Iceberg"], official_url="https://iceberg.apache.org",
      documentation_url="https://iceberg.apache.org/docs/latest/"),
    t("delta-lake", "Delta Lake", "standard", DB,
      "An open table format from Databricks that brings ACID transactions to data lakes.",
      official_url="https://delta.io", documentation_url="https://docs.delta.io"),
    t("bigquery", "BigQuery", "cloud_service", DB,
      "Google Cloud's serverless data warehouse.",
      official_url="https://cloud.google.com/bigquery",
      documentation_url="https://cloud.google.com/bigquery/docs", wikipedia_title="BigQuery"),
    # UX, design, analytics
    t("figma", "Figma", "developer_tool", FE,
      "A collaborative, browser-based interface design and prototyping tool.",
      official_url="https://www.figma.com", documentation_url="https://help.figma.com",
      wikipedia_title="Figma"),
    t("posthog", "PostHog", "platform", SE,
      "Open-source product analytics with feature flags, session replay and experiments.",
      official_url="https://posthog.com", documentation_url="https://posthog.com/docs"),
    t("google-analytics", "Google Analytics", "cloud_service", SE,
      "Google's web and app analytics service.",
      aliases=["GA4"], official_url="https://marketingplatform.google.com/about/analytics/",
      documentation_url="https://developers.google.com/analytics",
      wikipedia_title="Google Analytics"),
    # Web platform
    t("htmx", "htmx", "library", FE,
      "Adds AJAX, swaps and server-sent updates to HTML through attributes.",
      official_url="https://htmx.org", documentation_url="https://htmx.org/docs/",
      wikipedia_title="Htmx"),
    t("indexeddb", "IndexedDB", "standard", FE,
      "The browser's built-in transactional database for structured client-side data.",
      official_url="https://www.w3.org/TR/IndexedDB/",
      documentation_url="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
      wikipedia_title="IndexedDB"),
    # AR/VR
    t("webxr", "WebXR", "standard", GAME,
      "The W3C browser API for virtual and augmented reality experiences.",
      official_url="https://immersiveweb.dev",
      documentation_url="https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API",
      wikipedia_title="WebXR"),
    t("openxr", "OpenXR", "standard", GAME,
      "The Khronos cross-vendor API for VR and AR runtimes and devices.",
      official_url="https://www.khronos.org/openxr/",
      documentation_url="https://registry.khronos.org/OpenXR/", wikipedia_title="OpenXR"),
    # AI tooling
    t("model-context-protocol", "Model Context Protocol", "standard", AI,
      "An open protocol for connecting AI assistants to tools and data sources.",
      aliases=["MCP"], official_url="https://modelcontextprotocol.io",
      documentation_url="https://modelcontextprotocol.io/docs", lifecycle_status="emerging"),
    t("github-copilot", "GitHub Copilot", "developer_tool", TOOL,
      "An AI pair programmer that suggests code inside the editor.",
      aliases=["Copilot"], official_url="https://github.com/features/copilot",
      documentation_url="https://docs.github.com/en/copilot",
      wikipedia_title="GitHub Copilot"),
    # Developer tools and languages
    t("language-server-protocol", "Language Server Protocol", "standard", TOOL,
      "A JSON-RPC protocol that lets one language server power many editors.",
      aliases=["LSP"], official_url="https://microsoft.github.io/language-server-protocol/",
      documentation_url="https://microsoft.github.io/language-server-protocol/specifications/",
      wikipedia_title="Language Server Protocol"),
    t("neovim", "Neovim", "developer_tool", TOOL,
      "A refactor of Vim focused on extensibility, with built-in LSP and Lua plugins.",
      official_url="https://neovim.io", documentation_url="https://neovim.io/doc/",
      wikipedia_title="Neovim"),
    t("erlang", "Erlang", "programming_language", BE,
      "A functional language and VM (BEAM) built for fault-tolerant, concurrent systems.",
      official_url="https://www.erlang.org", documentation_url="https://www.erlang.org/docs",
      wikipedia_title="Erlang (programming language)"),
    t("ocaml", "OCaml", "programming_language", SE,
      "A statically typed functional language with type inference and a fast native compiler.",
      official_url="https://ocaml.org", documentation_url="https://ocaml.org/docs",
      wikipedia_title="OCaml"),
    t("julia", "Julia", "programming_language", AI,
      "A high-performance dynamic language for numerical and scientific computing.",
      official_url="https://julialang.org", documentation_url="https://docs.julialang.org",
      wikipedia_title="Julia (programming language)"),
    # Payments
    t("stripe", "Stripe", "platform", BE,
      "A payments platform with APIs for charging cards, subscriptions and payouts.",
      official_url="https://stripe.com", documentation_url="https://docs.stripe.com",
      wikipedia_title="Stripe, Inc."),
]

# Graphics nodes that move from Game Development into Computer Graphics.
MOVED_TO_CG = [
    "concept:rendering-pipeline", "concept:ray-tracing", "concept:shaders",
    "concept:real-time-graphics", "technology:opengl", "technology:vulkan",
    "technology:webgpu", "technology:directx", "technology:metal", "technology:blender",
]


def e(s, r, t_):
    return {"source": s, "target": t_, "relationship_type": r}


def T(slug):
    return f"technology:{slug}"


def C(slug):
    return f"concept:{slug}"


EDGES = [
    *(e(n["id"], "belongs_to_domain", n["primary_domain"]) for n in CONCEPTS + TECHNOLOGIES),
    *(e(nid, "belongs_to_domain", CG) for nid in MOVED_TO_CG),

    # ---- Computer graphics ----
    e(C("rasterization"), "related_to", C("rendering-pipeline")),
    e(C("rasterization"), "alternative_to", C("ray-tracing")),
    e(C("texture-mapping"), "related_to", C("shaders")),
    e(C("physically-based-rendering"), "related_to", C("shaders")),
    e(C("global-illumination"), "related_to", C("ray-tracing")),
    e(C("polygon-mesh"), "related_to", C("rasterization")),
    e(C("polygon-mesh"), "related_to", C("computational-geometry")),
    e(T("blender"), "supports", C("polygon-mesh")),
    e(T("blender"), "supports", C("physically-based-rendering")),
    e(T("blender"), "commonly_used_with", T("godot")),
    e(T("blender"), "commonly_used_with", T("unity")),
    e(T("opengl"), "implements", C("rasterization")),
    e(T("vulkan"), "implements", C("rasterization")),
    e(T("unreal-engine"), "supports", C("physically-based-rendering")),
    e(C("real-time-graphics"), "related_to", C("rasterization")),

    # ---- Orphans: give every node a typed relationship ----
    e(T("html"), "commonly_used_with", T("css")),
    e(T("html"), "commonly_used_with", T("javascript")),
    e(T("html"), "related_to", C("dom")),
    e(T("jquery"), "written_in", T("javascript")),
    e(T("jquery"), "supports", C("dom")),
    e(T("elixir"), "built_on", T("erlang")),
    e(T("elixir"), "supports", C("concurrency")),
    e(T("android-sdk"), "commonly_used_with", T("kotlin")),
    e(T("android-sdk"), "commonly_used_with", T("android-studio")),
    e(T("android-sdk"), "supports", C("mobile-app-lifecycle")),
    e(T("perl"), "alternative_to", T("python")),
    e(T("perl"), "commonly_used_with", T("linux")),
    e(T("packer"), "commonly_used_with", T("terraform")),
    e(T("packer"), "supports", C("infrastructure-as-code")),
    e(T("nixos"), "built_on", T("linux")),
    e(T("nixos"), "supports", C("package-management")),
    e(T("x86-64"), "implements", C("isa")),
    e(T("x86-64"), "alternative_to", T("arm")),
    e(T("fpga"), "commonly_used_with", T("verilog")),
    e(T("fpga"), "commonly_used_with", T("vhdl")),
    e(T("fpga"), "related_to", C("asic")),
    e(C("progressive-web-app"), "related_to", C("service-workers")),
    e(C("progressive-web-app"), "related_to", C("single-page-application")),
    e(C("dom"), "related_to", C("virtual-dom")),
    e(T("javascript"), "supports", C("dom")),
    e(C("css-in-js"), "related_to", T("css")),
    e(C("css-in-js"), "related_to", C("component-architecture")),
    e(C("session-management"), "related_to", C("authentication")),
    e(C("session-management"), "alternative_to", C("jwt")),
    e(C("rate-limiting"), "related_to", C("api-gateway")),
    e(T("nginx"), "supports", C("rate-limiting")),
    e(C("webhooks"), "related_to", C("http")),
    e(C("webhooks"), "related_to", C("event-driven-architecture")),
    e(C("oltp"), "alternative_to", C("olap")),
    e(C("oltp"), "related_to", C("relational-databases")),
    e(C("cap-theorem"), "related_to", C("distributed-systems")),
    e(C("cap-theorem"), "related_to", C("replication")),
    e(C("overfitting"), "related_to", C("supervised-learning")),
    e(C("overfitting"), "related_to", C("neural-networks")),
    e(C("feature-engineering"), "related_to", C("supervised-learning")),
    e(T("scikit-learn"), "supports", C("feature-engineering")),
    e(C("recommender-systems"), "related_to", C("vector-embeddings")),
    e(C("recommender-systems"), "related_to", C("supervised-learning")),
    e(C("blue-green-deployment"), "related_to", C("ci-cd")),
    e(C("blue-green-deployment"), "alternative_to", C("canary-deployment")),
    e(C("canary-deployment"), "related_to", C("ci-cd")),
    e(T("istio"), "supports", C("canary-deployment")),
    e(C("sql-injection"), "related_to", C("sql")),
    e(T("owasp-zap"), "supports", C("sql-injection")),
    e(C("mobile-app-lifecycle"), "related_to", C("push-notifications")),
    e(T("firebase"), "supports", C("push-notifications")),
    e(C("garbage-collection"), "related_to", C("memory-management")),
    e(T("java"), "supports", C("garbage-collection")),
    e(T("go"), "supports", C("garbage-collection")),
    e(C("code-review"), "related_to", C("version-control")),
    e(T("github"), "supports", C("code-review")),
    e(C("recursion"), "related_to", C("divide-and-conquer")),
    e(C("recursion"), "related_to", C("dynamic-programming")),
    e(C("refactoring"), "related_to", C("clean-code")),
    e(C("technical-debt"), "related_to", C("refactoring")),
    e(C("idempotency"), "related_to", C("rest-api")),
    e(C("idempotency"), "related_to", C("distributed-transaction")),
    e(C("monorepo"), "related_to", C("version-control")),
    e(C("monorepo"), "related_to", C("package-management")),
    e(C("agile"), "related_to", C("ci-cd")),
    e(C("agile"), "related_to", C("test-driven-development")),
    e(C("multiprocessor-architecture"), "related_to", C("parallel-computing")),
    e(C("multiprocessor-architecture"), "related_to", C("memory-consistency")),
    e(C("i2c"), "alternative_to", C("spi")),
    e(C("i2c"), "related_to", C("microcontroller")),
    e(C("can-bus"), "related_to", C("embedded-systems")),
    e(C("can-bus"), "related_to", C("industrial-iot")),
    e(C("dns"), "related_to", C("http")),
    e(C("dns"), "related_to", C("tcp-ip")),
    e(T("cloudflare"), "supports", C("dns")),
    e(C("packet-switching"), "related_to", C("routing")),
    e(C("packet-switching"), "related_to", C("tcp-ip")),
    e(C("sdn"), "related_to", C("routing")),
    e(C("sdn"), "related_to", C("switching")),
    e(C("type-theory"), "related_to", C("functional-programming")),
    e(T("coq"), "implements", C("type-theory")),
    e(T("lean"), "implements", C("type-theory")),
    e(C("computational-geometry"), "related_to", C("algorithms")),
    e(C("computational-geometry"), "related_to", C("motion-planning")),
    e(C("bioinformatics"), "related_to", C("dynamic-programming")),
    e(C("bioinformatics"), "related_to", C("algorithms")),

    # ---- Networks ----
    e(C("https"), "built_on", C("http")),
    e(C("https"), "built_on", C("tls")),
    e(T("let-s-encrypt"), "supports", C("https")),
    e(C("bgp"), "related_to", C("routing")),
    e(C("wi-fi"), "related_to", C("tcp-ip")),
    e(C("bluetooth"), "related_to", C("internet-of-things")),
    e(C("bluetooth"), "alternative_to", C("zigbee")),
    e(T("esp32"), "supports", C("wi-fi")),
    e(T("esp32"), "supports", C("bluetooth")),
    e(C("cellular-5g"), "related_to", C("edge-computing")),
    e(C("cellular-5g"), "related_to", C("internet-of-things")),
    e(C("nat"), "related_to", C("ipv4")),
    e(C("nat"), "related_to", C("routing")),

    # ---- SRE / observability ----
    e(C("site-reliability-engineering"), "related_to", C("observability")),
    e(C("site-reliability-engineering"), "related_to", C("high-availability")),
    e(C("site-reliability-engineering"), "related_to", C("service-level-objectives")),
    e(C("service-level-objectives"), "related_to", C("observability")),
    e(C("incident-management"), "related_to", C("site-reliability-engineering")),
    e(C("incident-management"), "related_to", C("observability")),
    e(C("chaos-engineering"), "related_to", C("fault-tolerance")),
    e(C("chaos-engineering"), "related_to", C("site-reliability-engineering")),
    e(T("sentry"), "supports", C("observability")),
    e(T("sentry"), "supports", C("incident-management")),
    e(T("sentry"), "alternative_to", T("datadog")),
    e(T("jaeger"), "implements", C("distributed-tracing")),
    e(T("jaeger"), "integrates_with", T("opentelemetry")),
    e(T("prometheus"), "supports", C("service-level-objectives")),
    e(T("grafana"), "supports", C("service-level-objectives")),
    e(T("opentofu"), "alternative_to", T("terraform")),
    e(T("opentofu"), "implements", C("infrastructure-as-code")),
    e(T("cloudflare-workers"), "implements", C("serverless")),
    e(T("cloudflare-workers"), "supports", C("edge-computing")),
    e(T("cloudflare-workers"), "part_of_ecosystem", T("cloudflare")),
    e(T("cloudflare-workers"), "alternative_to", T("aws-lambda")),
    e(T("netlify"), "alternative_to", T("vercel")),
    e(T("netlify"), "supports", C("static-site-generation")),
    e(T("amazon-s3"), "part_of_ecosystem", T("aws")),
    e(T("amazon-s3"), "used_for", C("data-lake")),
    e(T("minio"), "alternative_to", T("amazon-s3")),

    # ---- Privacy ----
    e(C("data-privacy"), "related_to", C("encryption")),
    e(C("gdpr"), "related_to", C("data-privacy")),
    e(C("differential-privacy"), "related_to", C("data-privacy")),
    e(C("differential-privacy"), "related_to", C("supervised-learning")),
    e(C("homomorphic-encryption"), "related_to", C("data-privacy")),

    # ---- UX and design ----
    e(C("design-systems"), "related_to", C("component-architecture")),
    e(C("design-systems"), "related_to", C("user-experience")),
    e(T("storybook"), "supports", C("design-systems")),
    e(T("mui"), "implements", C("design-systems")),
    e(C("usability-testing"), "related_to", C("user-experience")),
    e(C("usability-testing"), "related_to", C("human-computer-interaction")),
    e(C("wcag"), "related_to", C("accessibility")),
    e(T("figma"), "supports", C("design-systems")),
    e(T("figma"), "used_for", C("interaction-design")),

    # ---- Product analytics ----
    e(C("ab-testing"), "related_to", C("product-analytics")),
    e(C("ab-testing"), "related_to", C("bayesian-inference")),
    e(C("product-analytics"), "related_to", C("user-experience")),
    e(T("posthog"), "supports", C("product-analytics")),
    e(T("posthog"), "supports", C("ab-testing")),
    e(T("google-analytics"), "supports", C("product-analytics")),
    e(T("posthog"), "alternative_to", T("google-analytics")),

    # ---- Web platform ----
    e(C("service-workers"), "related_to", C("push-notifications")),
    e(T("indexeddb"), "commonly_used_with", T("javascript")),
    e(T("indexeddb"), "related_to", C("progressive-web-app")),
    e(C("core-web-vitals"), "related_to", C("server-side-rendering")),
    e(C("core-web-vitals"), "related_to", C("user-experience")),
    e(C("internationalization"), "related_to", C("user-experience")),
    e(T("htmx"), "alternative_to", T("react")),
    e(T("htmx"), "commonly_used_with", T("html")),
    e(T("htmx"), "related_to", C("server-side-rendering")),

    # ---- AR / VR ----
    e(T("webxr"), "supports", C("virtual-reality")),
    e(T("webxr"), "supports", C("augmented-reality")),
    e(T("webxr"), "commonly_used_with", T("threejs")),
    e(T("openxr"), "supports", C("virtual-reality")),
    e(T("openxr"), "supports", C("augmented-reality")),
    e(T("unity"), "integrates_with", T("openxr")),
    e(T("unreal-engine"), "integrates_with", T("openxr")),

    # ---- Modern AI ----
    e(C("tokenization"), "related_to", C("large-language-models")),
    e(C("tokenization"), "related_to", C("natural-language-processing")),
    e(T("huggingface-transformers"), "supports", C("tokenization")),
    e(C("ai-agents"), "related_to", C("large-language-models")),
    e(C("ai-agents"), "related_to", C("multi-agent-systems")),
    e(C("ai-agents"), "related_to", C("ai-planning")),
    e(T("langchain"), "supports", C("ai-agents")),
    e(T("model-context-protocol"), "used_for", C("ai-agents")),
    e(T("model-context-protocol"), "related_to", C("rpc")),
    e(C("low-rank-adaptation"), "related_to", C("fine-tuning")),
    e(T("huggingface-transformers"), "supports", C("low-rank-adaptation")),
    e(T("github-copilot"), "built_on", C("large-language-models")),
    e(T("github-copilot"), "integrates_with", T("vscode")),
    e(T("github-copilot"), "part_of_ecosystem", T("github")),

    # ---- Data ----
    e(C("data-lakehouse"), "related_to", C("data-lake")),
    e(C("data-lakehouse"), "related_to", C("data-warehouse")),
    e(T("apache-parquet"), "used_for", C("olap")),
    e(T("apache-parquet"), "commonly_used_with", T("spark")),
    e(T("duckdb"), "commonly_used_with", T("apache-parquet")),
    e(T("apache-iceberg"), "implements", C("data-lakehouse")),
    e(T("apache-iceberg"), "built_on", T("apache-parquet")),
    e(T("delta-lake"), "implements", C("data-lakehouse")),
    e(T("delta-lake"), "alternative_to", T("apache-iceberg")),
    e(T("delta-lake"), "commonly_used_with", T("spark")),
    e(T("bigquery"), "implements", C("data-warehouse")),
    e(T("bigquery"), "alternative_to", T("snowflake")),
    e(T("bigquery"), "part_of_ecosystem", T("gcp")),

    # ---- Tooling and languages ----
    e(T("language-server-protocol"), "related_to", C("static-analysis")),
    e(T("vscode"), "integrates_with", T("language-server-protocol")),
    e(T("neovim"), "integrates_with", T("language-server-protocol")),
    e(T("neovim"), "written_in", T("c")),
    e(T("neovim"), "alternative_to", T("vscode")),
    e(T("erlang"), "supports", C("concurrency")),
    e(T("erlang"), "supports", C("fault-tolerance")),
    e(T("erlang"), "supports", C("message-passing")),
    e(T("ocaml"), "supports", C("functional-programming")),
    e(T("ocaml"), "related_to", T("haskell")),
    e(T("julia"), "supports", C("scientific-computing")),
    e(T("julia"), "alternative_to", T("python")),
    e(T("julia"), "built_on", T("llvm")),
    e(T("stripe"), "related_to", C("rest-api")),
    e(T("stripe"), "related_to", C("webhooks")),
]


def _rewrite(name: str, fn) -> None:
    path = SEED / name
    data = fn(json.loads(path.read_text(encoding="utf-8")))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def restructure_graphics() -> None:
    """Rename Game Development and move the graphics nodes into Computer Graphics."""
    def rename(domains: list[dict]) -> list[dict]:
        for d in domains:
            if d["id"] == GAME:
                d["name"] = "Game Development"
                d["short_description"] = (
                    "Building interactive games: engines, gameplay, physics and XR, on top "
                    "of the graphics stack."
                )
        return domains

    moved = set(MOVED_TO_CG)

    def move(nodes: list[dict]) -> list[dict]:
        for n in nodes:
            if n["id"] in moved:
                n["primary_domain"] = CG
        return nodes

    def drop_old_membership(edges: list[dict]) -> list[dict]:
        return [
            x for x in edges
            if not (x["source"] in moved and x["relationship_type"] == "belongs_to_domain"
                    and x["target"] == GAME)
        ]

    _rewrite("domains.json", rename)
    _rewrite("concepts.json", move)
    _rewrite("technologies.json", move)
    _rewrite("edges.json", drop_old_membership)


if __name__ == "__main__":
    restructure_graphics()
    apply_batch("review_gaps", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
