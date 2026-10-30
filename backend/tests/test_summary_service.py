"""Tests for the Phase 1C SummaryService (backend/app/summary_service.py).

No live network: a fake httpx-like client is injected. Covers cache hit/miss,
on-disk persistence, version-namespaced invalidation, timeout -> None, and the
null-title short-circuit.
"""
from __future__ import annotations

import json

import httpx
import pytest

from app.summary_service import SummaryService


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class FakeClient:
    """Records every GET; returns a canned summary payload (or raises/errors)."""

    def __init__(self, *, status_code: int = 200, raise_error: bool = False):
        self.calls = 0
        self._status = status_code
        self._raise = raise_error

    def get(self, url: str, timeout: float | None = None):
        self.calls += 1
        if self._raise:
            raise httpx.ConnectTimeout("boom")
        return FakeResponse(
            self._status,
            {
                "extract": "Python is a high-level programming language.",
                "content_urls": {
                    "desktop": {"page": "https://en.wikipedia.org/wiki/Python_(programming_language)"}
                },
            },
        )


def _svc(tmp_path, client, version="0.2.0", ttl_days=30) -> SummaryService:
    return SummaryService(
        version, lang="en", ttl_days=ttl_days, cache_root=tmp_path, client=client
    )


def test_null_title_never_fetches(tmp_path):
    client = FakeClient()
    svc = _svc(tmp_path, client)
    assert svc.get("python", None) is None
    assert client.calls == 0


def test_fetch_then_lru_hit(tmp_path):
    client = FakeClient()
    svc = _svc(tmp_path, client)
    first = svc.get("python", "Python (programming language)")
    assert first is not None
    assert "high-level" in first.extract
    assert first.license == "CC BY-SA 4.0"
    assert first.source_url.startswith("https://en.wikipedia.org/")
    # second call served from the in-process LRU — no extra fetch
    second = svc.get("python", "Python (programming language)")
    assert second == first
    assert client.calls == 1


def test_persists_to_disk_and_survives_new_instance(tmp_path):
    client1 = FakeClient()
    svc1 = _svc(tmp_path, client1)
    svc1.get("python", "Python (programming language)")
    assert client1.calls == 1
    # file written under the version namespace
    path = tmp_path / "0.2.0" / "python.json"
    assert path.exists()
    stored = json.loads(path.read_text())
    assert stored["extract"].startswith("Python is")

    # a fresh instance (cold LRU) reads disk instead of fetching
    client2 = FakeClient()
    svc2 = _svc(tmp_path, client2)
    got = svc2.get("python", "Python (programming language)")
    assert got is not None
    assert client2.calls == 0


def test_version_namespacing_isolates_caches(tmp_path):
    client_a = FakeClient()
    _svc(tmp_path, client_a, version="0.2.0").get("python", "Python (programming language)")
    # a different dataset version has its own namespace -> must fetch again
    client_b = FakeClient()
    svc_b = _svc(tmp_path, client_b, version="0.3.0")
    svc_b.get("python", "Python (programming language)")
    assert client_b.calls == 1
    assert (tmp_path / "0.2.0" / "python.json").exists()
    assert (tmp_path / "0.3.0" / "python.json").exists()


def test_timeout_returns_none(tmp_path):
    client = FakeClient(raise_error=True)
    svc = _svc(tmp_path, client)
    assert svc.get("python", "Python (programming language)") is None


def test_non_200_returns_none(tmp_path):
    client = FakeClient(status_code=404)
    svc = _svc(tmp_path, client)
    assert svc.get("python", "Python (programming language)") is None


def test_stale_disk_entry_is_refetched(tmp_path):
    # Write with ttl so short that any entry is immediately stale.
    client1 = FakeClient()
    svc1 = _svc(tmp_path, client1, ttl_days=0)
    svc1.get("python", "Python (programming language)")
    assert client1.calls == 1

    # new instance, ttl 0 => disk entry considered stale => refetch
    client2 = FakeClient()
    svc2 = _svc(tmp_path, client2, ttl_days=0)
    svc2.get("python", "Python (programming language)")
    assert client2.calls == 1


def test_stale_disk_served_when_refetch_fails(tmp_path):
    # Seed a disk entry (fresh fetch).
    good = FakeClient()
    _svc(tmp_path, good, ttl_days=0).get("python", "Python (programming language)")
    # Now the entry is stale AND the network fails -> stale-while-error returns disk.
    broken = FakeClient(raise_error=True)
    svc = _svc(tmp_path, broken, ttl_days=0)
    got = svc.get("python", "Python (programming language)")
    assert got is not None
    assert "high-level" in got.extract


@pytest.mark.parametrize("title", ["", None])
def test_falsy_titles_short_circuit(tmp_path, title):
    client = FakeClient()
    svc = _svc(tmp_path, client)
    assert svc.get("python", title) is None
    assert client.calls == 0
