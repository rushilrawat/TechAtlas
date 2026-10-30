"""TechAtlas FastAPI application.

Versioned REST API (spec §10) serving the curated technology knowledge graph.
Lightweight whole-graph payload + on-demand node detail.
"""
from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .graph_service import get_graph_service
from .models import (
    DomainSummary,
    GraphResponse,
    NeighborEdge,
    NodeDetail,
    NodeSummary,
    SearchResult,
)
from .summary_service import SummaryService

app = FastAPI(
    title="TechAtlas API",
    version="0.1.0",
    description="Serves the TechAtlas technology knowledge graph.",
)

# CORS: allow the local Vite dev server by default; override via env in production.
_origins = os.environ.get(
    "TECHATLAS_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["GET", "POST"],  # POST for Repo X-Ray scans (Phase 1.5)
    allow_headers=["content-type"],
)

API = "/api/v1"


@lru_cache(maxsize=1)
def get_summary_service() -> SummaryService:
    """Singleton SummaryService keyed to the current dataset version (Phase 1C)."""
    svc = get_graph_service()
    lang = os.environ.get("TECHATLAS_WIKIPEDIA_LANG", "en")
    ttl_days = int(os.environ.get("TECHATLAS_SUMMARY_TTL_DAYS", "30"))
    return SummaryService(svc.version, lang=lang, ttl_days=ttl_days)


@app.get("/health")
def health() -> dict[str, object]:
    svc = get_graph_service()
    # Report whether scanning is production-ready WITHOUT revealing the token itself.
    scanner_ready = bool(os.environ.get("GITHUB_TOKEN"))
    return {
        "status": "ok",
        "version": svc.version,
        "scanner_token_configured": scanner_ready,
        "active_scans": _concurrency.active if "_concurrency" in globals() else 0,
    }


@app.get(f"{API}/graph", response_model=GraphResponse)
def get_graph() -> GraphResponse:
    svc = get_graph_service()
    nodes, edges = svc.graph()
    return GraphResponse(
        version=svc.version,
        layout_version=svc.layout_version,
        nodes=nodes,
        edges=edges,
    )


@app.get(f"{API}/domains", response_model=list[DomainSummary])
def get_domains() -> list[DomainSummary]:
    return get_graph_service().domains()


@app.get(f"{API}/nodes/{{slug}}", response_model=NodeDetail)
def get_node(slug: str) -> NodeDetail:
    detail = get_graph_service().node_detail(slug)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Node '{slug}' not found")
    # Phase 1C: attach a Wikipedia summary when a curated title exists. Served from
    # cache where possible; failures degrade to None (the UI keeps the outbound link).
    summary = get_summary_service().get(detail.slug, detail.wikipedia_title)
    if summary is not None:
        detail.summary = NodeSummary(**summary.__dict__)
    return detail


@app.get(f"{API}/nodes/{{slug}}/neighbors", response_model=list[NeighborEdge])
def get_neighbors(slug: str) -> list[NeighborEdge]:
    result = get_graph_service().neighbors(slug)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Node '{slug}' not found")
    return result


@app.get(f"{API}/search", response_model=list[SearchResult])
def search(
    q: str = Query(..., min_length=1, description="Search term; matches names and aliases."),
    limit: int = Query(20, ge=1, le=100),
) -> list[SearchResult]:
    return get_graph_service().search(q, limit=limit)


# ---- Phase 1.5A: Repo X-Ray scanner ----------------------------------------
# Synchronous-with-cache MVP: POST runs (or returns cached) a bounded scan; GET fetches
# a completed scan by id. No background jobs (reviewer decision 2). The scanner only
# runs where a server-side GITHUB_TOKEN/backend exists; the static Pages build never
# calls these routes.
import time as _time  # noqa: E402

from .scanner.github_client import GitHubClient, GitHubError  # noqa: E402
from .scanner.models import RepoScan  # noqa: E402
from .scanner.repository_resolver import (  # noqa: E402
    InvalidRepositoryURL,
    RepositoryNotFound,
)
from .scanner.safeguards import (  # noqa: E402
    ConcurrencyGate,
    RateLimiter,
    ScanStore,
    client_ip,
)
from .scanner.scan_cache import ScanCache  # noqa: E402
from .scanner.scan_orchestrator import run_scan  # noqa: E402
from .scanner.technology_matcher import TechnologyMatcher  # noqa: E402

# Env-configurable production limits (single-instance, documented in docs).
_SCAN_RATE_BURST = int(os.environ.get("TECHATLAS_SCAN_RATE_BURST", "5"))
_SCAN_RATE_PER_MIN = float(os.environ.get("TECHATLAS_SCAN_RATE_PER_MIN", "5"))
_SCAN_MAX_CONCURRENT = int(os.environ.get("TECHATLAS_SCAN_MAX_CONCURRENT", "2"))
_SCAN_DEADLINE_SEC = float(os.environ.get("TECHATLAS_SCAN_DEADLINE_SEC", "45"))
_SCAN_REQUEST_BUDGET = int(os.environ.get("TECHATLAS_SCAN_REQUEST_BUDGET", "60"))

_rate_limiter = RateLimiter(
    capacity=_SCAN_RATE_BURST, refill_per_sec=_SCAN_RATE_PER_MIN / 60.0
)
_concurrency = ConcurrencyGate(max_concurrent=_SCAN_MAX_CONCURRENT)
_scan_store = ScanStore()


@lru_cache(maxsize=1)
def _get_matcher() -> TechnologyMatcher:
    return TechnologyMatcher(get_graph_service().all_nodes())


@lru_cache(maxsize=1)
def _get_scan_cache() -> ScanCache:
    return ScanCache()


class RepositoryScanRequest(BaseModel):
    repository_url: str


@app.post(f"{API}/repository-scans", response_model=RepoScan)
def create_repository_scan(req: RepositoryScanRequest, request: Request) -> RepoScan:
    # 1) per-IP rate limit (best-effort, per instance; see safeguards.py).
    peer = request.client.host if request.client else None
    key = client_ip(dict(request.headers), peer)
    allowed, retry = _rate_limiter.check(key)
    if not allowed:
        raise HTTPException(status_code=429, detail={
            "error": "rate_limited",
            "message": "Too many scan requests. Please slow down.",
            "retry_after_seconds": retry,
        })

    # 2) global concurrency gate -> 503 when saturated (never queue/hang).
    if not _concurrency.try_acquire():
        raise HTTPException(status_code=503, detail={
            "error": "busy",
            "message": "The scanner is busy right now. Please try again shortly.",
            "retry_after_seconds": 10,
        })
    try:
        svc = get_graph_service()
        matcher = _get_matcher()
        cache = _get_scan_cache()
        gh = GitHubClient(request_budget=_SCAN_REQUEST_BUDGET)
        try:
            from .scanner.repository_resolver import resolve
            identity = resolve(req.repository_url, gh)
            cached = cache.get(identity.owner, identity.name, identity.commit_sha, svc.version)
            if cached is not None:
                _scan_store.put(cached)
                return cached
            scan = run_scan(
                req.repository_url, gh, matcher, svc.version,
                deadline=_time.monotonic() + _SCAN_DEADLINE_SEC,
            )
        except InvalidRepositoryURL as e:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_url",
                "message": "Enter a valid public GitHub repository URL.",
            }) from e
        except RepositoryNotFound as e:
            raise HTTPException(status_code=404, detail={
                "error": "not_found", "message": str(e),
            }) from e
        except GitHubError as e:
            status = 429 if e.code == "rate_limited" else 502
            raise HTTPException(status_code=status, detail={
                "error": e.code, "message": e.message,
                "retry_after_seconds": e.retry_after,
            }) from e
        cache.put(scan)
        _scan_store.put(scan)
        return scan
    finally:
        _concurrency.release()


@app.get(f"{API}/repository-scans/{{scan_id}}", response_model=RepoScan)
def get_repository_scan(scan_id: str) -> RepoScan:
    scan = _scan_store.get(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail={
            "error": "not_found", "message": "Scan not found or expired.",
        })
    return scan
