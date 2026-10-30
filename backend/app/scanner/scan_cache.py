"""On-disk JSON cache for completed scans (1.5A).

Mirrors the Phase 1C cache style, keyed by repo + commit + scanner + mapping version so
a re-scan of the same commit with compatible rules is reused (spec §13.2). Atomic writes
(temp file + os.replace) so a crashed/partial write never serves corrupt JSON — and
production filesystems are not assumed persistent (a missing cache just means a re-scan).
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .models import SCANNER_VERSION, RepoScan

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
CACHE_ROOT = DATA_DIR / "cache" / "scans"


def _safe(part: str) -> str:
    # owner/repo are already validated; be defensive about the cache path anyway.
    return "".join(c if c.isalnum() or c in "-._" else "_" for c in part)[:80]


def cache_key(owner: str, name: str, commit_sha: str, mapping_version: str) -> str:
    return f"{commit_sha}.{SCANNER_VERSION}.{mapping_version}"


class ScanCache:
    def __init__(self, cache_root: Path = CACHE_ROOT) -> None:
        self._root = cache_root

    def _path(self, owner: str, name: str, key: str) -> Path:
        return self._root / _safe(owner) / _safe(name) / f"{_safe(key)}.json"

    def get(self, owner: str, name: str, commit_sha: str, mapping_version: str) -> RepoScan | None:
        key = cache_key(owner, name, commit_sha, mapping_version)
        path = self._path(owner, name, key)
        if not path.exists():
            return None
        try:
            return RepoScan.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def put(self, scan: RepoScan) -> None:
        # Only cache terminal, trustworthy results.
        if scan.status not in ("completed", "partial"):
            return
        key = cache_key(
            scan.repository.owner, scan.repository.name,
            scan.repository.commit_sha, scan.mapping_version,
        )
        path = self._path(scan.repository.owner, scan.repository.name, key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = scan.model_dump_json()
            # atomic write: temp in the same dir, then os.replace.
            fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    fh.write(payload)
                os.replace(tmp, path)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
        except OSError:
            pass  # cache write failure must never break the scan
