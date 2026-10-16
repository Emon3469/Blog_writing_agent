from __future__ import annotations

import pytest
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app import llm
from tests.conftest import make_provider


class Answer(BaseModel):
    value: str


MSGS = [HumanMessage(content="hi")]


@pytest.mark.parametrize(
    "key,expected",
    [
        (None, False),
        ("", False),
        ("short", False),
        ("YOUR_OPENAI_API_KEY_HERE", False),
        ("<paste-key-here-please>", False),
        ("sk-proj-abcdefghijklmnop", True),
        ("gsk_1234567890abcdefgh", True),
    ],
)
def test_is_configured(key, expected):
    assert llm.is_configured(key) is expected


async def test_text_falls_back_and_cools_down_auth_failures(use_providers):
    bad = make_provider("openai", error=RuntimeError("Error code: 401 - invalid api key"))
    good = make_provider("groq", text="fallback answer")
    use_providers(bad, good)

    text, provider = await llm.invoke_text(MSGS)

    assert (text, provider) == ("fallback answer", "groq")
    assert not bad.available
    assert bad.disabled_until - llm.time.monotonic() > 1000


async def test_rate_limit_uses_retry_hint():
    p = make_provider()
    p.mark_failed(RuntimeError("Error code: 429 - Rate limit reached. Please try again in 12.25s."))
    remaining = p.disabled_until - llm.time.monotonic()
    assert p.rate_limited
    assert 12 < remaining < 14


async def test_rate_limit_with_minutes_hint():
    p = make_provider()
    p.mark_failed(RuntimeError("429 rate limit: try again in 1m2.5s"))
    assert 62 < p.disabled_until - llm.time.monotonic() < 64


async def test_groq_rate_limit_mentioning_billing_is_not_treated_as_fatal():
    p = make_provider()
    p.mark_failed(
        RuntimeError(
            "Error code: 429 - Rate limit reached on tokens per minute. Please try again in 3.5s. "
            "Need more tokens? Upgrade at https://console.groq.com/settings/billing"
        )
    )
    assert p.rate_limited
    assert p.disabled_until - llm.time.monotonic() < 5


@pytest.mark.parametrize(
    "message",
    [
        "Error code: 400 - Your credit balance is too low to access the API",
        "Error code: 429 - You exceeded your current quota (insufficient_quota)",
        "Error code: 404 - model_not_found",
    ],
)
async def test_quota_and_missing_model_get_long_cooldown(message):
    p = make_provider()
    p.mark_failed(RuntimeError(message))
    assert not p.rate_limited
    assert p.disabled_until - llm.time.monotonic() > 1000


async def test_successful_call_resets_provider_state(use_providers):
    p = make_provider(text="ok")
    use_providers(p)
    p.failures, p.last_error = 3, "boom"
    await llm.invoke_text(MSGS)
    assert p.failures == 0 and p.last_error is None and p.available


async def test_structured_tries_next_method_on_malformed_output(use_providers):
    p = make_provider(
        "groq",
        structured={
            "json_mode": llm.MalformedOutput("Failed to parse Answer from completion"),
            "json_schema": Answer(value="from json_schema"),
        },
    )
    use_providers(p)

    result, provider = await llm.invoke_structured(Answer, MSGS)

    assert result.value == "from json_schema" and provider == "groq"
    assert [c[2] for c in p.chat.calls] == ["json_mode", "json_schema"]


async def test_structured_malformed_everywhere_moves_to_next_provider_without_cooldown(use_providers):
    flaky = make_provider("groq", "a", structured={"*": RuntimeError("Tool call validation failed: missing field")})
    solid = make_provider("groq", "b", structured={"*": {"value": "dict output"}})
    use_providers(flaky, solid)

    result, _ = await llm.invoke_structured(Answer, MSGS)

    assert isinstance(result, Answer) and result.value == "dict output"
    assert flaky.retryable and flaky.disabled_until - llm.time.monotonic() <= 2


async def test_json_mode_injects_schema_instruction(use_providers):
    seen = {}

    def capture(schema, messages):
        seen["messages"] = messages
        return schema(value="x")

    p = make_provider("groq", structured={"json_mode": capture})
    use_providers(p)
    await llm.invoke_structured(Answer, MSGS)
    assert any("JSON schema" in str(m.content) for m in seen["messages"])


async def test_stream_falls_back_before_first_token(use_providers):
    down = make_provider("anthropic", error=RuntimeError("Error code: 529 overloaded"))
    up = make_provider("groq", text="streamed reply here")
    use_providers(down, up)

    pieces = [piece async for piece, _ in llm.stream_text(MSGS)]

    assert "".join(pieces) == "streamed reply here"


async def test_stream_failure_after_first_token_is_raised(use_providers):
    broken = make_provider(text="one two three", stream_fail_after=1)
    backup = make_provider("groq", "m2", text="never used")
    use_providers(broken, backup)

    with pytest.raises(RuntimeError, match="mid-stream"):
        async for _ in llm.stream_text(MSGS):
            pass
    assert backup.chat.calls == []


async def test_all_providers_failing_raises(use_providers):
    use_providers(
        make_provider("openai", error=RuntimeError("401 authentication failed")),
        make_provider("groq", error=RuntimeError("403 permission denied")),
    )
    with pytest.raises(llm.AllProvidersFailed):
        await llm.invoke_text(MSGS)


async def test_no_providers_configured_raises(use_providers):
    use_providers()
    with pytest.raises(llm.AllProvidersFailed):
        await llm.invoke_text(MSGS)


async def test_waits_for_short_rate_limit_then_succeeds(use_providers, monkeypatch):
    p = make_provider(error=RuntimeError("429 rate limit, try again in 4s"))
    use_providers(p)
    waits: list[float] = []
    notices: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        waits.append(seconds)
        p.chat.error = None
        p.disabled_until = 0

    monkeypatch.setattr(llm, "_sleep", fake_sleep)
    token = llm.wait_listener.set(notices.append)
    try:
        text, _ = await llm.invoke_text(MSGS)
    finally:
        llm.wait_listener.reset(token)

    assert text == "hello world"
    assert waits and 3 < waits[0] < 6
    assert notices == waits


async def test_does_not_wait_for_long_rate_limits(use_providers, no_real_sleep):
    use_providers(make_provider(error=RuntimeError("429 rate limit, try again in 5m0s")))
    with pytest.raises(llm.AllProvidersFailed) as info:
        await llm.invoke_text(MSGS)
    assert no_real_sleep == []
    assert info.value.wait_hint and info.value.wait_hint > 200


async def test_models_of_same_provider_rotate(use_providers):
    a = make_provider("groq", "a", text="from a")
    b = make_provider("groq", "b", text="from b")
    use_providers(a, b)
    first = (await llm.invoke_text(MSGS))[0]
    second = (await llm.invoke_text(MSGS))[0]
    assert {first, second} == {"from a", "from b"}


async def test_priority_order_between_providers_is_kept(use_providers):
    primary = make_provider("openai", text="primary")
    secondary = make_provider("groq", text="secondary")
    use_providers(primary, secondary)
    for _ in range(3):
        assert (await llm.invoke_text(MSGS))[0] == "primary"


async def test_empty_text_response_falls_back(use_providers):
    use_providers(make_provider("openai", text="   "), make_provider("groq", text="real"))
    assert (await llm.invoke_text(MSGS))[0] == "real"


def test_content_blocks_are_flattened():
    blocks = [{"type": "text", "text": "a"}, {"type": "thinking", "thinking": "zzz"}, "b"]
    assert llm._text(blocks) == "ab"
    assert llm._text(None) == ""


def test_provider_status_shape(use_providers):
    use_providers(make_provider("groq", "x"))
    (status,) = llm.provider_status()
    assert set(status) == {"name", "label", "model", "available", "cooldown_seconds"}


async def test_wait_budget_controls_how_long_we_wait(use_providers, monkeypatch):
    p = make_provider(error=RuntimeError("429 rate limit, try again in 45s"))
    use_providers(p)
    waits: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        waits.append(seconds)
        p.chat.error = None
        p.disabled_until = 0

    monkeypatch.setattr(llm, "_sleep", fake_sleep)
    with pytest.raises(llm.AllProvidersFailed):
        await llm.invoke_text(MSGS)
    assert waits == []

    p.chat.error = RuntimeError("429 rate limit, try again in 45s")
    p.disabled_until = 0
    token = llm.wait_budget.set(90)
    try:
        text, _ = await llm.invoke_text(MSGS)
    finally:
        llm.wait_budget.reset(token)
    assert text == "hello world" and 44 < waits[0] < 47


async def test_stream_waits_for_rate_limit_reset(use_providers, monkeypatch):
    p = make_provider(text="after the wait", error=RuntimeError("429 rate limit, try again in 2s"))
    use_providers(p)

    async def fake_sleep(seconds: float) -> None:
        p.chat.error = None
        p.disabled_until = 0

    monkeypatch.setattr(llm, "_sleep", fake_sleep)
    assert "".join([x async for x, _ in llm.stream_text(MSGS)]) == "after the wait"


async def test_fatal_errors_never_wait(use_providers, no_real_sleep):
    use_providers(make_provider(error=RuntimeError("401 invalid api key")))
    token = llm.wait_budget.set(600)
    try:
        with pytest.raises(llm.AllProvidersFailed):
            await llm.invoke_text(MSGS)
    finally:
        llm.wait_budget.reset(token)
    assert no_real_sleep == []
