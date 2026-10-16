from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import HumanMessage, SystemMessage

from app import llm
from app.agent.schemas import Plan, RouterDecision, SuggestionList
from app.main import app

pytestmark = pytest.mark.live


def events(response) -> list[dict]:
    out = []
    for block in response.text.split("\n\n"):
        data = [line[5:].strip() for line in block.splitlines() if line.startswith("data:")]
        if data:
            out.append(json.loads("\n".join(data)))
    return out


@pytest.fixture(autouse=True)
def fresh_clients():
    llm.providers.cache_clear()
    yield
    llm.providers.cache_clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_at_least_one_provider_configured():
    assert llm.providers(), "configure OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY"


@pytest.mark.parametrize("schema", [RouterDecision, Plan, SuggestionList])
async def test_structured_output_through_fallback_chain(schema):
    result, provider = await llm.invoke_structured(
        schema,
        [
            SystemMessage(content="You plan technical blog posts."),
            HumanMessage(content="Topic: zero-downtime Postgres migrations. Draft: Migrations are risky. Use care."),
        ],
    )
    assert isinstance(result, schema) and provider


async def test_streaming_text():
    pieces = [piece async for piece, _ in llm.stream_text([HumanMessage(content="Name three primary colours.")])]
    assert len(pieces) > 1 and "".join(pieces).strip()


def test_chat_endpoint(client):
    out = events(client.post("/api/chat", json={"messages": [{"role": "user", "content": "One-line tip for better headlines?"}]}))
    assert out[-1]["type"] == "done", out[-1]
    assert "".join(e.get("delta", "") for e in out).strip()


def test_tool_endpoint(client):
    out = events(client.post("/api/tools/fix-spelling", json={"text": "Their are to many mistake in this sentense."}))
    assert out[-1]["type"] == "done", out[-1]
    assert "There are" in "".join(e.get("delta", "") for e in out)


def test_suggestions_endpoint(client):
    draft = "# Caching\n\nCaching is good. Caching is very good. You should cache things because caching is good. " * 3
    response = client.post("/api/suggestions", json={"text": draft})
    assert response.status_code == 200, response.text
    assert response.json()["suggestions"]


def test_full_generation(client):
    response = client.post("/api/generate", json={"topic": "A beginner's guide to HTTP caching headers", "length": "short"})
    out = events(response)
    done = out[-1]
    assert done["type"] == "done", done
    assert done["markdown"].startswith("# ")
    assert done["markdown"].count("\n## ") >= 3
    assert len(done["markdown"].split()) > 400
