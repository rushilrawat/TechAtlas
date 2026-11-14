from fastapi.testclient import TestClient

from app import stack_explainer
from app.main import app

client = TestClient(app)
BODY = {
    "description": "A SaaS on Next.js",
    "project_type": "Web app",
    "picks": [{"slot": "App framework", "technology": "Next.js", "source": "mentioned",
               "reasons": ["Next.js is built on React"], "alternatives": ["Remix"]}],
    "concepts": ["Server-side rendering"],
}


def test_disabled_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post("/api/v1/stack-explanations", json=BODY)
    assert r.status_code == 503


def test_validates_input(monkeypatch):
    monkeypatch.setattr(stack_explainer, "enabled", lambda: True)
    r = client.post("/api/v1/stack-explanations", json={**BODY, "picks": []})
    assert r.status_code == 422


def test_returns_explanation(monkeypatch):
    monkeypatch.setattr(stack_explainer, "enabled", lambda: True)
    monkeypatch.setattr(stack_explainer, "explain", lambda req: "It fits together.")
    r = client.post("/api/v1/stack-explanations", json=BODY,
                    headers={"x-forwarded-for": "203.0.113.9"})
    assert r.status_code == 200
    assert r.json() == {"explanation": "It fits together."}


def test_prompt_contains_only_given_facts():
    prompt = stack_explainer.build_prompt(stack_explainer.ExplainRequest(**BODY))
    assert "Next.js is built on React" in prompt and "Remix" in prompt
