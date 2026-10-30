"""Server-side GitHub REST client for the scanner (Phase 1.5A).

Bounded, injectable, and safe: a request budget per scan, an optional server-side
token (GITHUB_TOKEN), rate-limit detection, and clear typed errors. The httpx client
is injectable so tests never hit the network. This is the ONLY component that talks to
GitHub.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

GITHUB_API = "https://api.github.com"
_UA = "TechAtlas/1.5 (repo x-ray scanner)"


class GitHubError(Exception):
    """GitHub call failed in a way the caller should surface."""

    def __init__(self, code: str, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.code = code  # not_found | rate_limited | github_error
        self.message = message
        self.retry_after = retry_after


class BudgetExceeded(Exception):
    """The per-scan GitHub request budget was exhausted (-> partial scan)."""


@dataclass
class GitHubResponse:
    status_code: int
    json_body: object
    text: str
    headers: dict


class GitHubClient:
    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        token: str | None = None,
        request_budget: int = 60,
        timeout: float = 10.0,
    ) -> None:
        self._client = client
        self._token = token if token is not None else os.environ.get("GITHUB_TOKEN")
        self._budget = request_budget
        self._used = 0
        self._timeout = timeout

    @property
    def requests_used(self) -> int:
        return self._used

    def _headers(self) -> dict:
        h = {"Accept": "application/vnd.github+json", "User-Agent": _UA,
             "X-GitHub-Api-Version": "2022-11-28"}
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    def get(self, path: str, *, params: dict | None = None) -> GitHubResponse:
        """GET an API path (e.g. '/repos/owner/repo'). Raises on hard failures.

        Returns a GitHubResponse for non-fatal non-200s (e.g. 404) so callers can
        decide; raises GitHubError for rate limits and unexpected server errors, and
        BudgetExceeded when the per-scan budget is used up.
        """
        if self._used >= self._budget:
            raise BudgetExceeded(f"request budget {self._budget} exhausted")
        self._used += 1
        url = path if path.startswith("http") else f"{GITHUB_API}{path}"
        try:
            if self._client is not None:
                resp = self._client.get(url, params=params, headers=self._headers(),
                                        timeout=self._timeout)
            else:
                resp = httpx.get(url, params=params, headers=self._headers(),
                                 timeout=self._timeout, follow_redirects=False)
        except httpx.HTTPError as e:  # network/timeout
            raise GitHubError("github_error", f"GitHub request failed: {e}") from e

        # GitHub answers renamed owners/repos with a 301 to the SAME host. Follow it
        # once, but only if it stays on api.github.com (never an arbitrary cross-host
        # redirect — SSRF-safe, spec §17).
        if resp.status_code in (301, 302, 307, 308):
            loc = resp.headers.get("location", "")
            if loc.startswith("https://api.github.com/"):
                try:
                    if self._client is not None:
                        resp = self._client.get(loc, headers=self._headers(),
                                                 timeout=self._timeout)
                    else:
                        resp = httpx.get(loc, headers=self._headers(),
                                         timeout=self._timeout, follow_redirects=False)
                except httpx.HTTPError as e:
                    raise GitHubError("github_error", f"GitHub request failed: {e}") from e

        status = resp.status_code
        headers = dict(resp.headers)

        # Rate limiting: 403/429 with remaining==0 (primary) or Retry-After (secondary).
        if status in (403, 429):
            remaining = headers.get("x-ratelimit-remaining")
            retry_after = headers.get("retry-after")
            if remaining == "0" or retry_after is not None:
                ra = int(retry_after) if retry_after and retry_after.isdigit() else None
                raise GitHubError(
                    "rate_limited",
                    "GitHub is temporarily limiting repository requests.",
                    retry_after=ra,
                )

        try:
            body = resp.json()
        except ValueError:
            body = None
        return GitHubResponse(status_code=status, json_body=body, text=resp.text,
                              headers=headers)
