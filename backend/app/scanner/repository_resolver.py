"""Validate + normalize a GitHub repo URL and resolve its commit identity (1.5A).

Server-side allowlisting (spec §4.3, §17): only github.com owner/repo URLs are
accepted; everything else is rejected before any network call. Then the default branch
is resolved to a full commit SHA, which is the identity of the analyzed state.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .github_client import GitHubClient, GitHubError

# GitHub owner: alphanumerics + single hyphens, 1-39 chars (no leading/trailing hyphen).
# Repo: letters, digits, '.', '_', '-'. Deliberately permissive on repo per spec §4.3,
# but anchored and host-locked.
_OWNER = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
_REPO = r"[A-Za-z0-9_.-]{1,100}"
_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/"
    + rf"(?P<owner>{_OWNER})/(?P<repo>{_REPO})/?$"
)


class InvalidRepositoryURL(Exception):
    pass


class RepositoryNotFound(Exception):
    pass


@dataclass(frozen=True)
class RepoIdentity:
    owner: str
    name: str
    url: str
    default_branch: str
    commit_sha: str
    description: str | None
    primary_language: str | None
    stars: int | None


def normalize_url(raw: str) -> tuple[str, str]:
    """Return canonical (owner, repo) or raise InvalidRepositoryURL.

    Accepts https/http, optional www, optional .git suffix, trailing slash. Rejects
    non-GitHub hosts, IP addresses, local addresses, and malformed identifiers.
    """
    if not raw or not isinstance(raw, str):
        raise InvalidRepositoryURL("empty URL")
    s = raw.strip()
    # Strip a trailing .git before matching (keeps the repo regex simple).
    if s.endswith(".git"):
        s = s[:-4]
    m = _URL_RE.match(s)
    if not m:
        raise InvalidRepositoryURL(f"not a valid public GitHub repository URL: {raw!r}")
    owner, repo = m.group("owner"), m.group("repo")
    # Guard against path-like repo segments sneaking through (defense in depth).
    if "/" in repo or repo in (".", ".."):
        raise InvalidRepositoryURL(f"invalid repository name: {repo!r}")
    return owner, repo


def resolve(raw_url: str, gh: GitHubClient) -> RepoIdentity:
    """Validate the URL and resolve the repo to a full commit SHA on its default branch."""
    owner, repo = normalize_url(raw_url)

    meta = gh.get(f"/repos/{owner}/{repo}")
    if meta.status_code == 404:
        raise RepositoryNotFound(
            "We couldn't find a publicly accessible repository at that URL."
        )
    if meta.status_code != 200 or not isinstance(meta.json_body, dict):
        raise GitHubError("github_error", "Unexpected response from GitHub.")
    body = meta.json_body
    if body.get("private"):
        # Should not happen for the public API, but never scan/confirm private repos.
        raise RepositoryNotFound(
            "We couldn't find a publicly accessible repository at that URL."
        )
    default_branch = body.get("default_branch") or "main"

    # Resolve the branch head to a full commit SHA (the analyzed identity).
    ref = gh.get(f"/repos/{owner}/{repo}/commits/{default_branch}")
    if ref.status_code != 200 or not isinstance(ref.json_body, dict):
        raise GitHubError("github_error", "Could not resolve the default-branch commit.")
    commit_sha = ref.json_body.get("sha")
    if not commit_sha:
        raise GitHubError("github_error", "Could not resolve the default-branch commit.")

    return RepoIdentity(
        owner=owner,
        name=repo,
        url=f"https://github.com/{owner}/{repo}",
        default_branch=default_branch,
        commit_sha=commit_sha,
        description=body.get("description"),
        primary_language=body.get("language"),
        stars=body.get("stargazers_count"),
    )
