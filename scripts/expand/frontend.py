#!/usr/bin/env python3
"""Phase 1B expansion — Batch 1: Frontend.

Real, hand-verified frontend technologies and concepts. Wikipedia titles are the
exact article titles (not auto-derived); wikidata_id included only where a stable
entity exists. Edges use only taxonomy-valid relationship types and endpoints.
"""
from __future__ import annotations

from _apply import apply_batch

FE = "domain:frontend"


def t(slug, name, subtype, desc, **extra):
    node = {
        "id": f"technology:{slug}",
        "slug": slug,
        "name": name,
        "node_type": "technology",
        "node_subtype": subtype,
        "primary_domain": FE,
        "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


def c(slug, name, desc, domain=FE, **extra):
    node = {
        "id": f"concept:{slug}",
        "slug": slug,
        "name": name,
        "node_type": "concept",
        "primary_domain": domain,
        "short_description": desc,
        "lifecycle_status": extra.pop("lifecycle_status", "active"),
    }
    node.update(extra)
    return node


TECHNOLOGIES = [
    t("angular", "Angular", "framework",
      "A TypeScript-based web application framework developed by Google.",
      aliases=["angular2+"], official_url="https://angular.dev",
      documentation_url="https://angular.dev/overview",
      wikipedia_title="Angular (web framework)", wikidata_id="Q28925578"),
    t("svelte", "Svelte", "framework",
      "A compiler-based UI framework that shifts work to build time.",
      official_url="https://svelte.dev", documentation_url="https://svelte.dev/docs",
      wikipedia_title="Svelte", wikidata_id="Q55387160"),
    t("sveltekit", "SvelteKit", "framework",
      "The official application framework for building Svelte apps.",
      official_url="https://kit.svelte.dev",
      documentation_url="https://kit.svelte.dev/docs"),
    t("solidjs", "SolidJS", "library",
      "A declarative JavaScript UI library with fine-grained reactivity.",
      aliases=["solid"], official_url="https://www.solidjs.com",
      documentation_url="https://docs.solidjs.com/"),
    t("astro", "Astro", "framework",
      "A web framework for content-driven sites that ships zero JS by default.",
      official_url="https://astro.build", documentation_url="https://docs.astro.build/",
      wikipedia_title="Astro (web framework)"),
    t("remix", "Remix", "framework",
      "A full-stack React framework focused on web standards and data loading.",
      official_url="https://remix.run", documentation_url="https://remix.run/docs"),
    t("nuxt", "Nuxt", "framework",
      "An intuitive Vue framework with server-side rendering and routing.",
      aliases=["nuxt.js"], official_url="https://nuxt.com",
      documentation_url="https://nuxt.com/docs"),
    t("jquery", "jQuery", "library",
      "A fast, small JavaScript library that simplified DOM manipulation.",
      official_url="https://jquery.com", documentation_url="https://api.jquery.com/",
      wikipedia_title="JQuery", wikidata_id="Q230036", lifecycle_status="mature"),
    t("sass", "Sass", "standard",
      "A mature CSS extension language with variables, nesting, and mixins.",
      aliases=["scss"], official_url="https://sass-lang.com",
      documentation_url="https://sass-lang.com/documentation/",
      wikipedia_title="Sass (style sheet language)", wikidata_id="Q1572865"),
    t("webpack", "webpack", "developer_tool",
      "A static module bundler for modern JavaScript applications.",
      official_url="https://webpack.js.org",
      documentation_url="https://webpack.js.org/concepts/",
      wikipedia_title="Webpack", wikidata_id="Q28408320"),
    t("babel", "Babel", "developer_tool",
      "A JavaScript compiler that converts modern syntax for older environments.",
      official_url="https://babeljs.io", documentation_url="https://babeljs.io/docs/",
      wikipedia_title="Babel (transcompiler)"),
    t("webassembly", "WebAssembly", "standard",
      "A portable binary instruction format enabling near-native speed in browsers.",
      aliases=["wasm"], official_url="https://webassembly.org",
      documentation_url="https://developer.mozilla.org/en-US/docs/WebAssembly",
      wikipedia_title="WebAssembly", wikidata_id="Q28865341"),
    t("d3", "D3.js", "library",
      "A JavaScript library for producing dynamic, data-driven visualizations.",
      aliases=["d3.js"], official_url="https://d3js.org",
      documentation_url="https://d3js.org/getting-started",
      wikipedia_title="D3.js", wikidata_id="Q1050770"),
    t("threejs", "Three.js", "library",
      "A JavaScript library for creating 3D graphics in the browser with WebGL.",
      aliases=["three.js"], official_url="https://threejs.org",
      documentation_url="https://threejs.org/docs/",
      wikipedia_title="Three.js", wikidata_id="Q2535147"),
    t("storybook", "Storybook", "developer_tool",
      "A workshop for building, documenting, and testing UI components in isolation.",
      official_url="https://storybook.js.org",
      documentation_url="https://storybook.js.org/docs"),
]

CONCEPTS = [
    c("virtual-dom", "Virtual DOM",
      "An in-memory representation of the UI diffed against the real DOM to batch updates."),
    c("reactive-programming", "Reactive Programming",
      "A paradigm centered on data streams and the propagation of change.",
      domain="domain:software-engineering"),
    c("single-page-application", "Single-Page Application",
      "A web app that loads one page and updates content dynamically without full reloads.",
      aliases=["spa"]),
    c("progressive-web-app", "Progressive Web App",
      "A web app that uses modern capabilities to deliver app-like experiences.",
      aliases=["pwa"], wikipedia_title="Progressive web app"),
    c("responsive-design", "Responsive Web Design",
      "An approach that makes web pages render well across device sizes.",
      wikipedia_title="Responsive web design"),
    c("accessibility", "Web Accessibility",
      "Designing web content usable by people with disabilities.",
      aliases=["a11y"], wikipedia_title="Web accessibility"),
    c("dom", "Document Object Model",
      "A cross-platform interface treating an HTML/XML document as a tree of nodes.",
      aliases=["dom"], wikipedia_title="Document Object Model"),
    c("css-in-js", "CSS-in-JS",
      "A styling technique where CSS is composed using JavaScript."),
    c("hydration", "Hydration",
      "Attaching client-side interactivity to server-rendered HTML.",
      wikipedia_title="Hydration (web development)"),
    c("static-site-generation", "Static Site Generation",
      "Pre-rendering pages to static HTML at build time.", aliases=["ssg"]),
]

EDGES = [
    # domain membership
    *[{"source": n["id"], "target": FE, "relationship_type": "belongs_to_domain"}
      for n in TECHNOLOGIES + CONCEPTS if n["primary_domain"] == FE],
    # concepts that belong to other domains
    {"source": "concept:reactive-programming", "target": "domain:software-engineering",
     "relationship_type": "belongs_to_domain"},
    # language/runtime relationships
    {"source": "technology:angular", "target": "technology:typescript",
     "relationship_type": "written_in"},
    {"source": "technology:svelte", "target": "technology:javascript",
     "relationship_type": "written_in"},
    {"source": "technology:sveltekit", "target": "technology:svelte",
     "relationship_type": "built_on"},
    {"source": "technology:nuxt", "target": "technology:vue",
     "relationship_type": "built_on"},
    {"source": "technology:remix", "target": "technology:react",
     "relationship_type": "built_on"},
    {"source": "technology:astro", "target": "technology:vite",
     "relationship_type": "built_on"},
    {"source": "technology:d3", "target": "technology:javascript",
     "relationship_type": "written_in"},
    {"source": "technology:threejs", "target": "technology:javascript",
     "relationship_type": "written_in"},
    {"source": "technology:threejs", "target": "technology:webgpu",
     "relationship_type": "integrates_with"},
    # implements / supports concepts
    {"source": "technology:react", "target": "concept:virtual-dom",
     "relationship_type": "implements"},
    {"source": "technology:react", "target": "concept:component-architecture",
     "relationship_type": "implements"},
    {"source": "technology:angular", "target": "concept:component-architecture",
     "relationship_type": "implements"},
    {"source": "technology:svelte", "target": "concept:reactive-programming",
     "relationship_type": "implements"},
    {"source": "technology:solidjs", "target": "concept:reactive-programming",
     "relationship_type": "implements"},
    {"source": "technology:nextjs", "target": "concept:server-side-rendering",
     "relationship_type": "supports"},
    {"source": "technology:nextjs", "target": "concept:static-site-generation",
     "relationship_type": "supports"},
    {"source": "technology:astro", "target": "concept:static-site-generation",
     "relationship_type": "supports"},
    {"source": "technology:nextjs", "target": "concept:hydration",
     "relationship_type": "supports"},
    {"source": "technology:sass", "target": "technology:css",
     "relationship_type": "built_on"},
    {"source": "technology:tailwind", "target": "technology:css",
     "relationship_type": "built_on"},
    {"source": "technology:webpack", "target": "concept:single-page-application",
     "relationship_type": "used_for"},
    {"source": "technology:react", "target": "concept:single-page-application",
     "relationship_type": "used_for"},
    # concept enablement
    {"source": "concept:virtual-dom", "target": "concept:component-architecture",
     "relationship_type": "enables"},
    # alternatives & combos
    {"source": "technology:angular", "target": "technology:react",
     "relationship_type": "alternative_to"},
    {"source": "technology:vue", "target": "technology:react",
     "relationship_type": "alternative_to"},
    {"source": "technology:svelte", "target": "technology:react",
     "relationship_type": "alternative_to"},
    {"source": "technology:solidjs", "target": "technology:react",
     "relationship_type": "alternative_to"},
    {"source": "technology:webpack", "target": "technology:vite",
     "relationship_type": "alternative_to"},
    {"source": "technology:babel", "target": "technology:typescript",
     "relationship_type": "commonly_used_with"},
    {"source": "technology:storybook", "target": "technology:react",
     "relationship_type": "commonly_used_with"},
    {"source": "technology:tailwind", "target": "technology:react",
     "relationship_type": "commonly_used_with"},
    {"source": "technology:d3", "target": "concept:responsive-design",
     "relationship_type": "related_to"},
]

if __name__ == "__main__":
    apply_batch("frontend", concepts=CONCEPTS, technologies=TECHNOLOGIES, edges=EDGES)
