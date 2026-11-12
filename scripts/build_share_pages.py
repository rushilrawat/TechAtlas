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


def main() -> None:
    graph = json.loads(GRAPH.read_text())
    shell = (DIST / "index.html").read_text()
    count = 0
    for node in graph["nodes"]:
        if node["node_type"] not in {"domain", "technology"}:
            continue
        route = f'{node["node_type"]}/{node["slug"]}'
        detail_path = DETAILS / f'{node["slug"]}.json'
        detail = json.loads(detail_path.read_text()) if detail_path.exists() else {}
        description = (detail.get("short_description")
                       or f'Explore {node["label"]} and its connections in TechAtlas.')
        title = node["label"]
        image_name = f'{node["node_type"]}-{node["slug"]}.png'
        card(title, description, node["node_type"], node["color"], DIST / "og" / image_name)
        url = f"{SITE}/{route}"
        meta = "\n".join([
            f'<link rel="canonical" href="{html.escape(url)}">',
            '<meta property="og:type" content="website">',
            f'<meta property="og:title" content="{html.escape(title)} · TechAtlas">',
            f'<meta property="og:description" content="{html.escape(description)}">',
            f'<meta property="og:url" content="{html.escape(url)}">',
            f'<meta property="og:image" content="{SITE}/og/{html.escape(image_name)}">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">',
            # Pages serve /route/ (a folder); restore the app's canonical /route path.
            '<script>if(location.pathname.endsWith("/")) history.replaceState(null,"",'
            'location.pathname.slice(0,-1)+location.search)</script>',
        ])
        page = shell.replace(SHELL_TITLE, f"<title>{html.escape(title)} · TechAtlas</title>")
        page = page.replace("</head>", f"{meta}\n</head>")
        output = DIST / route / "index.html"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(page)
        count += 1
    about = DIST / "about" / "index.html"
    about.parent.mkdir(parents=True, exist_ok=True)
    about.write_text(shell.replace(SHELL_TITLE, "<title>About the data · TechAtlas</title>"))
    print(f"Built {count} social preview pages and the About page")


if __name__ == "__main__":
    main()
