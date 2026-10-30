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


def client_ip(headers: dict, fallback: str | None) -> str:
    """Derive a rate-limit key behind Render's reverse proxy WITHOUT blindly trusting
    client-supplied forwarded headers.

    Render sets X-Forwarded-For as `<client>, <proxy...>`; the LEFTMOST entry is the
    real client as seen by Render's edge. We take the first hop only. A spoofed header
    just changes which bucket a caller lands in; it cannot bypass the global
    concurrency gate, which is the hard backstop. If no header is present we fall back
    to the socket peer. Documented as best-effort per-instance throttling.
    """
    xff = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return fallback or "unknown"
