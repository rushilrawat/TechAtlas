"""Production safeguards for public scanning (Phase 1.5D).

Single-process, in-memory, thread-safe. These reset on restart and apply PER APP
INSTANCE — correct for the Render Free single-worker deployment. They are NOT a
distributed limiter: running multiple workers/instances would multiply the effective
limits, so the deployment must stay single-worker unless this is replaced with a shared
store. CORS is handled separately and is not an auth mechanism.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict

from .models import RepoScan


class RateLimiter:
    """Per-key (per-IP) token bucket. `capacity` burst, refilled `refill_per_sec`."""

    def __init__(self, capacity: int = 5, refill_per_sec: float = 5 / 60) -> None:
        # default: 5 scans burst, refilling 1 every 12s (~5/min sustained)
        self._capacity = float(capacity)
        self._refill = refill_per_sec
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_ts)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int | None]:
        """Return (allowed, retry_after_seconds_if_denied)."""
        now = time.monotonic()
        with self._lock:
            tokens, last = self._buckets.get(key, (self._capacity, now))
            tokens = min(self._capacity, tokens + (now - last) * self._refill)
            if tokens >= 1.0:
                self._buckets[key] = (tokens - 1.0, now)
                # opportunistic cleanup of idle buckets to bound memory
                if len(self._buckets) > 10_000:
                    self._evict_idle(now)
                return True, None
            self._buckets[key] = (tokens, now)
            deficit = 1.0 - tokens
            retry = int(deficit / self._refill) + 1 if self._refill > 0 else 60
            return False, retry

    def _evict_idle(self, now: float) -> None:
        stale = [k for k, (_, last) in self._buckets.items() if now - last > 3600]
        for k in stale:
            self._buckets.pop(k, None)


class ConcurrencyGate:
    """Bounds simultaneously-running scans. acquire() is non-blocking: returns False
    immediately when full so the route can answer 503 rather than queue/hang."""

    def __init__(self, max_concurrent: int = 2) -> None:
        self._max = max_concurrent
        self._active = 0
        self._lock = threading.Lock()

    def try_acquire(self) -> bool:
        with self._lock:
            if self._active >= self._max:
                return False
            self._active += 1
            return True

    def release(self) -> None:
        with self._lock:
            if self._active > 0:
                self._active -= 1

    @property
    def active(self) -> int:
        return self._active


class ScanStore:
    """Bounded TTL store for completed scans (GET-by-id). Evicts by age and size so it
    never grows unboundedly in a long-lived process."""

    def __init__(self, max_entries: int = 500, ttl_seconds: int = 3600) -> None:
        self._max = max_entries
        self._ttl = ttl_seconds
        self._items: OrderedDict[str, tuple[float, RepoScan]] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, scan: RepoScan) -> None:
        now = time.monotonic()
        with self._lock:
            self._items[scan.scan_id] = (now, scan)
            self._items.move_to_end(scan.scan_id)
            self._evict(now)

    def get(self, scan_id: str) -> RepoScan | None:
        now = time.monotonic()
        with self._lock:
            entry = self._items.get(scan_id)
            if entry is None:
                return None
            ts, scan = entry
            if now - ts > self._ttl:
                self._items.pop(scan_id, None)
                return None
            self._items.move_to_end(scan_id)
            return scan

    def _evict(self, now: float) -> None:
        # drop expired
        expired = [k for k, (ts, _) in self._items.items() if now - ts > self._ttl]
        for k in expired:
            self._items.pop(k, None)
        # drop oldest beyond capacity
        while len(self._items) > self._max:
            self._items.popitem(last=False)

    def __len__(self) -> int:
        return len(self._items)


def client_ip(headers: dict, fallback: str | None, trusted_proxies: int = 1) -> str:
    """Derive a SPOOF-RESISTANT rate-limit key from X-Forwarded-For behind Render.

    The security invariant (see adam-p.ca / RFC-7239 discussions): a client controls how
    many entries appear on the LEFT of X-Forwarded-For, but each real proxy appends
    exactly one entry on the RIGHT. So the LEFTMOST entry is attacker-controllable and
    must never be trusted. Instead we trust a fixed number of proxy hops and read the
    entry that many positions from the right.

    `trusted_proxies` = number of proxies the request passes through before our app that
    we TRUST to have appended honest entries (Render's edge = 1; override via
    TECHATLAS_TRUSTED_PROXIES). Each trusted proxy appends exactly one entry on the
    RIGHT, so the real client IP that the OUTERMOST trusted proxy observed is the
    `trusted_proxies`-th entry counted from the right, i.e. ``parts[-trusted_proxies]``.

    Why this is spoof-resistant: an attacker can only inject entries to the LEFT of what
    the trusted proxies appended; they cannot change the rightmost `trusted_proxies`
    entries, which the proxies wrote from the actual TCP connection. Selecting
    ``parts[-trusted_proxies]`` therefore always lands on a proxy-written value. A forged
    leftmost IP is never selected, so a caller cannot rotate it to escape their bucket or
    impersonate another IP's bucket.

    If the header is missing or has fewer entries than trusted hops (a direct hit, or a
    client sending a too-short forged header), we fall back to the socket peer — never to
    a client-supplied value. Rate limiting is best-effort per instance; the global
    concurrency gate is the hard backstop no header can bypass.
    """
    if trusted_proxies < 1:
        return fallback or "unknown"
    xff = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if len(parts) >= trusted_proxies:
            return parts[-trusted_proxies]
        # Fewer entries than trusted hops -> not the shape we expect (possible spoof or
        # direct connection). Do NOT trust any entry; use the peer.
    return fallback or "unknown"
