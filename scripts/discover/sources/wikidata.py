"""Wikidata discovery source (SPARQL).

Queries the public Wikidata SPARQL endpoint for entities that are instances/subclasses
of a target class (programming language, framework, library, ...), pulling only
STRUCTURED, source-backed facts: the wikidata_id, English label, description, official
website (P856), and the English Wikipedia sitelink title.

Only entity classes that map cleanly to the project's node_subtype enum are queried, so
candidates arrive pre-classified by the source where possible (requirement 1.3). Any
network/parse error yields [] — never a fabricated candidate (requirement 1.4).

Offline-safe + testable: an httpx-like client is injected; CI uses a recorded fixture.
"""
from __future__ import annotations

import time

from .common import RawCandidate

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
_USER_AGENT = "TechAtlas/0.2 (discovery-assist; structured candidate discovery)"

# Wikidata class QID -> project node_subtype. Only cleanly-mapping classes appear here
# (requirement 1.3 / 3.2). The key is the QID; the label is for readability.
CLASS_TO_SUBTYPE: dict[str, tuple[str, str]] = {
    "Q9143": ("programming language", "programming_language"),
    "Q271680": ("software framework", "framework"),
    "Q1330354": ("web framework", "framework"),
    "Q188860": ("software library", "library"),
    "Q176165": ("database management system", "database"),
    "Q55680343": ("version control system", "developer_tool"),
    "Q9135": ("operating system", "operating_system"),
    "Q193424": ("game engine", "engine"),
}


def _sparql(class_qid: str, limit: int) -> str:
    """SPARQL selecting instances/subclasses of a class with label, description,
    official website, and English Wikipedia article title."""
    return f"""
SELECT ?item ?itemLabel ?itemDescription ?website ?article WHERE {{
  ?item wdt:P31/wdt:P279* wd:{class_qid} .
  OPTIONAL {{ ?item wdt:P856 ?website . }}
  OPTIONAL {{
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
""".strip()


def _wikipedia_title(article_url: str | None) -> str | None:
    if not article_url:
        return None
    # article_url like https://en.wikipedia.org/wiki/Python_(programming_language)
    marker = "/wiki/"
    idx = article_url.find(marker)
    if idx == -1:
        return None
    from urllib.parse import unquote

    return unquote(article_url[idx + len(marker):]).replace("_", " ")


def _qid_from_uri(uri: str) -> str | None:
    # http://www.wikidata.org/entity/Q28865 -> Q28865
    tail = uri.rsplit("/", 1)[-1]
    return tail if tail.startswith("Q") and tail[1:].isdigit() else None


def _parse(binding_rows: list[dict], subtype: str, class_qid: str) -> list[RawCandidate]:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    out: list[RawCandidate] = []
    for row in binding_rows:
        item_uri = row.get("item", {}).get("value", "")
        qid = _qid_from_uri(item_uri)
        label = row.get("itemLabel", {}).get("value")
        if not qid or not label:
            continue
        # Wikidata returns the QID as the label when no label exists — skip those.
        if label == qid:
            continue
        out.append(
            RawCandidate(
                name=label,
                source="wikidata",
                source_ref=f"https://www.wikidata.org/wiki/{qid}",
                retrieved_at=now,
                wikidata_id=qid,
                wikipedia_title=_wikipedia_title(row.get("article", {}).get("value")),
                official_url=row.get("website", {}).get("value"),
                description=row.get("itemDescription", {}).get("value"),
                subtype_hint=subtype,
                extra={"wikidata_class_qid": class_qid, "wikidata_subtype": subtype},
            )
        )
    return out


def fetch(
    *,
    client,
    classes: list[str] | None = None,
    limit_per_class: int = 200,
    timeout: float = 30.0,
) -> list[RawCandidate]:
    """Fetch candidates for the given class QIDs (default: all mapped classes).

    Returns a flat list of RawCandidate; any error for a class yields nothing for that
    class rather than raising, so a single failing query never aborts discovery.
    """
    targets = classes or list(CLASS_TO_SUBTYPE)
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/sparql-results+json"}
    results: list[RawCandidate] = []
    for qid in targets:
        mapping = CLASS_TO_SUBTYPE.get(qid)
        if mapping is None:
            continue
        _, subtype = mapping
        try:
            resp = client.get(
                SPARQL_ENDPOINT,
                params={"query": _sparql(qid, limit_per_class), "format": "json"},
                headers=headers,
                timeout=timeout,
            )
            if resp.status_code != 200:
                continue
            bindings = resp.json().get("results", {}).get("bindings", [])
        except Exception:  # noqa: BLE001 — sources must never raise into discovery
            continue
        results.extend(_parse(bindings, subtype, qid))
    return results
