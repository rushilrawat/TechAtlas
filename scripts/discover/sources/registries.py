"""Optional registry discovery pass (flag-gated, off by default).

Surfaces popular GitHub repos / packages from a curated WATCHLIST that are NOT already
in the graph, as low-confidence candidates (subtype/domain/edges all left for human
review). It reuses the Phase 1D fetchers for the actual network calls so there is one
implementation of each source.

These candidates are intentionally low-confidence: a popular repo is not automatically a
"technology" node in our editorial sense, so the human reviewer decides. This pass only
confirms the entity is reachable/real and proposes the name for review.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from .common import RawCandidate

# Reuse the Phase 1D fetchers as a proper package: put scripts/ on the path so
# `popularity.sources.github` imports cleanly (its own relative imports then resolve).
_SCRIPTS = Path(__file__).resolve().parent.parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))


def _load_pop_fetchers():
    from popularity.sources import github, packages  # noqa: PLC0415

    return github, packages


# Curated watchlist of widely-used entities to probe. These are candidates to CONSIDER,
# not auto-adds. Keep small and hand-chosen — this is not a crawler.
WATCHLIST: list[dict] = [
    {"name": "Hono", "repo": "honojs/hono"},
    {"name": "Turborepo", "repo": "vercel/turborepo"},
    {"name": "Biome", "repo": "biomejs/biome"},
    {"name": "Zod", "repo": "colinhacks/zod"},
    {"name": "tRPC", "repo": "trpc/trpc"},
    {"name": "Drizzle ORM", "repo": "drizzle-team/drizzle-orm"},
    {"name": "Polars", "repo": "pola-rs/polars"},
    {"name": "Tauri", "repo": "tauri-apps/tauri"},
]


def fetch(*, client, timeout: float = 5.0) -> list[RawCandidate]:
    """Probe the watchlist; emit a RawCandidate for each reachable entry.

    Reachability (a successful GitHub fetch) is the only thing confirmed here. Subtype,
    domain, edges, and whether it belongs in the graph at all are left to the reviewer.
    Any error yields no candidate for that entry (never raises).
    """
    try:
        github, _packages = _load_pop_fetchers()
    except Exception:  # noqa: BLE001
        return []

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    out: list[RawCandidate] = []
    for entry in WATCHLIST:
        repo = entry.get("repo")
        if not repo:
            continue
        try:
            metrics = github.fetch(repo, client=client, timeout=timeout)
        except Exception:  # noqa: BLE001
            metrics = {}
        if not metrics:
            continue  # unreachable / not confirmed -> don't propose
        out.append(
            RawCandidate(
                name=entry["name"],
                source="github",
                source_ref=f"https://github.com/{repo}",
                retrieved_at=now,
                subtype_hint=None,  # reviewer decides
                extra={"github_repo": repo},
            )
        )
    return out
