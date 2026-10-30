"""Make the repo's /scripts importable in tests (layout generator + sizing)."""
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))


@pytest.fixture(autouse=True)
def _no_network_summaries(monkeypatch):
    """Phase 1C: by default, stub the Wikipedia summary service so the test suite
    never hits the network. The route then behaves as if no summary is available
    (summary = null), which is the graceful-degradation path. Tests that want to
    exercise summary population override get_summary_service themselves.
    """
    from app import main

    class _NullSummaryService:
        def get(self, slug, title):
            return None

    monkeypatch.setattr(main, "get_summary_service", lambda: _NullSummaryService())
