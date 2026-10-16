from __future__ import annotations

from typing import Any

import pytest

from app.agent import graph
from app.agent.schemas import (
    EvidenceItem,
    ImagePlan,
    ImageSpec,
    Plan,
    RouterDecision,
    Task,
)
from app.llm import AllProvidersFailed


def make_plan(n: int = 4, citations: bool = False) -> Plan:
    return Plan(
        blog_title="Testing Agents",
        audience="Engineers",
        tone="Direct",
        blog_kind="explainer",
        tasks=[
            Task(
                id=99 - i,
                title=f"Part {i}",
                goal="Explain",
                bullets=["a", "b", "c", "d", "e", "f", "g"],
                target_words=900 if i == 1 else 50,
                requires_citations=citations,
            )
            for i in range(1, n + 1)
        ],
    )


class Scripted:
    def __init__(self, decision: RouterDecision, plan: Plan, images: ImagePlan | None = None, fail_images: bool = False):
        self.decision, self.plan, self.images, self.fail_images = decision, plan, images, fail_images
        self.prompts: dict[str, list[str]] = {}

    async def invoke_structured(self, schema, messages):
        self.prompts.setdefault(schema.__name__, []).append(str(messages[-1].content))
        if schema is RouterDecision:
            return self.decision.model_copy(), "groq"
        if schema is Plan:
            return self.plan.model_copy(deep=True), "groq"
        if schema is ImagePlan:
            if self.fail_images:
                raise AllProvidersFailed("down")
            return self.images or ImagePlan(), "groq"
        raise AssertionError(schema)

    async def stream_text(self, messages):
        prompt = str(messages[-1].content)
        self.prompts.setdefault("worker", []).append(prompt)
        title = prompt.split("Section ")[1].split(": ", 1)[1].split("\n")[0]
        body = f"## {title}\n\nBody for {title}. See [Source](https://example.com/a)."
        for word in body.split(" "):
            yield word + " ", "groq"

    async def invoke_text(self, messages):
        return "## Recovered\n\nText", "groq"


async def run(monkeypatch, scripted: Scripted, prefs: dict[str, Any] | None = None, evidence: list[EvidenceItem] | None = None):
    monkeypatch.setattr(graph, "invoke_structured", scripted.invoke_structured)
    monkeypatch.setattr(graph, "stream_text", scripted.stream_text)
    monkeypatch.setattr(graph, "invoke_text", scripted.invoke_text)

    async def fake_evidence(queries, mode, as_of, recency_days):
        scripted.prompts["research"] = [mode, str(recency_days), *queries]
        return evidence or []

    monkeypatch.setattr(graph, "gather_evidence", fake_evidence)
    events: list[dict] = []
    final: dict = {}
    inputs = {"topic": "Agents", "as_of": "2026-10-16", "prefs": prefs or {}, "sections": [], "providers": []}
    async for mode, chunk in graph.blog_graph.astream(inputs, stream_mode=["custom", "values"]):
        if mode == "custom":
            events.append(chunk)
        else:
            final = chunk
    return events, final


async def test_closed_book_skips_research_and_orders_sections(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="evergreen"), make_plan(4))
    events, final = await run(monkeypatch, scripted)

    types = [e["type"] for e in events]
    assert types[0] == "stage" and "research" not in types
    assert types.count("section_start") == types.count("section_done") == 4
    assert types.index("plan") < types.index("section_start")
    md = final["markdown"]
    assert md.startswith("# Testing Agents\n")
    positions = [md.index(f"## Part {i}") for i in range(1, 5)]
    assert positions == sorted(positions)
    assert "research" not in scripted.prompts
    assert "Evidence (only cite these URLs):\nNone" in scripted.prompts["worker"][0]


async def test_plan_is_normalised(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(12))
    events, final = await run(monkeypatch, scripted, prefs={"length": "short"})
    plan = final["plan"]
    assert len(plan.tasks) == 5
    assert [t.id for t in plan.tasks] == [1, 2, 3, 4, 5]
    assert all(120 <= t.target_words <= 450 for t in plan.tasks)
    assert all(len(t.bullets) <= 6 for t in plan.tasks)


async def test_router_inconsistency_is_corrected(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="hybrid", reason="x"), make_plan(3))
    _, final = await run(monkeypatch, scripted)
    assert final["mode"] == "closed_book"


async def test_force_research_triggers_research(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(3))
    events, final = await run(monkeypatch, scripted, prefs={"force_research": True})
    assert final["mode"] == "hybrid"
    assert scripted.prompts["research"][2] == "Agents"
    assert any(e["type"] == "research" for e in events)


async def test_open_book_forces_news_and_cites_references(monkeypatch):
    evidence = [EvidenceItem(title="A", url="https://example.com/a", published_at="2026-10-15")]
    scripted = Scripted(
        RouterDecision(needs_research=True, mode="open_book", reason="news", queries=["agents news"]),
        make_plan(3),
    )
    events, final = await run(monkeypatch, scripted, evidence=evidence)

    assert final["plan"].blog_kind == "news_roundup"
    assert scripted.prompts["research"][:2] == ["open_book", "7"]
    research = next(e for e in events if e["type"] == "research")
    assert research["count"] == 1
    assert "## References" in final["markdown"] and "(https://example.com/a)" in final["markdown"]
    assert "https://example.com/a" in scripted.prompts["worker"][0]


async def test_images_are_placed_under_matching_headings(monkeypatch):
    images = ImagePlan(
        images=[
            ImageSpec(placeholder="[[IMAGE_1]]", alt="Flow [diagram]", caption="The flow", prompt="flow"),
            ImageSpec(placeholder="[[IMAGE_2]]", alt="Missing", caption="none", prompt="x"),
        ],
        anchors=["Part 2", "## Does Not Exist"],
    )
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(3), images)
    events, final = await run(monkeypatch, scripted, prefs={"include_images": True})

    md = final["markdown"]
    assert md.count("![") == 1
    assert md.index("## Part 2") < md.index("![Flow diagram](https://image.pollinations.ai/") < md.index("## Part 3")
    assert next(e for e in events if e["type"] == "images")["images"][0]["alt"] == "Flow diagram"


async def test_image_failure_does_not_break_post(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(2), fail_images=True)
    _, final = await run(monkeypatch, scripted, prefs={"include_images": True})
    assert "![" not in final["markdown"] and "## Part 2" in final["markdown"]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("## Title\n\nBody", "## Title\n\nBody"),
        ("# Title\n\nBody", "## Title\n\nBody"),
        ("### Title\nBody", "## Title\nBody"),
        ("Just body text", "## Fallback\n\nJust body text"),
        ("```markdown\n## Fenced\n\nBody\n```", "## Fenced\n\nBody"),
        ("  \n## Padded\n\nBody  \n", "## Padded\n\nBody"),
    ],
)
def test_normalise_section(raw, expected):
    assert graph._normalise_section(raw, "Fallback") == expected


def test_digest_is_compact():
    long_body = "word " * 500
    digest = graph._digest([f"## One\n\n{long_body}", "## Two\n\n**bold** [link](http://x)"])
    assert digest.startswith("## One\n")
    assert "## Two" in digest
    assert len(digest) < 700


def test_image_url_is_encoded():
    url = graph._image_url("a & b / c?", seed=3)
    assert url.startswith("https://image.pollinations.ai/prompt/")
    assert " " not in url and "&b" not in url and url.endswith("seed=3")


async def test_rate_limited_section_gets_a_second_chance(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(2))
    original = scripted.stream_text

    async def flaky_stream(messages):
        if "Part 1" in str(messages[-1].content):
            raise AllProvidersFailed("busy", wait_hint=8.0)
        async for item in original(messages):
            yield item

    scripted.stream_text = flaky_stream
    events, final = await run(monkeypatch, scripted)
    assert "## Recovered" in final["markdown"] and "## Part 2" in final["markdown"]
    assert any(e["type"] == "section_reset" for e in events)


async def test_hard_outage_in_section_fails_generation(monkeypatch):
    scripted = Scripted(RouterDecision(needs_research=False, mode="closed_book", reason="x"), make_plan(2))

    async def dead_stream(messages):
        raise AllProvidersFailed("keys revoked", wait_hint=None)
        yield

    scripted.stream_text = dead_stream
    with pytest.raises(AllProvidersFailed):
        await run(monkeypatch, scripted)
