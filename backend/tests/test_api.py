from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import llm, streaming
from app.agent import graph
from app.agent.schemas import Plan, RouterDecision, Suggestion, SuggestionList, Task
from app.main import app
from app.ratelimit import RateLimiter
from app.routers import writing
from tests.conftest import make_provider


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def read_events(response) -> list[dict]:
    events = []
    for block in response.text.split("\n\n"):
        data = [line[5:].strip() for line in block.splitlines() if line.startswith("data:")]
        if data:
            events.append(json.loads("\n".join(data)))
    return events


@pytest.fixture
def scripted_llm(monkeypatch, use_providers):
    use_providers(make_provider("groq", text="Here is a polished sentence."))

    async def structured(schema, messages):
        if schema is RouterDecision:
            return RouterDecision(needs_research=False, mode="closed_book", reason="evergreen"), "groq"
        if schema is Plan:
            return (
                Plan(
                    blog_title="Clean Code",
                    audience="devs",
                    tone="calm",
                    tasks=[Task(id=i, title=f"S{i}", goal="g", bullets=["a", "b", "c"], target_words=200) for i in (1, 2, 3)],
                ),
                "groq",
            )
        if schema is SuggestionList:
            return SuggestionList(suggestions=[Suggestion(title=f"T{i}", detail="d") for i in range(6)]), "groq"
        raise AssertionError(schema)

    async def stream(messages):
        title = str(messages[-1].content).split("Section ")[1].split(": ", 1)[1].split("\n")[0]
        for piece in (f"## {title}\n\n", "Some ", "content."):
            yield piece, "groq"

    monkeypatch.setattr(graph, "invoke_structured", structured)
    monkeypatch.setattr(graph, "stream_text", stream)
    monkeypatch.setattr(writing, "invoke_structured", structured)


def test_root_and_health(client, use_providers):
    use_providers(make_provider("groq", "openai/gpt-oss-120b"))
    assert client.get("/").json()["status"] == "ok"
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["providers"][0]["model"] == "openai/gpt-oss-120b"
    assert body["research"] is False
    assert client.head("/health").status_code == 200


def test_health_degraded_without_providers(client, use_providers):
    use_providers()
    assert client.get("/health").json()["status"] == "degraded"


def test_generate_streams_full_contract(client, scripted_llm):
    response = client.post("/api/generate", json={"topic": "  clean   code  ", "length": "short"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"].startswith("no-cache")
    assert response.headers["x-accel-buffering"] == "no"

    events = read_events(response)
    types = [e["type"] for e in events]
    assert types[0] == "stage" and types[-1] == "done"
    assert {"route", "plan", "section_start", "section_delta", "section_done"} <= set(types)
    done = events[-1]
    assert done["title"] == "Clean Code"
    assert done["markdown"].startswith("# Clean Code\n\n## S1")
    assert done["providers"] == ["groq"]
    assert done["mode"] == "closed_book"
    assert isinstance(done["elapsed_ms"], int)


def test_generate_reports_provider_outage_as_error_event(client, monkeypatch):
    async def down(schema, messages):
        raise llm.AllProvidersFailed("everything is down")

    monkeypatch.setattr(graph, "invoke_structured", down)
    events = read_events(client.post("/api/generate", json={"topic": "anything"}))
    assert events[-1]["type"] == "error"
    assert "unavailable" in events[-1]["message"]
    assert "everything is down" not in events[-1]["message"]


@pytest.mark.parametrize(
    "payload,field",
    [
        ({}, "topic"),
        ({"topic": "a"}, "topic"),
        ({"topic": "   ab   "}, "topic"),
        ({"topic": "x" * 401}, "topic"),
        ({"topic": "valid topic", "length": "huge"}, "length"),
    ],
)
def test_generate_validation(client, payload, field):
    response = client.post("/api/generate", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"].startswith(field)


def test_invalid_json_body(client):
    response = client.post("/api/generate", content="{not json", headers={"content-type": "application/json"})
    assert response.status_code == 422


def test_chat_streams_tokens(client, use_providers):
    use_providers(make_provider("groq", text="Sure thing, here you go"))
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "context": "# My doc\n\nBody"},
    )
    events = read_events(response)
    assert "".join(e["delta"] for e in events if e["type"] == "delta") == "Sure thing, here you go"
    assert events[-1] == {"type": "done", "provider": "groq"}


def test_chat_requires_last_message_from_user(client, use_providers):
    use_providers(make_provider())
    response = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]},
    )
    assert response.status_code == 422


def test_chat_rejects_bad_roles_and_empty_history(client):
    assert client.post("/api/chat", json={"messages": []}).status_code == 422
    assert client.post("/api/chat", json={"messages": [{"role": "system", "content": "x"}]}).status_code == 422


def test_chat_falls_back_between_providers(client, use_providers):
    use_providers(
        make_provider("openai", error=RuntimeError("401 invalid api key")),
        make_provider("anthropic", error=RuntimeError("400 credit balance is too low")),
        make_provider("groq", text="groq saved the day"),
    )
    events = read_events(client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}))
    assert events[-1]["provider"] == "groq"


def test_chat_error_event_when_everything_fails(client, use_providers):
    use_providers(make_provider("groq", error=RuntimeError("401 authentication")))
    events = read_events(client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}))
    assert events[-1]["type"] == "error"


@pytest.mark.parametrize("action", ["improve", "rephrase", "shorten", "fix-spelling", "expand", "summarize", "headline"])
def test_every_tool_streams(client, use_providers, action):
    use_providers(make_provider("groq", text="Rewritten text."))
    events = read_events(client.post(f"/api/tools/{action}", json={"text": "Some text", "instructions": "UK spelling"}))
    assert events[-1]["type"] == "done"
    assert "".join(e.get("delta", "") for e in events) == "Rewritten text."


def test_tool_list_and_unknown_tool(client):
    assert "shorten" in client.get("/api/tools").json()["tools"]
    assert client.post("/api/tools/teleport", json={"text": "x"}).status_code == 404
    assert client.post("/api/tools/shorten", json={"text": ""}).status_code == 422
    assert client.post("/api/tools/shorten", json={"text": "x" * 20001}).status_code == 422


def test_suggestions(client, scripted_llm):
    response = client.post("/api/suggestions", json={"text": "A draft long enough to review. " * 3})
    assert response.status_code == 200
    body = response.json()
    assert len(body["suggestions"]) == 4 and body["provider"] == "groq"


def test_suggestions_unavailable(client, monkeypatch):
    async def down(schema, messages):
        raise llm.AllProvidersFailed("down")

    monkeypatch.setattr(writing, "invoke_structured", down)
    response = client.post("/api/suggestions", json={"text": "A draft long enough to review. " * 3})
    assert response.status_code == 503


def test_suggestions_rejects_short_text(client):
    assert client.post("/api/suggestions", json={"text": "too short"}).status_code == 422


@pytest.mark.parametrize(
    "origin,allowed",
    [
        ("http://localhost:3000", True),
        ("https://draftsmith.example.com", True),
        ("https://draftsmith-git-main-me.vercel.app", True),
        ("https://evil.example.org", False),
        ("https://vercel.app.evil.com", False),
        ("https://evil.com/.vercel.app", False),
        ("http://localhost:3100", True),
        ("http://127.0.0.1:5173", True),
        ("http://localhost.evil.com", False),
    ],
)
def test_cors(client, origin, allowed):
    response = client.options(
        "/api/chat",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
    )
    assert (response.headers.get("access-control-allow-origin") == origin) is allowed


def test_rate_limiter_blocks_and_reports_retry(client, monkeypatch):
    limiter = RateLimiter(2, 60)
    app.dependency_overrides[writing.generate_limit] = limiter
    try:
        monkeypatch.setattr(streaming, "HEARTBEAT_SECONDS", 1)
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
        codes = [client.post("/api/generate", json={"topic": "x"}, headers=headers).status_code for _ in range(3)]
        assert codes == [422, 422, 429]
        blocked = client.post("/api/generate", json={"topic": "x"}, headers=headers)
        assert int(blocked.headers["retry-after"]) > 0
        other = client.post("/api/generate", json={"topic": "x"}, headers={"x-forwarded-for": "198.51.100.1"})
        assert other.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_sse_formatting_handles_unicode_and_newlines():
    frame = streaming.sse({"type": "delta", "delta": "line1\nline2 — ✓"})
    assert frame.startswith("event: delta\ndata: ")
    assert frame.endswith("\n\n")
    assert json.loads(frame.split("data: ", 1)[1])["delta"] == "line1\nline2 — ✓"


async def test_heartbeat_and_wait_notice(monkeypatch):
    monkeypatch.setattr(streaming, "HEARTBEAT_SECONDS", 0.01)
    import asyncio

    async def producer(emit):
        llm.wait_listener.get()(3.2)
        await asyncio.sleep(0.05)
        await emit({"type": "done"})

    frames = [frame async for frame in streaming._pump(producer)]
    joined = "".join(frames)
    assert frames[0] == ": connected\n\n"
    assert ": ping" in joined
    assert '"type": "notice"' in joined and "resuming in 4s" in joined
    assert joined.rstrip().endswith('{"type": "done"}')


async def test_generation_queue_reports_position_and_releases_slots():
    import asyncio

    queue = writing.GenerationQueue(1)
    seen: list[dict] = []

    async def emit(event):
        seen.append(event)

    gate = asyncio.Event()

    async def first():
        async with queue.admit(emit):
            await gate.wait()

    async def second():
        async with queue.admit(emit):
            seen.append({"type": "ran"})

    t1 = asyncio.create_task(first())
    await asyncio.sleep(0)
    t2 = asyncio.create_task(second())
    await asyncio.sleep(0)
    assert seen == [{"type": "queued", "position": 1, "message": seen[0]["message"]}]
    assert queue.waiting == 1
    gate.set()
    await asyncio.gather(t1, t2)
    assert seen[-1] == {"type": "ran"} and queue.waiting == 0 and not queue.slots.locked()


async def test_cancelled_while_queued_does_not_leak():
    import asyncio

    queue = writing.GenerationQueue(1)

    async def emit(event):
        pass

    gate = asyncio.Event()

    async def holder():
        async with queue.admit(emit):
            await gate.wait()

    async def waiter():
        async with queue.admit(emit):
            pass

    t1 = asyncio.create_task(holder())
    await asyncio.sleep(0)
    t2 = asyncio.create_task(waiter())
    await asyncio.sleep(0)
    t2.cancel()
    with pytest.raises(asyncio.CancelledError):
        await t2
    assert queue.waiting == 0
    gate.set()
    await t1
    assert not queue.slots.locked()
