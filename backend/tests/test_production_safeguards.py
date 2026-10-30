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

def test_client_ip_takes_render_observed_rightmost_with_one_trusted_proxy():
    # Render (1 trusted hop) appends the real client IP as the RIGHTMOST entry.
    assert client_ip({"x-forwarded-for": "203.0.113.7"}, "203.0.113.7",
                     trusted_proxies=1) == "203.0.113.7"


def test_client_ip_ignores_forged_leftmost_entries():
    # Attacker prepends fakes: "FORGED..., <render-observed-client>". With 1 trusted hop
    # we take the rightmost (proxy-written) value; forged left entries are never trusted.
    assert client_ip({"x-forwarded-for": "1.1.1.1, 203.0.113.7"}, "203.0.113.7",
                     trusted_proxies=1) == "203.0.113.7"
    assert client_ip({"x-forwarded-for": "9.9.9.9, 7.7.7.7, 203.0.113.7"}, "203.0.113.7",
                     trusted_proxies=1) == "203.0.113.7"


def test_client_ip_rotating_forged_leftmost_maps_to_same_key():
    # The core anti-spoof property: no matter what an attacker rotates on the left, the
    # key is stable (the proxy-written rightmost), so they cannot escape their bucket.
    k1 = client_ip({"x-forwarded-for": "1.1.1.1, 203.0.113.7"}, "203.0.113.7", trusted_proxies=1)
    k2 = client_ip({"x-forwarded-for": "2.2.2.2, 203.0.113.7"}, "203.0.113.7", trusted_proxies=1)
    assert k1 == k2 == "203.0.113.7"


def test_client_ip_falls_back_to_peer_when_header_missing_or_too_short():
    assert client_ip({}, "9.9.9.9", trusted_proxies=1) == "9.9.9.9"
    assert client_ip({}, None, trusted_proxies=1) == "unknown"
    # 2 trusted hops but only 1 entry -> shape not as expected -> use the peer.
    assert client_ip({"x-forwarded-for": "1.1.1.1"}, "9.9.9.9", trusted_proxies=2) == "9.9.9.9"


def test_client_ip_multiple_trusted_proxies_selects_outermost_trusted_entry():
    # 2 trusted hops: the real client is the 2nd-from-right (the outer trusted proxy
    # observed it; the two rightmost were written by our trusted proxies).
    assert client_ip({"x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2"}, "10.0.0.2",
                     trusted_proxies=2) == "10.0.0.1"
    # a forged leftmost still cannot reach the selected position
    assert client_ip({"x-forwarded-for": "evil, 203.0.113.7, 10.0.0.1, 10.0.0.2"}, "10.0.0.2",
                     trusted_proxies=2) == "10.0.0.1"


def test_client_ip_zero_trusted_proxies_never_trusts_header():
    # Defensive: trusted_proxies<1 means do not trust XFF at all -> socket peer.
    assert client_ip({"x-forwarded-for": "1.2.3.4"}, "9.9.9.9", trusted_proxies=0) == "9.9.9.9"


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


def test_route_rate_limit_not_bypassed_by_forged_xff(client, monkeypatch):
    """End-to-end: a caller who rotates FORGED leftmost X-Forwarded-For values is still
    bucketed by the real (rightmost-trusted) client IP, so they cannot escape their own
    per-IP limit. TestClient sends a fixed socket peer; we simulate Render appending it
    by always ending XFF with the same trusted-edge IP."""
    c, main = client
    main._rate_limiter = RateLimiter(capacity=2, refill_per_sec=0)
    from app.scanner.repository_resolver import RepoIdentity
    monkeypatch.setattr(main, "GitHubClient", lambda *a, **k: object())
    ident = RepoIdentity("o", "r", "https://github.com/o/r", "main", "a" * 40, None, None, None)
    monkeypatch.setattr("app.scanner.repository_resolver.resolve", lambda url, gh: ident)
    monkeypatch.setattr(main._get_scan_cache(), "get", lambda *a: _scan("cached"))
    body = {"repository_url": "https://github.com/o/r"}

    # Same real client (rightmost-trusted = 203.0.113.9), but forged, rotating leftmost.
    def forged(fake):
        # Render appends the true client IP as the rightmost entry; the attacker only
        # controls the forged value on the LEFT. The rate-limit key is the rightmost.
        return {"x-forwarded-for": f"{fake}, 203.0.113.9"}

    r1 = c.post("/api/v1/repository-scans", json=body, headers=forged("1.1.1.1"))
    assert r1.status_code == 200
    r2 = c.post("/api/v1/repository-scans", json=body, headers=forged("2.2.2.2"))
    assert r2.status_code == 200
    # 3rd request, yet another forged leftmost — still the SAME bucket -> 429.
    r = c.post("/api/v1/repository-scans", json=body, headers=forged("3.3.3.3"))
    assert r.status_code == 429, "forged XFF must not create a fresh rate-limit bucket"
