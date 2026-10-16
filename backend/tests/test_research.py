from __future__ import annotations

import sys
import types
from datetime import date

from app.agent import research


def install_fake_tavily(monkeypatch, results_by_query, calls):
    class FakeClient:
        def __init__(self, api_key):
            self.api_key = api_key

        async def search(self, query, **kwargs):
            calls.append((query, kwargs))
            outcome = results_by_query.get(query, [])
            if isinstance(outcome, Exception):
                raise outcome
            return {"results": outcome}

    module = types.ModuleType("tavily")
    module.AsyncTavilyClient = FakeClient
    monkeypatch.setitem(sys.modules, "tavily", module)
    monkeypatch.setattr(research.get_settings(), "tavily_api_key", "tvly-test-key-123456")


async def test_no_key_returns_empty(monkeypatch):
    monkeypatch.setattr(research.get_settings(), "tavily_api_key", "")
    assert await research.gather_evidence(["q"], "hybrid", "2026-10-16", 45) == []


async def test_dedupes_and_normalises(monkeypatch):
    calls = []
    install_fake_tavily(
        monkeypatch,
        {
            "q1": [
                {"url": "https://a.com/x", "title": "A", "content": "  lots   of\n space ", "published_date": "Tue, 14 Oct 2026 10:00:00 GMT"},
                {"url": "", "title": "no url"},
            ],
            "q2": [{"url": "https://a.com/x", "title": "dup"}, {"url": "https://b.org/y", "title": "B"}],
            "q3": RuntimeError("network down"),
        },
        calls,
    )
    evidence = await research.gather_evidence(["q1", "q2", "q3"], "hybrid", "2026-10-16", 45)

    assert [e.url for e in evidence] == ["https://a.com/x", "https://b.org/y"]
    assert evidence[0].snippet == "lots of space"
    assert evidence[0].published_at == "2026-10-14"
    assert evidence[0].source == "a.com"
    assert all("topic" not in kw for _, kw in calls)


async def test_open_book_filters_old_items_and_uses_news(monkeypatch):
    calls = []
    install_fake_tavily(
        monkeypatch,
        {
            "news": [
                {"url": "https://new.com", "title": "new", "published_date": "2026-10-14"},
                {"url": "https://old.com", "title": "old", "published_date": "2026-08-01"},
                {"url": "https://nodate.com", "title": "undated"},
            ]
        },
        calls,
    )
    evidence = await research.gather_evidence(["news"], "open_book", "2026-10-16", 7)
    assert [e.url for e in evidence] == ["https://new.com"]
    assert calls[0][1]["topic"] == "news"


async def test_open_book_keeps_everything_when_nothing_is_recent(monkeypatch):
    install_fake_tavily(monkeypatch, {"q": [{"url": "https://old.com", "title": "old", "published_date": "2020-01-01"}]}, [])
    evidence = await research.gather_evidence(["q"], "open_book", "2026-10-16", 7)
    assert len(evidence) == 1


def test_date_parsing():
    assert research._to_date("2026-10-14T08:00:00Z") == date(2026, 10, 14)
    assert research._to_date("Tue, 14 Oct 2026 10:00:00 GMT") == date(2026, 10, 14)
    assert research._to_date("garbage") is None
    assert research._to_date(None) is None
