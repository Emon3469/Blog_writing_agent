from __future__ import annotations

import os
from typing import Any, Callable

import pytest

LIVE = os.getenv("RUN_LIVE") == "1"

if not LIVE:
    os.environ.update(
        {
            "OPENAI_API_KEY": "",
            "ANTHROPIC_API_KEY": "",
            "GROQ_API_KEY": "",
            "TAVILY_API_KEY": "",
            "RATE_LIMIT_GENERATE": "1000",
            "RATE_LIMIT_REQUESTS": "1000",
            "CORS_ORIGINS": "http://localhost:3000,https://draftsmith.example.com",
        }
    )

from langchain_core.messages import AIMessage, AIMessageChunk  # noqa: E402

from app import llm  # noqa: E402


def pytest_collection_modifyitems(config, items):
    skip_live = pytest.mark.skip(reason="set RUN_LIVE=1 to call real providers")
    for item in items:
        if "live" in item.keywords and not LIVE:
            item.add_marker(skip_live)
        if LIVE and "live" not in item.keywords:
            item.add_marker(pytest.mark.skip(reason="unit tests run without RUN_LIVE"))


class FakeStructured:
    def __init__(self, chat: FakeChat, schema: type, method: str | None) -> None:
        self.chat, self.schema, self.method = chat, schema, method

    async def ainvoke(self, messages):
        self.chat.calls.append(("structured", self.schema.__name__, self.method))
        outcome = self.chat.structured.get(self.method, self.chat.structured.get("*"))
        if isinstance(outcome, Exception):
            raise outcome
        if callable(outcome):
            return outcome(self.schema, messages)
        return outcome


class FakeChat:
    def __init__(
        self,
        text: str = "hello world",
        error: Exception | None = None,
        stream_fail_after: int | None = None,
        structured: dict[str | None, Any] | None = None,
    ) -> None:
        self.text = text
        self.error = error
        self.stream_fail_after = stream_fail_after
        self.structured = structured or {}
        self.calls: list[tuple] = []

    async def ainvoke(self, messages):
        self.calls.append(("invoke",))
        if self.error:
            raise self.error
        return AIMessage(content=self.text)

    async def astream(self, messages):
        self.calls.append(("stream",))
        if self.error:
            raise self.error
        for i, word in enumerate(self.text.split(" ")):
            if self.stream_fail_after is not None and i >= self.stream_fail_after:
                raise RuntimeError("connection reset mid-stream")
            yield AIMessageChunk(content=word if i == 0 else f" {word}")

    def with_structured_output(self, schema, method=None, **_: Any):
        return FakeStructured(self, schema, method)


def make_provider(name: str = "groq", model: str = "m1", **kwargs: Any) -> llm.Provider:
    return llm.Provider(name, name.title(), model, FakeChat(**kwargs))


@pytest.fixture
def use_providers(monkeypatch) -> Callable[..., tuple[llm.Provider, ...]]:
    def apply(*items: llm.Provider) -> tuple[llm.Provider, ...]:
        monkeypatch.setattr(llm, "providers", lambda: tuple(items))
        llm._cursor.clear()
        return items

    return apply


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    if not LIVE:
        monkeypatch.setattr(llm, "_sleep", fake_sleep)
        monkeypatch.setattr(llm, "_jitter", lambda: 0.0)
    return slept
