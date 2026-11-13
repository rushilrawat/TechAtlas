"""Create crawler-readable route pages and PNG social cards for the static deploy."""
from __future__ import annotations

import html
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
GRAPH = ROOT / "frontend" / "public" / "api" / "v1" / "graph.json"
DETAILS = ROOT / "frontend" / "public" / "api" / "v1" / "nodes"
SITE = "https://rushilrawat.github.io/TechAtlas"
SHELL_TITLE = "<title>TechAtlas — the technology knowledge graph</title>"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default(size=size)


def card(title: str, description: str, kind: str, color: str, output: Path) -> None:
    image = Image.new("RGB", (1200, 630), "#0b0e14")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 48, 1152, 582), radius=30, fill="#111822", outline="#344056",
                           width=2)
    draw.ellipse((810, -180, 1330, 340), fill=color)
    draw.ellipse((860, -125, 1290, 285), fill="#111822")
    draw.ellipse((980, 165, 1070, 255), fill=color)
    draw.text((92, 91), "TECHATLAS  /  THE TECHNOLOGY KNOWLEDGE GRAPH", font=font(21, True),
              fill="#9eaec5")
    draw.text((92, 186), kind.upper(), font=font(23, True), fill=color)
    title = textwrap.shorten(title, width=34, placeholder="…")
    draw.text((92, 236), title, font=font(60, True), fill="#f2f5fc")
    lines = textwrap.wrap(description, width=61)[:3]
    for i, line in enumerate(lines):
        draw.text((92, 345 + i * 42), line, font=font(26), fill="#c7d2e4")
    draw.line((92, 524, 1108, 524), fill="#344056", width=2)
    draw.text((92, 539), "Explore the connections on TechAtlas", font=font(22, True),
              fill="#dbe5f5")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


RELATION_LIMIT = 40
JSONLD_TYPE = {
    "technology": "SoftwareApplication",
    "concept": "DefinedTerm",
    "domain": "DefinedTermSet",
}
KIND_LABEL = {"technology": "technology", "concept": "concept", "domain": "domain"}


def body_fallback(node: dict, detail: dict, domain_name: str | None, route_for) -> str:
    """Plain HTML inside #root so crawlers and link unfurlers see real content.

    React's createRoot replaces it on mount, so users never see it.
    """
    parts = [f'<main class="seo-fallback"><h1>{html.escape(node["label"])}</h1>']
    kind = KIND_LABEL.get(node["node_type"], node["node_type"])
    if domain_name and node["node_type"] != "domain":
        parts.append(f"<p>{html.escape(kind.capitalize())} in {html.escape(domain_name)}.</p>")
    if detail.get("short_description"):
        parts.append(f'<p>{html.escape(detail["short_description"])}</p>')
    neighbors = detail.get("neighbors") or []
    if neighbors:
        parts.append("<h2>Connections</h2><ul>")
        for nb in neighbors[:RELATION_LIMIT]:
            other = nb.get("node") or {}
            if not other.get("slug"):
                continue
            rel = nb.get("relationship_type", "related_to").replace("_", " ")
            href = route_for(other)
            parts.append(f'<li>{html.escape(rel)}: <a href="{html.escape(href)}">'
                         f'{html.escape(other.get("label", other["slug"]))}</a></li>')
        parts.append("</ul>")
    parts.append(f'<p><a href="{SITE}/">Explore the full TechAtlas map</a></p></main>')
    return "".join(parts)


def json_ld(node: dict, detail: dict, url: str, domain: dict | None) -> str:
    data: dict = {
        "@context": "https://schema.org",
        "@type": JSONLD_TYPE.get(node["node_type"], "Thing"),
        "name": node["label"],
        "url": url,
    }
    if detail.get("short_description"):
        data["description"] = detail["short_description"]
    if detail.get("official_url"):
        data["sameAs"] = [detail["official_url"]]
    if node["node_type"] == "technology":
        data["applicationCategory"] = "DeveloperApplication"
    crumbs = [{"@type": "ListItem", "position": 1, "name": "TechAtlas", "item": f"{SITE}/"}]
    if domain and node["node_type"] != "domain":
        crumbs.append({"@type": "ListItem", "position": 2, "name": domain["label"],
                       "item": f'{SITE}/domain/{domain["slug"]}'})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1, "name": node["label"],
                   "item": url})
    breadcrumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList",
                   "itemListElement": crumbs}
    payload = [data, breadcrumbs]
    # "</" cannot appear inside a script element.
    return ('<script type="application/ld+json">'
            + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/") + "</script>")


def social_meta(title: str, description: str, url: str, image: str) -> list[str]:
    return [
        f'<link rel="canonical" href="{html.escape(url)}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="TechAtlas">',
        f'<meta property="og:title" content="{html.escape(title)}">',
        f'<meta property="og:description" content="{html.escape(description)}">',
        f'<meta property="og:url" content="{html.escape(url)}">',
        f'<meta property="og:image" content="{html.escape(image)}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{html.escape(title)}">',
        f'<meta name="twitter:description" content="{html.escape(description)}">',
        f'<meta name="twitter:image" content="{html.escape(image)}">',
    ]


def replace_description(page: str, description: str) -> str:
    start = page.find('<meta\n      name="description"')
    if start == -1:
        start = page.find('<meta name="description"')
    if start == -1:
        return page
    end = page.find(">", start) + 1
    tag = f'<meta name="description" content="{html.escape(description)}">'
    return page[:start] + tag + page[end:]


def main() -> None:
    graph = json.loads(GRAPH.read_text())
    shell = (DIST / "index.html").read_text()
    by_id = {n["id"]: n for n in graph["nodes"]}

    def route_for(n: dict) -> str:
        return f'{SITE}/{n["node_type"]}/{n["slug"]}'

    urls: list[str] = [f"{SITE}/", f"{SITE}/about"]
    count = 0
    for node in graph["nodes"]:
        if node["node_type"] not in {"domain", "technology", "concept"}:
            continue
        route = f'{node["node_type"]}/{node["slug"]}'
        detail_path = DETAILS / f'{node["slug"]}.json'
        detail = json.loads(detail_path.read_text()) if detail_path.exists() else {}
        domain = by_id.get(node.get("primary_domain") or "")
        domain_name = domain["label"] if domain else None
        description = (detail.get("short_description")
                       or f'Explore {node["label"]} and its connections in TechAtlas.')
        if node["node_type"] == "domain":
            title = f'{node["label"]}: the map of its technologies and concepts · TechAtlas'
        elif domain_name:
            title = f'{node["label"]} — how it connects across {domain_name} · TechAtlas'
        else:
            title = f'{node["label"]} · TechAtlas'
        image_name = f'{node["node_type"]}-{node["slug"]}.png'
        card(node["label"], description, node["node_type"], node["color"], DIST / "og" / image_name)
        url = f"{SITE}/{route}"
        meta = social_meta(title, description, url, f"{SITE}/og/{image_name}")
        meta.append(json_ld(node, detail, url, domain))
        # Pages serve /route/ (a folder); restore the app's canonical /route path.
        meta.append('<script>if(location.pathname.endsWith("/")) history.replaceState(null,"",'
                    'location.pathname.slice(0,-1)+location.search)</script>')
        page = shell.replace(SHELL_TITLE, f"<title>{html.escape(title)}</title>")
        page = replace_description(page, description)
        page = page.replace("</head>", "\n".join(meta) + "\n</head>")
        fallback = body_fallback(node, detail, domain_name, route_for)
        page = page.replace('<div id="root"></div>', f'<div id="root">{fallback}</div>')
        output = DIST / route / "index.html"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(page)
        urls.append(url)
        count += 1

    # Home page social card + meta (the 404.html SPA fallback is copied from this file later).
    home_desc = ("Explore the modern software engineering ecosystem as one connected map "
                 "of domains, concepts, and technologies.")
    home_meta = social_meta("TechAtlas — the technology knowledge graph", home_desc,
                            f"{SITE}/", f"{SITE}/og/home.png")
    (DIST / "index.html").write_text(shell.replace("</head>", "\n".join(home_meta) + "\n</head>"))
    card("TechAtlas", "One connected map of software engineering: domains, concepts and "
         "technologies, and how they relate.", "the technology knowledge graph", "#7aa2f7",
         DIST / "og" / "home.png")

    about = DIST / "about" / "index.html"
    about.parent.mkdir(parents=True, exist_ok=True)
    about.write_text(shell.replace(SHELL_TITLE, "<title>About the data · TechAtlas</title>"))

    # sitemap.xml + robots.txt
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{html.escape(u)}</loc></url>" for u in urls]
    sitemap.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(sitemap) + "\n")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    print(f"Built {count} social preview pages, the About page, sitemap.xml ({len(urls)} URLs) "
          "and robots.txt")


if __name__ == "__main__":
    main()
