"""Optional "explain this stack" endpoint for the stack recommender (Phase 2).

The frontend picks the stack itself, deterministically, from the graph. This module only
asks Claude to turn that pick, and the atlas relationships behind it, into a short
plain-English rationale. Claude is told to use nothing but the facts in the request, so
the explanation stays grounded in the dataset. Disabled unless ANTHROPIC_API_KEY is set
and the `anthropic` package is installed.
"""
from __future__ import annotations

import json
import os

from pydantic import BaseModel, Field

MODEL = os.environ.get("TECHATLAS_EXPLAIN_MODEL", "claude-opus-5-5")

SYSTEM = (
    "You explain a recommended software stack to a developer. You are given the project "
    "description, the stack (one technology per slot), and for each pick the reasons "
    "TechAtlas found: relationships from its curated knowledge graph, or a plain note such "
    "as 'the user mentioned it'. Use ONLY those facts. Do not add technologies, versions, "
    "benchmarks, or claims that are not in the input; if a pick has only a weak reason, say "
    "it is a common default. Write 2 or 3 short paragraphs of plain prose, no headings or "
    "lists, under 180 words: how the pieces fit together, then the one or two swaps most "
    "worth considering from the listed alternatives and when they would be better."
)


class ExplainPick(BaseModel):
    slot: str = Field(max_length=60)
    technology: str = Field(max_length=80)
    source: str = Field(max_length=20)
    reasons: list[str] = Field(default_factory=list, max_length=6)
    alternatives: list[str] = Field(default_factory=list, max_length=6)


class ExplainRequest(BaseModel):
    description: str = Field(default="", max_length=500)
    project_type: str = Field(max_length=60)
    picks: list[ExplainPick] = Field(min_length=1, max_length=24)
    concepts: list[str] = Field(default_factory=list, max_length=12)


class ExplainUnavailable(Exception):
    """Raised when explanations are not configured on this server."""


class ExplainRefused(Exception):
    """Raised when the model declined to answer."""


def enabled() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def build_prompt(req: ExplainRequest) -> str:
    payload = {
        "project_description": req.description or "(none given)",
        "project_type": req.project_type,
        "stack": [p.model_dump() for p in req.picks],
        "concepts_the_stack_relies_on": req.concepts,
    }
    return "Explain this stack using only these facts:\n" + json.dumps(payload, indent=1)


_client = None


def explain(req: ExplainRequest) -> str:
    if not enabled():
        raise ExplainUnavailable()
    import anthropic

    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=40.0, max_retries=1)
    response = _client.beta.messages.create(
        model=MODEL,
        max_tokens=2000,
        output_config={"effort": "low"},
        # On a policy decline the API retries on a suitable fallback model in the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        messages=[{"role": "user", "content": build_prompt(req)}],
    )
    if response.stop_reason == "refusal":
        raise ExplainRefused()
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise ExplainRefused()
    return text
