from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ..agent import prompts
from ..agent.graph import blog_graph
from ..agent.schemas import SuggestionList
from ..config import get_settings
from ..llm import AllProvidersFailed, invoke_structured, stream_text, wait_budget
from ..ratelimit import RateLimiter
from ..streaming import Emit, event_stream
from .models import ChatRequest, GenerateRequest, SuggestRequest, ToolRequest

settings = get_settings()
generate_limit = RateLimiter(settings.rate_limit_generate, settings.rate_limit_window)
request_limit = RateLimiter(settings.rate_limit_requests, settings.rate_limit_window)

router = APIRouter(prefix="/api")


class GenerationQueue:
    def __init__(self, slots: int) -> None:
        self.slots = asyncio.Semaphore(max(1, slots))
        self.waiting = 0

    @asynccontextmanager
    async def admit(self, emit: Emit):
        if self.slots.locked():
            self.waiting += 1
            await emit(
                {
                    "type": "queued",
                    "position": self.waiting,
                    "message": "Lots of writers right now. You're in the queue and will start shortly.",
                }
            )
            try:
                await self.slots.acquire()
            finally:
                self.waiting -= 1
        else:
            await self.slots.acquire()
        try:
            yield
        finally:
            self.slots.release()


generation_queue = GenerationQueue(settings.max_concurrent_generations)


@router.post("/generate", dependencies=[Depends(generate_limit)])
async def generate(body: GenerateRequest):
    async def produce(emit: Emit) -> None:
        started = time.perf_counter()
        async with generation_queue.admit(emit):
            wait_budget.set(settings.generation_wait_budget)
            await _generate(body, emit, started)

    return event_stream(produce)


async def _generate(body: GenerateRequest, emit: Emit, started: float) -> None:
    prefs = body.model_dump(exclude={"topic"}, exclude_none=True)
    inputs = {"topic": body.topic, "as_of": date.today().isoformat(), "prefs": prefs, "sections": [], "providers": []}
    final: dict = {}
    async for mode, chunk in blog_graph.astream(inputs, stream_mode=["custom", "values"]):
        if mode == "custom":
            await emit(chunk)
        else:
            final = chunk
    plan = final.get("plan")
    await emit(
        {
            "type": "done",
            "title": plan.blog_title if plan else body.topic,
            "markdown": final.get("markdown", ""),
            "mode": final.get("mode"),
            "blog_kind": plan.blog_kind if plan else None,
            "providers": sorted(set(p for p in final.get("providers", []) if p)),
            "sources": [e.model_dump() for e in final.get("evidence", [])],
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
        }
    )


@router.post("/chat", dependencies=[Depends(request_limit)])
async def chat(body: ChatRequest):
    system = prompts.CHAT_SYSTEM.format(today=date.today().isoformat())
    if body.context:
        system += f"\n\nThe user is working on this document. Use it as context when relevant:\n<document>\n{body.context}\n</document>"
    messages = [SystemMessage(content=system)]
    for message in body.messages[-20:]:
        cls = HumanMessage if message.role == "user" else AIMessage
        messages.append(cls(content=message.content))
    if not isinstance(messages[-1], HumanMessage):
        raise HTTPException(status_code=422, detail="The last message must come from the user")

    async def produce(emit: Emit) -> None:
        provider = ""
        async for piece, provider in stream_text(messages):
            await emit({"type": "delta", "delta": piece})
        await emit({"type": "done", "provider": provider})

    return event_stream(produce)


@router.post("/tools/{action}", dependencies=[Depends(request_limit)])
async def rewrite(action: str, body: ToolRequest):
    instruction = prompts.TOOL_INSTRUCTIONS.get(action)
    if instruction is None:
        raise HTTPException(status_code=404, detail=f"Unknown tool '{action}'")
    if body.instructions:
        instruction = f"{instruction} Additional guidance from the user: {body.instructions}"
    messages = [
        SystemMessage(content=prompts.TOOL_SYSTEM.format(instruction=instruction)),
        HumanMessage(content=body.text),
    ]

    async def produce(emit: Emit) -> None:
        provider = ""
        async for piece, provider in stream_text(messages):
            await emit({"type": "delta", "delta": piece})
        await emit({"type": "done", "provider": provider})

    return event_stream(produce)


@router.get("/tools")
async def list_tools():
    return {"tools": sorted(prompts.TOOL_INSTRUCTIONS)}


@router.post("/suggestions", dependencies=[Depends(request_limit)])
async def suggestions(body: SuggestRequest):
    try:
        result, provider = await invoke_structured(
            SuggestionList,
            [SystemMessage(content=prompts.SUGGEST_SYSTEM), HumanMessage(content=body.text[:12000])],
        )
    except AllProvidersFailed:
        raise HTTPException(status_code=503, detail="Suggestion service is temporarily unavailable") from None
    return {"suggestions": [s.model_dump() for s in result.suggestions[:4]], "provider": provider}
