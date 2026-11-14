"""Wikipedia summary service with a two-tier, version-keyed cache (Phase 1C).

This is the ONLY component that talks to Wikipedia. It fetches a short summary for a
node that carries a curated ``wikipedia_title`` and caches it:

  - in-process LRU for the hot path within a running server, and
  - on disk at ``data/cache/wikipedia/<dataset_version>/<slug>.json`` so summaries
    survive restarts and are namespaced per dataset version (requirement 2.8).

Design rules enforced here (requirements 2.1-2.8):
  - resolve strictly by the curated ``wikipedia_title`` — never derive it from the
    node name;
  - never fetch when the node has no ``wikipedia_title``;
  - degrade gracefully: any fetch error/timeout returns ``None`` (the caller renders
    the curated fields + outbound link, no hard error);
  - record attribution (source url + license) alongside the extract;
  - remember failed fetches for a while (a 404 for a day, a timeout or 5xx for five
    minutes) so a broken title does not cost a request on every view;
  - re-check the age of in-process entries, so a stale summary served after a failed
    refetch is retried once the failure window passes.

It sits behind its own narrow boundary (Option A), uses no graph database, and does
not change existing API shapes — the summary is attached as an optional field.
"""
from __future__ import annotations

import calendar
import json
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CACHE_ROOT = DATA_DIR / "cache" / "wikipedia"

# Wikipedia text is licensed CC BY-SA (plus GFDL); record it for attribution (2.7).
WIKIPEDIA_LICENSE = "CC BY-SA 4.0"
REST_SUMMARY = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"

# How long a failed fetch is remembered before the title is tried again.
MISS_TTL_NOT_FOUND = 24 * 3600   # the page does not exist (404/410) or has no extract
MISS_TTL_ERROR = 5 * 60          # timeout, network error or other non-200


@dataclass(frozen=True)
class NodeSummary:
    extract: str
    source_url: str
    lang: str
    fetched_at: str  # ISO-8601 UTC
    license: str


class SummaryService:
    def __init__(
        self,
        dataset_version: str,
        *,
        lang: str = "en",
        ttl_days: int = 30,
        cache_root: Path = CACHE_ROOT,
        lru_size: int = 512,
        timeout_seconds: float = 3.0,
        client: httpx.Client | None = None,
        clock=time.time,
    ) -> None:
        self._version = dataset_version
        self._lang = lang
        self._ttl_seconds = ttl_days * 86400
        self._cache_dir = cache_root / dataset_version
        self._lru_size = lru_size
        self._timeout = timeout_seconds
        # Injectable client so tests never hit the network.
        self._client = client
        self._lru: OrderedDict[str, NodeSummary] = OrderedDict()
        # slug -> time until which a failed fetch is not retried (negative cache).
        self._misses: dict[str, float] = {}
        self._clock = clock

    # ---- public API ----------------------------------------------------------

    def get(self, slug: str, wikipedia_title: str | None) -> NodeSummary | None:
        """Return a summary for a node, or ``None`` if unavailable.

        Order: in-process LRU -> on-disk cache -> live fetch. Any failure or a null
        ``wikipedia_title`` yields ``None`` without raising (requirement 2.2, 2.6).
        """
        if not wikipedia_title:
            return None

        cached = self._lru_get(slug)
        backing_off = self._recently_failed(slug)
        if cached is not None and (backing_off or not self._is_stale(cached)):
            return cached

        disk = self._disk_get(slug)
        if disk is not None and not self._is_stale(disk):
            self._lru_put(slug, disk)
            return disk
        if backing_off:
            return disk or cached

        fetched, not_found = self._fetch(wikipedia_title)
        if fetched is not None:
            self._misses.pop(slug, None)
            self._disk_put(slug, fetched)
            self._lru_put(slug, fetched)
            return fetched

        # Fetch failed: remember it, then fall back to a stale copy (stale-while-error).
        self._misses[slug] = self._clock() + (MISS_TTL_NOT_FOUND if not_found else MISS_TTL_ERROR)
        stale = disk or cached
        if stale is not None:
            self._lru_put(slug, stale)
        return stale

    def _recently_failed(self, slug: str) -> bool:
        until = self._misses.get(slug)
        if until is None:
            return False
        if self._clock() >= until:
            del self._misses[slug]
            return False
        return True

    # ---- LRU -----------------------------------------------------------------

    def _lru_get(self, slug: str) -> NodeSummary | None:
        if slug in self._lru:
            self._lru.move_to_end(slug)
            return self._lru[slug]
        return None

    def _lru_put(self, slug: str, summary: NodeSummary) -> None:
        self._lru[slug] = summary
        self._lru.move_to_end(slug)
        while len(self._lru) > self._lru_size:
            self._lru.popitem(last=False)

    # ---- disk ----------------------------------------------------------------

    def _path(self, slug: str) -> Path:
        return self._cache_dir / f"{slug}.json"

    def _disk_get(self, slug: str) -> NodeSummary | None:
        path = self._path(slug)
        if not path.exists():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return NodeSummary(**raw)
        except (OSError, ValueError, TypeError):
            return None

    def _disk_put(self, slug: str, summary: NodeSummary) -> None:
        try:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
            self._path(slug).write_text(
                json.dumps(asdict(summary), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError:
            # A cache write failure must never break the request path.
            pass

    def _is_stale(self, summary: NodeSummary) -> bool:
        # ttl <= 0 means "always refetch" (treat every cached entry as stale).
        if self._ttl_seconds <= 0:
            return True
        try:
            # timegm treats the parsed struct as UTC (fetched_at is written with gmtime);
            # time.mktime would wrongly assume local time and skew staleness by the
            # machine UTC offset.
            fetched = calendar.timegm(time.strptime(summary.fetched_at, "%Y-%m-%dT%H:%M:%SZ"))
        except (ValueError, TypeError):
            return True
        return (self._clock() - fetched) > self._ttl_seconds

    # ---- fetch ---------------------------------------------------------------

    def _fetch(self, wikipedia_title: str) -> tuple[NodeSummary | None, bool]:
        """Return (summary, not_found). not_found marks a definitive miss (404/410 or an
        empty extract) as opposed to a transient error."""
        # The REST summary endpoint takes the page title with spaces as underscores.
        title = wikipedia_title.replace(" ", "_")
        url = REST_SUMMARY.format(lang=self._lang, title=title)
        try:
            if self._client is not None:
                resp = self._client.get(url, timeout=self._timeout)
            else:
                resp = httpx.get(
                    url,
                    timeout=self._timeout,
                    follow_redirects=True,
                    headers={"User-Agent": "TechAtlas/0.2 (knowledge graph)"},
                )
            if resp.status_code != 200:
                return None, resp.status_code in (404, 410)
            data = resp.json()
        except (httpx.HTTPError, ValueError):
            return None, False

        extract = (data.get("extract") or "").strip()
        if not extract:
            return None, True
        source_url = (
            data.get("content_urls", {}).get("desktop", {}).get("page")
            or f"https://{self._lang}.wikipedia.org/wiki/{title}"
        )
        return NodeSummary(
            extract=extract,
            source_url=source_url,
            lang=self._lang,
            fetched_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self._clock())),
            license=WIKIPEDIA_LICENSE,
        ), False
