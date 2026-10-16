from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Awaitable, Callable

from fastapi.responses import StreamingResponse

from .llm import AllProvidersFailed, wait_listener

logger = logging.getLogger("draftsmith.stream")

HEARTBEAT_SECONDS = 12
SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

Emit = Callable[[dict[str, Any]], Awaitable[None]]


def sse(event: dict[str, Any]) -> str:
    return f"event: {event.get('type', 'message')}\ndata: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, AllProvidersFailed):
        return "All language model providers are unavailable right now. Please try again in a moment."
    return "Something went wrong while generating. Please try again."


async def _pump(producer: Callable[[Emit], Awaitable[None]]) -> AsyncIterator[str]:
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    async def emit(event: dict[str, Any]) -> None:
        await queue.put(event)

    def on_wait(seconds: float) -> None:
        queue.put_nowait(
            {"type": "notice", "message": f"High demand right now, resuming in {int(seconds + 0.99)}s", "wait": round(seconds, 1)}
        )

    async def run() -> None:
        wait_listener.set(on_wait)
        try:
            await producer(emit)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("stream failed")
            await queue.put({"type": "error", "message": friendly_error(exc)})
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())
    yield ": connected\n\n"
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            if event is None:
                break
            yield sse(event)
    finally:
        if not task.done():
            task.cancel()


def event_stream(producer: Callable[[Emit], Awaitable[None]]) -> StreamingResponse:
    return StreamingResponse(_pump(producer), media_type="text/event-stream", headers=SSE_HEADERS)
