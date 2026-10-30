"""Phase 1.5D production safeguard tests (rate limit, concurrency, deadline, store,
CORS, token, error responses). No live network."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.scanner.models import RepoScan, ScanCoverage, ScanRepository, ScanSummary  # noqa: E402
from app.scanner.safeguards import (  # noqa: E402
    ConcurrencyGate,
    RateLimiter,
    ScanStore,
    client_ip,
)


def _scan(scan_id="s1"):
    return RepoScan(
        scan_id=scan_id, status="completed", mapping_version="0.2.0",
        repository=ScanRepository(owner="o", name="r", url="https://github.com/o/r",
                                  default_branch="main", commit_sha="a" * 40),
        summary=ScanSummary(), coverage=ScanCoverage(),
    )


# ---- rate limiter ----------------------------------------------------------

def test_rate_limiter_allows_burst_then_blocks():
    rl = RateLimiter(capacity=3, refill_per_sec=0)  # no refill: pure burst
    assert rl.check("ip1") == (True, None)
    assert rl.check("ip1")[0] is True
    assert rl.check("ip1")[0] is True
    allowed, retry = rl.check("ip1")
    assert allowed is False and retry is not None and retry > 0


def test_rate_limiter_is_per_key():
    rl = RateLimiter(capacity=1, refill_per_sec=0)
    assert rl.check("a")[0] is True
    assert rl.check("a")[0] is False
    assert rl.check("b")[0] is True  # different IP unaffected


def test_rate_limiter_refills_over_time():
    rl = RateLimiter(capacity=1, refill_per_sec=1000)  # refills ~instantly
    assert rl.check("x")[0] is True
    assert rl.check("x")[0] is False
    time.sleep(0.01)
    assert rl.check("x")[0] is True  # recovered


# ---- concurrency gate ------------------------------------------------------

def test_concurrency_gate_caps_and_releases():
    g = ConcurrencyGate(max_concurrent=2)
    assert g.try_acquire() is True
    assert g.try_acquire() is True
    assert g.try_acquire() is False  # full -> caller should 503
    g.release()
    assert g.try_acquire() is True
    assert g.active == 2


# ---- scan store ------------------------------------------------------------

def test_scan_store_roundtrip_and_size_eviction():
    store = ScanStore(max_entries=2, ttl_seconds=3600)
    store.put(_scan("a"))
    store.put(_scan("b"))
    store.put(_scan("c"))
    assert store.get("a") is None          # evicted (oldest beyond capacity)
    assert store.get("b") is not None
    assert store.get("c") is not None
    assert len(store) == 2


def test_scan_store_ttl_expiry():
    store = ScanStore(max_entries=10, ttl_seconds=0)  # everything immediately stale
    store.put(_scan("a"))
    assert store.get("a") is None


# ---- client ip derivation --------------------------------------------------

def test_client_ip_uses_leftmost_forwarded_entry():
    assert client_ip({"x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2"}, "9.9.9.9") == "1.2.3.4"


def test_client_ip_falls_back_to_peer_without_header():
    assert client_ip({}, "9.9.9.9") == "9.9.9.9"
    assert client_ip({}, None) == "unknown"


# ---- route-level: 429 / 503 / CORS / token ---------------------------------

@pytest.fixture
def client(monkeypatch):
    # Reset the module singletons so limits are deterministic per test.
    from fastapi.testclient import TestClient

    from app import main
    main._rate_limiter = RateLimiter(capacity=2, refill_per_sec=0)
    main._concurrency = ConcurrencyGate(max_concurrent=1)
    main._scan_store = ScanStore()
    return TestClient(main.app), main


def test_route_returns_429_when_rate_limited(client, monkeypatch):
    c, main = client
    # Make every scan resolve instantly to a cached result so we exercise the limiter,
    # not the network. Patch resolve + cache to return quickly.
    from app.scanner.repository_resolver import RepoIdentity
    monkeypatch.setattr(main, "GitHubClient", lambda *a, **k: object())
    ident = RepoIdentity("o", "r", "https://github.com/o/r", "main", "a" * 40, None, None, None)
    monkeypatch.setattr("app.scanner.repository_resolver.resolve", lambda url, gh: ident)
    monkeypatch.setattr(main._get_scan_cache(), "get", lambda *a: _scan("cached"))
    body = {"repository_url": "https://github.com/o/r"}
    assert c.post("/api/v1/repository-scans", json=body).status_code == 200
    assert c.post("/api/v1/repository-scans", json=body).status_code == 200
    r = c.post("/api/v1/repository-scans", json=body)  # 3rd exceeds capacity=2
    assert r.status_code == 429
    assert r.json()["detail"]["error"] == "rate_limited"
    assert r.json()["detail"]["retry_after_seconds"] is not None


def test_route_returns_503_when_concurrency_saturated(client, monkeypatch):
    c, main = client
    # Pre-occupy the only concurrency slot.
    assert main._concurrency.try_acquire() is True
    r = c.post("/api/v1/repository-scans", json={"repository_url": "https://github.com/o/r"})
    assert r.status_code == 503
    assert r.json()["detail"]["error"] == "busy"
    main._concurrency.release()


def test_health_reports_token_without_leaking_it(client, monkeypatch):
    c, _ = client
    monkeypatch.setenv("GITHUB_TOKEN", "secret-should-not-appear")
    body = c.get("/health").json()
    assert body["scanner_token_configured"] is True
    assert "secret-should-not-appear" not in str(body)


def test_health_no_token(client, monkeypatch):
    c, _ = client
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert c.get("/health").json()["scanner_token_configured"] is False
