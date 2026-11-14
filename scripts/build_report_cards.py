"""Build shareable report-card pages for the pre-computed Repo X-Ray example scans.

For every example in frontend/src/data/exampleScans.json this writes, into frontend/dist:

  report/<slug>/index.html   crawler-readable page with Open Graph tags; opens the app on
                             the example with its report card (?xray=<slug>&card=1)
  report/<slug>/badge.svg    "Mapped by TechAtlas | N technologies" README badge
  og/report-<slug>.png       1200x630 social card ("next.js uses 16 technologies across ...")

Run after `npm run build` and scripts/build_share_pages.py (it appends to sitemap.xml).
The grouping mirrors frontend/src/report/reportCard.ts: detections by top-level field.
"""
from __future__ import annotations

import html
import json
from pathlib import Path
from urllib.parse import urlparse

from build_share_pages import SHELL_TITLE, SITE, font, replace_description, social_meta
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
PUBLIC = ROOT / "frontend" / "public"
INDEX = ROOT / "frontend" / "src" / "data" / "exampleScans.json"


def top_level(domain_id: str, domains: dict[str, dict]) -> str:
    current = domain_id
    for _ in range(4):
        parent = (domains.get(current) or {}).get("parent_id")
        if not parent:
            break
        current = parent
    return current


def build_report(scan: dict, nodes: dict[str, dict], domains: dict[str, dict]) -> dict:
    fields: dict[str, dict] = {}
    seen: set[str] = set()
    for det in scan["detections"]:
        node = nodes.get(det["node_id"])
        if not node or node["node_type"] == "domain" or node["id"] in seen:
            continue
        seen.add(node["id"])
        top = top_level(node["primary_domain"], domains)
        dom = domains.get(top) or {}
        field = fields.setdefault(top, {"id": top, "name": dom.get("name", "Other"),
                                        "color": dom.get("color", "#8a94a6"), "nodes": []})
        field["nodes"].append(node)
    for f in fields.values():
        f["nodes"].sort(key=lambda n: (n["node_type"] != "technology", -(n.get("size") or 0),
                                       n["label"]))
    ordered = sorted(fields.values(), key=lambda f: (-len(f["nodes"]), f["name"]))
    repo = f'{scan["repository"]["owner"]}/{scan["repository"]["name"]}'
    techs = sum(1 for n in nodes.values() if n["id"] in seen and n["node_type"] == "technology")
    return {"repo": repo, "technologies": techs, "concepts": len(seen) - techs, "fields": ordered}


def headline(r: dict) -> str:
    name = r["repo"].split("/")[1]
    t, f = r["technologies"], len(r["fields"])
    return (f"{name} uses {t} {'technology' if t == 1 else 'technologies'} "
            f"across {f} {'field' if f == 1 else 'fields'}")


def card_png(r: dict, output: Path) -> None:
    image = Image.new("RGB", (1200, 630), "#0b0e14")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 48, 1152, 582), radius=30, fill="#111822", outline="#344056",
                           width=2)
    draw.text((92, 88), "TECHATLAS  /  REPO REPORT CARD", font=font(21, True), fill="#9eaec5")
    repo = r["repo"] if len(r["repo"]) <= 34 else r["repo"][:33] + "…"
    draw.text((92, 140), repo, font=font(56, True), fill="#f2f5fc")
    draw.text((92, 222), headline(r), font=font(30), fill="#c7d2e4")
    # Stacked bar of fields.
    total = sum(len(f["nodes"]) for f in r["fields"]) or 1
    x, y0, y1, width = 92, 290, 312, 1016
    for f in r["fields"]:
        w = max(6, round(width * len(f["nodes"]) / total))
        draw.rectangle((x, y0, min(x + w - 3, 92 + width), y1), fill=f["color"])
        x += w
    # Top fields with their leading technologies.
    for i, f in enumerate(r["fields"][:4]):
        y = 342 + i * 44
        draw.ellipse((92, y + 8, 108, y + 24), fill=f["color"])
        label = f'{f["name"]}  ·  {len(f["nodes"])}'
        draw.text((122, y), label if len(label) <= 40 else label[:39] + "…", font=font(24, True),
                  fill="#dbe5f5")
        names = ", ".join(n["label"] for n in f["nodes"][:4])
        if len(names) > 40:
            names = names[:39] + "…"
        draw.text((660, y + 2), names, font=font(22), fill="#9eaec5")
    draw.line((92, 524, 1108, 524), fill="#344056", width=2)
    draw.text((92, 539), "See the whole stack on the TechAtlas map", font=font(22, True),
              fill="#dbe5f5")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


def badge_svg(count: int) -> str:
    left, right = "Mapped by TechAtlas", f"{count} technologies"
    lw, rw = 7 * len(left) + 12, 7 * len(right) + 12
    w = lw + rw
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img" '
        f'aria-label="{left}: {right}"><title>{left}: {right}</title>'
        f'<clipPath id="r"><rect width="{w}" height="20" rx="3"/></clipPath>'
        f'<g clip-path="url(#r)"><rect width="{lw}" height="20" fill="#1d2433"/>'
        f'<rect x="{lw}" width="{rw}" height="20" fill="#7aa2f7"/></g>'
        '<g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">'
        f'<text x="{lw / 2}" y="14" fill="#fff">{left}</text>'
        f'<text x="{lw + rw / 2}" y="14" fill="#0b0e14">{right}</text></g></svg>\n'
    )


def body_fallback(r: dict, url: str) -> str:
    parts = [f'<main class="seo-fallback"><h1>{html.escape(r["repo"])}: report card</h1>',
             f"<p>{html.escape(headline(r))}.</p>"]
    for f in r["fields"]:
        parts.append(f'<h2>{html.escape(f["name"])}</h2><ul>')
        for n in f["nodes"]:
            parts.append(f'<li><a href="{SITE}/{n["node_type"]}/{n["slug"]}">'
                         f'{html.escape(n["label"])}</a></li>')
        parts.append("</ul>")
    parts.append(f'<p><a href="{html.escape(url)}">Open it on the TechAtlas map</a></p></main>')
    return "".join(parts)


def main() -> None:
    graph = json.loads((PUBLIC / "api" / "v1" / "graph.json").read_text())
    domains = {d["id"]: d for d in json.loads((PUBLIC / "api" / "v1" / "domains.json").read_text())}
    nodes = {n["id"]: n for n in graph["nodes"]}
    shell = (DIST / "index.html").read_text()
    examples = json.loads(INDEX.read_text())
    urls = []
    for ex in examples:
        slug = ex["slug"]
        scan = json.loads((PUBLIC / "example-scans" / f"{slug}.json").read_text())
        r = build_report(scan, nodes, domains)
        url = f"{SITE}/report/{slug}/"
        title = f'{r["repo"]}: report card · TechAtlas'
        desc = f'{headline(r)}. {ex.get("tagline", "")}'.strip()
        card_png(r, DIST / "og" / f"report-{slug}.png")
        meta = social_meta(title, desc, url, f"{SITE}/og/report-{slug}.png")
        # Open the app on this example with the card showing. Runs before the app's module.
        app = f"{urlparse(SITE).path.rstrip('/')}/?xray={slug}&card=1"
        meta.append(f'<script>history.replaceState(null,"",{json.dumps(app)})</script>')
        page = shell.replace(SHELL_TITLE, f"<title>{html.escape(title)}</title>")
        page = replace_description(page, desc)
        page = page.replace("</head>", "\n".join(meta) + "\n</head>")
        page = page.replace('<div id="root"></div>',
                            f'<div id="root">{body_fallback(r, url)}</div>')
        out = DIST / "report" / slug
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(page)
        (out / "badge.svg").write_text(badge_svg(r["technologies"]))
        urls.append(url)

    sitemap = DIST / "sitemap.xml"
    if sitemap.exists():
        extra = "".join(f"  <url><loc>{html.escape(u)}</loc></url>\n" for u in urls)
        sitemap.write_text(sitemap.read_text().replace("</urlset>", extra + "</urlset>"))
    print(f"Built {len(urls)} report cards (pages, social images and badges)")


if __name__ == "__main__":
    main()
