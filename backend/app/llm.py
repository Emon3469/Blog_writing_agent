from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, AsyncIterator, Awaitable, Callable, Sequence, TypeVar

from langchain_core.exceptions import OutputParserException
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, SystemMessage
from pydantic import BaseModel, ValidationError

from .config import get_settings

logger = logging.getLogger("draftsmith.llm")

T = TypeVar("T", bound=BaseModel)
R = TypeVar("R")

PLACEHOLDER_MARKERS = ("your_", "your-", "changeme", "xxxx", "<", "replace")
FATAL_MARKERS = (
    "401", "403", "authentication", "invalid api key", "invalid x-api-key",
    "permission", "credit balance", "insufficient_quota", "billing",
    "model_not_found", "does not exist", "decommissioned", "not_found_error",
)
QUOTA_MARKERS = ("insufficient_quota", "credit balance", "exceeded your current quota")
RATE_MARKERS = ("429", "rate limit", "rate_limit", "overloaded", "529", "too many requests")
MALFORMED_MARKERS = (
    "tool call validation", "failed to call a function", "failed_generation", "json_validate_failed",
    "failed to parse", "output_parse_failed", "invalid json",
)
RETRY_HINT = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s", re.I)
DEFAULT_WAIT_BUDGET = 30.0
MAX_ROUNDS = 12


class MalformedOutput(ValueError):
    pass


def _is_malformed(exc: Exception) -> bool:
    if isinstance(exc, (ValidationError, OutputParserException, json.JSONDecodeError, MalformedOutput)):
        return True
    text = str(exc).lower()
    return any(m in text for m in MALFORMED_MARKERS)


def _schema_instruction(schema: type[BaseModel]) -> SystemMessage:
    spec = json.dumps(schema.model_json_schema(), separators=(",", ":"))
    return SystemMessage(
        content=(
            "Respond with a single JSON object only, no prose and no code fences. "
            f"It must be an instance (not a description) of this JSON schema:\n{spec}"
        )
    )


class AllProvidersFailed(RuntimeError):
    def __init__(self, message: str, wait_hint: float | None = None) -> None:
        super().__init__(message)
        self.wait_hint = wait_hint


def is_configured(key: str | None) -> bool:
    if not key or len(key) < 12:
        return False
    lowered = key.lower()
    return not any(marker in lowered for marker in PLACEHOLDER_MARKERS)


@dataclass
class Provider:
    name: str
    label: str
    model: str
    chat: BaseChatModel
    disabled_until: float = 0.0
    failures: int = 0
    last_error: str | None = None
    rate_limited: bool = False
    retryable: bool = True
    structured_cache: dict[tuple[type, str | None], Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.name}:{self.model}"

    @property
    def available(self) -> bool:
        return time.monotonic() >= self.disabled_until

    @property
    def structured_methods(self) -> tuple[str | None, ...]:
        if self.name == "groq":
            return ("json_mode", "json_schema")
        if self.name == "openai":
            return ("function_calling", "json_mode")
        return (None,)

    def structured(self, schema: type[T], method: str | None = None):
        key = (schema, method)
        if key not in self.structured_cache:
            kwargs: dict[str, Any] = {}
            if method:
                kwargs["method"] = method
            if method == "json_schema":
                kwargs["strict"] = False
            self.structured_cache[key] = self.chat.with_structured_output(schema, **kwargs)
        return self.structured_cache[key]

    def mark_ok(self) -> None:
        self.failures = 0
        self.last_error = None
        self.rate_limited = False
        self.retryable = True
        self.disabled_until = 0.0

    def mark_failed(self, exc: Exception) -> None:
        self.failures += 1
        text = str(exc)
        lowered = text.lower()
        self.last_error = f"{type(exc).__name__}: {text[:160]}"
        self.rate_limited = False
        if isinstance(exc, MalformedOutput):
            cooldown = 2.0
        elif any(m in lowered for m in QUOTA_MARKERS):
            cooldown = 1800.0
        elif any(m in lowered for m in RATE_MARKERS):
            self.rate_limited = True
            hint = RETRY_HINT.search(text)
            cooldown = (int(hint.group(1) or 0) * 60 + float(hint.group(2)) + 0.5) if hint else 20.0
        elif any(m in lowered for m in FATAL_MARKERS):
            cooldown = 1800.0
        else:
            cooldown = min(30.0 * self.failures, 300.0)
        self.retryable = cooldown < 600
        self.disabled_until = time.monotonic() + cooldown
        logger.warning("%s failed (%s); cooling down %.0fs", self.key, self.last_error, cooldown)


def _split(raw: str) -> list[str]:
    return [m.strip() for m in raw.split(",") if m.strip()]


def _groq_kwargs(model: str) -> dict[str, Any]:
    if "gpt-oss" in model:
        return {"reasoning_effort": "low", "reasoning_format": "hidden"}
    if "qwen" in model:
        return {"reasoning_format": "hidden"}
    return {}


def _build(name: str) -> list[Provider]:
    s = get_settings()
    common = {"temperature": s.llm_temperature, "max_retries": 0, "timeout": s.llm_timeout}

    if name == "openai" and is_configured(s.openai_api_key):
        from langchain_openai import ChatOpenAI

        return [
            Provider("openai", "OpenAI", m, ChatOpenAI(model=m, api_key=s.openai_api_key, max_tokens=4096, **common))
            for m in _split(s.openai_model)
        ]
    if name == "anthropic" and is_configured(s.anthropic_api_key):
        from langchain_anthropic import ChatAnthropic

        return [
            Provider(
                "anthropic",
                "Anthropic",
                m,
                ChatAnthropic(
                    model=m,
                    api_key=s.anthropic_api_key,
                    max_tokens=4096,
                    temperature=s.llm_temperature,
                    max_retries=0,
                    default_request_timeout=s.llm_timeout,
                ),
            )
            for m in _split(s.anthropic_model)
        ]
    if name == "groq" and is_configured(s.groq_api_key):
        from langchain_groq import ChatGroq

        return [
            Provider(
                "groq",
                "Groq",
                m,
                ChatGroq(model=m, api_key=s.groq_api_key, max_tokens=4096, **common, **_groq_kwargs(m)),
            )
            for m in _split(s.groq_model)
        ]
    return []


@lru_cache
def providers() -> tuple[Provider, ...]:
    built = [p for name in get_settings().provider_sequence for p in _build(name)]
    if not built:
        logger.error("no LLM provider configured; set OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY")
    return tuple(built)


_cursor: dict[str, int] = {}

_sleep = asyncio.sleep


def _jitter() -> float:
    return random.uniform(0.05, 1.5)


wait_listener: ContextVar[Callable[[float], None] | None] = ContextVar("wait_listener", default=None)
wait_budget: ContextVar[float] = ContextVar("wait_budget", default=DEFAULT_WAIT_BUDGET)


async def _pause(seconds: float) -> None:
    listener = wait_listener.get()
    if listener and seconds >= 1:
        try:
            listener(seconds)
        except Exception:
            pass
    await _sleep(seconds + (_jitter() if seconds >= 0.5 else 0))


def _ordered() -> list[Provider]:
    ready = [p for p in providers() if p.available]
    groups: dict[str, list[Provider]] = {}
    for p in ready:
        groups.setdefault(p.name, []).append(p)
    ordered: list[Provider] = []
    for name, group in groups.items():
        start = _cursor.get(name, 0) % len(group)
        _cursor[name] = start + 1
        ordered.extend(group[start:] + group[:start])
    return ordered


def _wait_hint() -> float | None:
    now = time.monotonic()
    waits = [p.disabled_until - now for p in providers() if p.retryable and not p.available]
    return max(0.5, min(waits)) if waits else None


def _next_wait(deadline: float) -> float | None:
    if any(p.available for p in providers()):
        return 0.0
    wait = _wait_hint()
    if wait is None or time.monotonic() + wait > deadline:
        return None
    return wait


async def _with_fallback(call: Callable[[Provider], Awaitable[R]]) -> tuple[R, str]:
    errors: list[str] = []
    deadline = time.monotonic() + wait_budget.get()
    for _ in range(MAX_ROUNDS):
        for provider in _ordered():
            try:
                result = await call(provider)
                provider.mark_ok()
                return result, provider.name
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                provider.mark_failed(exc)
                errors.append(f"{provider.key}: {str(exc)[:200]}")
        wait = _next_wait(deadline)
        if wait is None:
            break
        await _pause(wait)
    raise AllProvidersFailed("; ".join(errors[-6:]) or "no provider available", _wait_hint())


async def invoke_structured(schema: type[T], messages: Sequence[BaseMessage]) -> tuple[T, str]:
    async def call(provider: Provider) -> T:
        last: Exception | None = None
        for method in provider.structured_methods:
            prompt = list(messages)
            if method == "json_mode":
                prompt = [prompt[0], _schema_instruction(schema), *prompt[1:]] if prompt else [_schema_instruction(schema)]
            try:
                result = await provider.structured(schema, method).ainvoke(prompt)
                if result is None:
                    raise MalformedOutput("empty structured response")
                return schema.model_validate(result) if isinstance(result, dict) else result
            except Exception as exc:
                if not _is_malformed(exc):
                    raise
                last = exc
                logger.info("%s returned malformed %s via %s; trying next method", provider.key, schema.__name__, method)
        raise MalformedOutput(str(last))

    return await _with_fallback(call)


async def invoke_text(messages: Sequence[BaseMessage]) -> tuple[str, str]:
    async def call(provider: Provider) -> str:
        msg = await provider.chat.ainvoke(list(messages))
        text = _text(msg.content)
        if not text.strip():
            raise ValueError("empty response")
        return text

    return await _with_fallback(call)


async def stream_text(messages: Sequence[BaseMessage]) -> AsyncIterator[tuple[str, str]]:
    errors: list[str] = []
    deadline = time.monotonic() + wait_budget.get()
    for _ in range(MAX_ROUNDS):
        for provider in _ordered():
            started = False
            try:
                async for chunk in provider.chat.astream(list(messages)):
                    piece = _text(chunk.content)
                    if piece:
                        started = True
                        yield piece, provider.name
                if not started:
                    raise ValueError("empty stream")
                provider.mark_ok()
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                provider.mark_failed(exc)
                errors.append(f"{provider.key}: {str(exc)[:200]}")
                if started:
                    raise
        wait = _next_wait(deadline)
        if wait is None:
            break
        await _pause(wait)
    raise AllProvidersFailed("; ".join(errors[-6:]) or "no provider available", _wait_hint())


def _text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block if isinstance(block, str) else block.get("text", "")
            for block in content
            if isinstance(block, str) or (isinstance(block, dict) and block.get("type") == "text")
        )
    return ""


def provider_status() -> list[dict[str, Any]]:
    now = time.monotonic()
    return [
        {
            "name": p.name,
            "label": p.label,
            "model": p.model,
            "available": p.available,
            "cooldown_seconds": max(0, int(p.disabled_until - now)),
        }
        for p in providers()
    ]
