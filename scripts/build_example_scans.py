#!/usr/bin/env python3
"""Pre-compute Repo X-Ray results for a few well-known repositories.

The public GitHub Pages site has no scanner backend by default, and even when one is
configured, Render Free can take 30-60s to wake up. These baked scans make the first
X-Ray click instant: the frontend loads them as static JSON, and the live scanner
becomes the "try your own repo" step.

Every result comes from the real scanner pipeline (``run_scan``) with the same request
budget and file limits the live endpoint uses, so an example looks exactly like a live
scan of that commit would.

Output (committed, served as static files by Vite):
  frontend/public/example-scans/<slug>.json   one full RepoScan per repository
  frontend/src/data/exampleScans.json         a small index the UI imports

Sources:
  --source api   (default) GitHub REST API, like the live backend. Set GITHUB_TOKEN to
                 avoid the 60 requests/hour anonymous limit.
  --source git   No API: lists the tree from a blobless shallow clone and reads files
                 from raw.githubusercontent.com. Repository description, language and
                 stars come from the curated table below. Use it where the API is not
                 reachable.

Usage:
  python scripts/build_example_scans.py                 # all examples
  python scripts/build_example_scans.py django/django   # just one
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.graph_service import GraphService  # noqa: E402
from app.scanner.github_client import GitHubClient, GitHubResponse  # noqa: E402
from app.scanner.scan_orchestrator import run_scan  # noqa: E402
from app.scanner.technology_matcher import TechnologyMatcher  # noqa: E402

OUT_DIR = ROOT / "frontend" / "public" / "example-scans"
INDEX = ROOT / "frontend" / "src" / "data" / "exampleScans.json"

# Same limits as the live endpoint (backend/app/main.py).
REQUEST_BUDGET = 60


@dataclass(frozen=True)
class Example:
    repo: str          # owner/name
    tagline: str       # one line shown on the example card
    # Fallback metadata for --source git (the API supplies these otherwise).
    description: str
    language: str


# Shown in this order: the richest stacks first.
EXAMPLES: list[Example] = [
    Example("immich-app/immich", "Photo app: Flutter, NestJS, Postgres",
            "High performance self-hosted photo and video management solution.", "TypeScript"),
    Example("fastapi/full-stack-fastapi-template", "FastAPI + React full-stack starter",
            "Full stack, modern web application template. Using FastAPI, React, SQLModel, "
            "PostgreSQL, Docker, GitHub Actions, automatic HTTPS and more.", "TypeScript"),
    Example("vercel/next.js", "React framework, Turbopack in Rust",
            "The React Framework", "JavaScript"),
    Example("excalidraw/excalidraw", "Collaborative whiteboard in TypeScript",
            "Virtual whiteboard for sketching hand-drawn like diagrams", "TypeScript"),
    Example("facebook/react", "The UI library itself",
            "The library for web and native user interfaces.", "JavaScript"),
    Example("spring-projects/spring-petclinic", "Classic Spring Boot sample app",
            "A sample Spring-based application", "Java"),
    Example("django/django", "Batteries-included Python web framework",
            "The Web framework for perfectionists with deadlines.", "Python"),
    Example("kubernetes/kubernetes", "Container orchestration in Go",
            "Production-Grade Container Scheduling and Management", "Go"),
    Example("bevyengine/bevy", "Data-driven game engine in Rust",
            "A refreshingly simple data-driven game engine built in Rust", "Rust"),
]


def slug_of(repo: str) -> str:
    return repo.lower().replace("/", "-").replace(".", "-")


class GitBackedClient(GitHubClient):
    """Answers the four API calls the scanner makes from git + raw file downloads.

    It counts requests against the same budget as the real client, so selection and
    partial-scan behaviour match a live scan.
    """

    def __init__(self, example: Example, workdir: Path) -> None:
        super().__init__(token="", request_budget=REQUEST_BUDGET)
        self.example = example
        owner, name = example.repo.split("/")
        self.owner, self.name = owner, name
        url = f"https://github.com/{example.repo}"
        head = subprocess.run(["git", "ls-remote", "--symref", url, "HEAD"],
                              check=True, capture_output=True, text=True).stdout
        self.branch = next(line.split()[1].removeprefix("refs/heads/")
                           for line in head.splitlines() if line.startswith("ref:"))
        self.dir = workdir / slug_of(example.repo)
        subprocess.run(["git", "clone", "--quiet", "--filter=blob:none", "--no-checkout",
                        "--depth", "1", "--branch", self.branch, url, str(self.dir)],
                       check=True)
        self.sha = subprocess.run(["git", "-C", str(self.dir), "rev-parse", "HEAD"],
                                  check=True, capture_output=True, text=True).stdout.strip()

    def _count(self) -> None:
        from app.scanner.github_client import BudgetExceeded
        if self._used >= self._budget:
            raise BudgetExceeded(f"request budget {self._budget} exhausted")
        self._used += 1

    def get(self, path: str, *, params: dict | None = None) -> GitHubResponse:
        self._count()
        base = f"/repos/{self.owner}/{self.name}"
        if path == base:
            body = {"default_branch": self.branch, "description": self.example.description,
                    "language": self.example.language, "stargazers_count": None,
                    "private": False}
        elif path == f"{base}/commits/{self.branch}":
            body = {"sha": self.sha}
        elif path.startswith(f"{base}/git/trees/"):
            # No "-l": sizes would make a blobless clone download every blob. File
            # selection does not use the tree size; fetch_text checks the real size.
            out = subprocess.run(["git", "-C", str(self.dir), "ls-tree", "-r", "HEAD"],
                                 check=True, capture_output=True, text=True).stdout
            tree = []
            for line in out.splitlines():
                meta, file_path = line.split("\t", 1)
                _mode, kind, _sha = meta.split()
                tree.append({"path": file_path, "type": kind, "size": 0})
            body = {"tree": tree, "truncated": False}
        elif path.startswith(f"{base}/contents/"):
            file_path = path.removeprefix(f"{base}/contents/")
            raw_url = (f"https://raw.githubusercontent.com/{self.owner}/{self.name}/"
                       f"{self.sha}/{urllib.request.quote(file_path)}")
            try:
                with urllib.request.urlopen(raw_url, timeout=20) as resp:
                    data = resp.read()
            except Exception:  # noqa: BLE001 - a missing file is just skipped
                return GitHubResponse(404, None, "", {})
            body = {"encoding": "base64", "size": len(data),
                    "content": base64.b64encode(data).decode("ascii")}
        else:
            return GitHubResponse(404, None, "", {})
        return GitHubResponse(200, body, "", {})


def index_entry(example: Example, scan: dict) -> dict:
    s = scan["summary"]
    return {
        "slug": slug_of(example.repo),
        "repo": example.repo,
        "tagline": example.tagline,
        "language": scan["repository"].get("primary_language"),
        "technologies": s["matched_technology_count"],
        "concepts": s["matched_concept_count"],
        "commit": scan["repository"]["commit_sha"][:7],
        "scanned_on": date.today().isoformat(),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repos", nargs="*", help="owner/name to rebuild (default: all)")
    ap.add_argument("--source", choices=["api", "git"], default="api")
    args = ap.parse_args()

    wanted = [e for e in EXAMPLES if not args.repos or e.repo in args.repos]
    if not wanted:
        print("No matching examples.", file=sys.stderr)
        return 1

    svc = GraphService()
    matcher = TechnologyMatcher(svc.all_nodes())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    index = {e["slug"]: e for e in (json.loads(INDEX.read_text()) if INDEX.exists() else [])}

    with tempfile.TemporaryDirectory() as tmp:
        for example in wanted:
            print(f"Scanning {example.repo} ({args.source})…", flush=True)
            gh = (GitBackedClient(example, Path(tmp)) if args.source == "git"
                  else GitHubClient(request_budget=REQUEST_BUDGET))
            scan = run_scan(f"https://github.com/{example.repo}", gh, matcher, svc.version)
            payload = json.loads(scan.model_dump_json())
            (OUT_DIR / f"{slug_of(example.repo)}.json").write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            index[slug_of(example.repo)] = index_entry(example, payload)
            print(f"  {payload['summary']['matched_technology_count']} technologies, "
                  f"{payload['summary']['matched_concept_count']} concepts, status {payload['status']}")

    order = [slug_of(e.repo) for e in EXAMPLES]
    entries = [index[s] for s in order if s in index]
    INDEX.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(wanted)} scan(s) and an index of {len(entries)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
