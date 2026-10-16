import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, API_URL, postJSON, streamEvents, streamText, type StreamEvent } from "@/lib/api";

function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" }, ...init });
}

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("streamEvents", () => {
  it("parses events split across arbitrary chunk boundaries", async () => {
    const payload =
      ': connected\n\nevent: delta\ndata: {"type":"delta","delta":"Hel"}\n\n: ping\n\nevent: delta\ndata: {"type":"delta","delta":"lo ✓"}\n\nevent: done\ndata: {"type":"done","provider":"groq"}\n\n';
    const chunks = payload.match(/[\s\S]{1,7}/g)!;
    const spy = mockFetch(async () => sseResponse(chunks));
    const events: StreamEvent[] = [];

    await streamEvents("/api/chat", { a: 1 }, (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual(["delta", "delta", "done"]);
    expect(events.map((e) => e.delta).join("")).toBe("Hello ✓");
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/chat`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ a: 1 });
  });

  it("handles CRLF line endings and a final event without trailing blank line", async () => {
    mockFetch(async () => sseResponse(['data: {"type":"delta","delta":"a"}\r\n\r\n', 'data: {"type":"done"}']));
    const events: StreamEvent[] = [];
    await streamEvents("/x", {}, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["delta", "done"]);
  });

  it("ignores malformed frames", async () => {
    mockFetch(async () => sseResponse(["data: {not json}\n\n", 'data: {"type":"done"}\n\n']));
    const events: StreamEvent[] = [];
    await streamEvents("/x", {}, (e) => events.push(e));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("turns server error events into ApiError", async () => {
    mockFetch(async () => sseResponse(['data: {"type":"error","message":"All providers are down"}\n\n']));
    await expect(streamEvents("/x", {}, () => {})).rejects.toThrow("All providers are down");
  });

  it("surfaces API validation details", async () => {
    mockFetch(async () => new Response(JSON.stringify({ detail: "topic: too short" }), { status: 422 }));
    await expect(streamEvents("/x", {}, () => {})).rejects.toMatchObject({ message: "topic: too short", status: 422 });
  });

  it("explains rate limiting", async () => {
    mockFetch(async () => new Response("oops", { status: 429 }));
    const err = await streamEvents("/x", {}, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/too quickly/);
  });

  it("maps network failures to a friendly waking-up message", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await streamEvents("/x", {}, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/waking up/);
  });

  it("passes aborts through untouched", async () => {
    mockFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const err = await streamEvents("/x", {}, () => {}).catch((e) => e);
    expect(err.name).toBe("AbortError");
  });
});

describe("streamText", () => {
  it("accumulates deltas, reports notices and returns provider", async () => {
    mockFetch(async () =>
      sseResponse([
        'data: {"type":"notice","message":"High demand right now, resuming in 3s"}\n\n',
        'data: {"type":"delta","delta":"Hi "}\n\n',
        'data: {"type":"delta","delta":"there"}\n\n',
        'data: {"type":"done","provider":"anthropic"}\n\n',
      ]),
    );
    const fulls: string[] = [];
    const notices: string[] = [];
    const res = await streamText("/api/chat", {}, (_, full) => fulls.push(full), undefined, (n) => notices.push(n));
    expect(res).toEqual({ text: "Hi there", provider: "anthropic" });
    expect(fulls).toEqual(["Hi ", "Hi there"]);
    expect(notices).toEqual(["High demand right now, resuming in 3s"]);
  });
});

describe("postJSON", () => {
  it("returns parsed JSON and throws on 503", async () => {
    mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(postJSON("/x", {})).resolves.toEqual({ ok: true });
    mockFetch(async () => new Response(JSON.stringify({ detail: "Suggestion service is temporarily unavailable" }), { status: 503 }));
    await expect(postJSON("/x", {})).rejects.toThrow("temporarily unavailable");
  });
});
