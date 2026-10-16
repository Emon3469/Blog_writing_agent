from __future__ import annotations

import asyncio
import operator
import re
from typing import Annotated, List, Optional, TypedDict
from urllib.parse import quote

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, StreamWriter

from ..config import get_settings
from ..llm import AllProvidersFailed, invoke_structured, invoke_text, stream_text
from . import prompts
from .research import gather_evidence
from .schemas import EvidenceItem, ImagePlan, Plan, RouterDecision, Task

LENGTH_RANGES = {"short": (4, 5), "medium": (5, 7), "long": (7, 9)}
RECENCY = {"open_book": 7, "hybrid": 45, "closed_book": 3650}
MAX_IMAGES = 3
_section_slots = asyncio.Semaphore(get_settings().max_parallel_sections)


class Preferences(TypedDict, total=False):
    tone: str
    audience: str
    template: str
    length: str
    include_images: bool
    force_research: bool
    notes: str


class BlogState(TypedDict, total=False):
    topic: str
    as_of: str
    prefs: Preferences
    mode: str
    needs_research: bool
    queries: List[str]
    recency_days: int
    evidence: List[EvidenceItem]
    plan: Optional[Plan]
    sections: Annotated[List[tuple[int, str]], operator.add]
    providers: Annotated[List[str], operator.add]
    markdown: str


def _prefs_text(prefs: Preferences) -> str:
    lines = [
        f"{label}: {prefs[key]}"
        for key, label in (("template", "Template"), ("tone", "Tone"), ("audience", "Audience"), ("notes", "Extra notes"))
        if prefs.get(key)
    ]
    return "\n".join(lines) or "No extra preferences."


async def router_node(state: BlogState, writer: StreamWriter) -> dict:
    prefs = state.get("prefs", {})
    writer({"type": "stage", "stage": "router", "message": "Analysing the topic"})
    decision, provider = await invoke_structured(
        RouterDecision,
        [
            SystemMessage(content=prompts.ROUTER_SYSTEM),
            HumanMessage(content=f"Topic: {state['topic']}\nAs-of date: {state['as_of']}\n{_prefs_text(prefs)}"),
        ],
    )
    if prefs.get("force_research") and not decision.needs_research:
        decision.needs_research = True
        decision.mode = "hybrid"
        decision.queries = decision.queries or [state["topic"]]
    if not decision.needs_research:
        decision.mode = "closed_book"
    writer({"type": "route", "mode": decision.mode, "reason": decision.reason, "queries": decision.queries[:6]})
    return {
        "needs_research": decision.needs_research,
        "mode": decision.mode,
        "queries": decision.queries[:6],
        "recency_days": RECENCY[decision.mode],
        "providers": [provider],
    }


def route_next(state: BlogState) -> str:
    return "research" if state.get("needs_research") else "orchestrator"


async def research_node(state: BlogState, writer: StreamWriter) -> dict:
    writer({"type": "stage", "stage": "research", "message": "Searching the web for fresh sources"})
    evidence = await gather_evidence(state.get("queries", []), state["mode"], state["as_of"], state["recency_days"])
    writer(
        {
            "type": "research",
            "count": len(evidence),
            "sources": [{"title": e.title, "url": e.url, "source": e.source, "published_at": e.published_at} for e in evidence],
        }
    )
    return {"evidence": evidence}


async def orchestrator_node(state: BlogState, writer: StreamWriter) -> dict:
    prefs = state.get("prefs", {})
    mode = state.get("mode", "closed_book")
    evidence = state.get("evidence", [])
    low, high = LENGTH_RANGES.get(prefs.get("length", "medium"), LENGTH_RANGES["medium"])
    writer({"type": "stage", "stage": "plan", "message": "Drafting the outline"})

    evidence_text = "\n".join(f"- {e.title} | {e.url} | {e.published_at or 'unknown date'} | {(e.snippet or '')[:240]}" for e in evidence[:12])
    plan, provider = await invoke_structured(
        Plan,
        [
            SystemMessage(content=prompts.ORCH_SYSTEM.format(min_tasks=low, max_tasks=high)),
            HumanMessage(
                content=(
                    f"Topic: {state['topic']}\n"
                    f"Mode: {mode}\n"
                    f"As-of: {state['as_of']} (recency_days={state.get('recency_days', 3650)})\n"
                    f"{'Force blog_kind=news_roundup' if mode == 'open_book' else ''}\n"
                    f"{_prefs_text(prefs)}\n\n"
                    f"Evidence:\n{evidence_text or 'None'}"
                )
            ),
        ],
    )
    if mode == "open_book":
        plan.blog_kind = "news_roundup"
    plan.tasks = plan.tasks[:high]
    for index, task in enumerate(plan.tasks, start=1):
        task.id = index
        task.target_words = max(120, min(task.target_words, 450))
        task.bullets = task.bullets[:6]

    writer({"type": "plan", "plan": plan.model_dump()})
    return {"plan": plan, "providers": [provider]}


def fanout(state: BlogState) -> List[Send]:
    plan = state["plan"]
    return [
        Send(
            "worker",
            {
                "task": task,
                "plan": plan,
                "topic": state["topic"],
                "mode": state.get("mode", "closed_book"),
                "as_of": state["as_of"],
                "evidence": state.get("evidence", []),
            },
        )
        for task in plan.tasks
    ]


async def worker_node(payload: dict, writer: StreamWriter) -> dict:
    task: Task = payload["task"]
    plan: Plan = payload["plan"]
    evidence: List[EvidenceItem] = payload.get("evidence", [])
    needs_sources = task.requires_research or task.requires_citations or payload["mode"] == "open_book"
    evidence_text = (
        "\n".join(f"- {e.title} | {e.url} | {e.published_at or 'unknown date'}" for e in evidence[:12])
        if needs_sources
        else ""
    )
    bullets = "\n- " + "\n- ".join(task.bullets)

    messages = [
        SystemMessage(content=prompts.WORKER_SYSTEM),
        HumanMessage(
            content=(
                f"Blog title: {plan.blog_title}\n"
                f"Audience: {plan.audience}\n"
                f"Tone: {plan.tone}\n"
                f"Blog kind: {plan.blog_kind}\n"
                f"Constraints: {plan.constraints}\n"
                f"Topic: {payload['topic']}\n"
                f"Mode: {payload['mode']}\n"
                f"As-of: {payload['as_of']}\n\n"
                f"Section {task.id} of {len(plan.tasks)}: {task.title}\n"
                f"Goal: {task.goal}\n"
                f"Target words: {task.target_words}\n"
                f"requires_research: {task.requires_research}\n"
                f"requires_citations: {task.requires_citations}\n"
                f"requires_code: {task.requires_code}\n"
                f"Bullets:{bullets}\n\n"
                f"Evidence (only cite these URLs):\n{evidence_text or 'None'}"
            )
        ),
    ]

    async with _section_slots:
        writer({"type": "section_start", "id": task.id, "title": task.title})
        parts: List[str] = []
        provider = ""
        try:
            async for piece, provider in stream_text(messages):
                parts.append(piece)
                writer({"type": "section_delta", "id": task.id, "delta": piece})
            text = "".join(parts)
        except AllProvidersFailed as exc:
            if exc.wait_hint is None or parts:
                raise
            writer({"type": "section_reset", "id": task.id})
            text, provider = await invoke_text(messages)
        except Exception:
            writer({"type": "section_reset", "id": task.id})
            text, provider = await invoke_text(messages)

    section = _normalise_section(text, task.title)
    writer({"type": "section_done", "id": task.id, "markdown": section})
    return {"sections": [(task.id, section)], "providers": [provider]}


def _normalise_section(text: str, title: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:markdown|md)?\s*\n(.*?)\n```$", r"\1", text, flags=re.S).strip()
    if text.startswith("## "):
        return text
    if re.match(r"^#{1,6}\s+", text):
        return re.sub(r"^#{1,6}\s+", "## ", text, count=1)
    return f"## {title}\n\n{text}"


async def assemble_node(state: BlogState, writer: StreamWriter) -> dict:
    plan = state["plan"]
    prefs = state.get("prefs", {})
    ordered = [md for _, md in sorted(state.get("sections", []), key=lambda item: item[0])]
    body = "\n\n".join(ordered).strip()
    markdown = f"# {plan.blog_title}\n\n{body}\n"
    providers_used: List[str] = []

    if prefs.get("include_images"):
        writer({"type": "stage", "stage": "images", "message": "Designing illustrations"})
        try:
            image_plan, provider = await invoke_structured(
                ImagePlan,
                [
                    SystemMessage(content=prompts.IMAGES_SYSTEM.format(max_images=MAX_IMAGES)),
                    HumanMessage(content=f"Blog kind: {plan.blog_kind}\nTopic: {state['topic']}\n\n{_digest(ordered)}"),
                ],
            )
            providers_used.append(provider)
            markdown, images = _place_images(markdown, image_plan)
            if images:
                writer({"type": "images", "images": images})
        except Exception:
            pass

    sources = state.get("evidence", [])
    if sources and "[Source](" in markdown:
        cited = [e for e in sources if e.url in markdown]
        if cited:
            refs = "\n".join(f"- [{e.title}]({e.url})" for e in cited)
            markdown = f"{markdown.rstrip()}\n\n## References\n\n{refs}\n"

    return {"markdown": markdown, "providers": providers_used}


def _digest(sections: List[str]) -> str:
    parts = []
    for md in sections:
        heading, _, body = md.partition("\n")
        summary = " ".join(re.sub(r"[#*`>|_\[\]()-]", " ", body).split())[:280]
        parts.append(f"{heading.strip()}\n{summary}")
    return "\n\n".join(parts)


def _image_url(prompt: str, seed: int) -> str:
    styled = f"{prompt}. Clean flat vector illustration, white background, minimal, high contrast"
    return f"https://image.pollinations.ai/prompt/{quote(styled[:600])}?width=1280&height=720&nologo=true&seed={seed}"


def _place_images(markdown: str, image_plan: ImagePlan) -> tuple[str, List[dict]]:
    placed: List[dict] = []
    lines = markdown.split("\n")
    headings = {line.strip().lower(): i for i, line in enumerate(lines) if line.startswith("## ")}
    inserts: dict[int, List[str]] = {}

    for idx, spec in enumerate(image_plan.images[:MAX_IMAGES]):
        anchor = image_plan.anchors[idx] if idx < len(image_plan.anchors) else ""
        key = anchor.strip().lower()
        if not key.startswith("## "):
            key = f"## {key.lstrip('# ')}"
        line_no = headings.get(key)
        if line_no is None:
            line_no = next((i for h, i in headings.items() if key[3:] and key[3:] in h), None)
        if line_no is None:
            continue
        url = _image_url(spec.prompt, seed=len(placed) + 11)
        alt = spec.alt.replace("]", "").replace("[", "")
        block = ["", f"![{alt}]({url})", f"*{spec.caption.strip()}*"]
        inserts.setdefault(line_no, []).extend(block)
        placed.append({"url": url, "alt": alt, "caption": spec.caption})

    for line_no in sorted(inserts, reverse=True):
        lines[line_no + 1 : line_no + 1] = inserts[line_no]
    return "\n".join(lines), placed


def build_graph():
    graph = StateGraph(BlogState)
    graph.add_node("router", router_node)
    graph.add_node("research", research_node)
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("worker", worker_node)
    graph.add_node("assemble", assemble_node)

    graph.add_edge(START, "router")
    graph.add_conditional_edges("router", route_next, {"research": "research", "orchestrator": "orchestrator"})
    graph.add_edge("research", "orchestrator")
    graph.add_conditional_edges("orchestrator", fanout, ["worker"])
    graph.add_edge("worker", "assemble")
    graph.add_edge("assemble", END)
    return graph.compile()


blog_graph = build_graph()
