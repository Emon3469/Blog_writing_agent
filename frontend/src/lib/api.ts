export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export type StreamEvent = { type: string; [key: string]: unknown };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res: Response) {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
  } catch {}
  if (res.status === 429 && !/too many/i.test(message)) message = "You're sending requests too quickly. Please wait a moment.";
  return new ApiError(message, res.status);
}

function networkError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return err;
  if (err instanceof ApiError) return err;
  return new ApiError("Can't reach the writing server. It may be waking up — try again in a few seconds.", 0);
}

export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok || !res.body) throw await errorFrom(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk: string) => {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    try {
      const event = JSON.parse(data) as StreamEvent;
      if (event.type === "error") throw new ApiError(String(event.message || "Generation failed"), 500);
      onEvent(event);
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let index: number;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        flush(chunk);
      }
    }
    if (buffer.trim()) flush(buffer);
  } catch (err) {
    throw networkError(err);
  } finally {
    reader.releaseLock();
  }
}

export async function streamText(
  path: string,
  body: unknown,
  onDelta: (delta: string, full: string) => void,
  signal?: AbortSignal,
  onNotice?: (message: string) => void,
) {
  let full = "";
  let provider = "";
  await streamEvents(
    path,
    body,
    (event) => {
      if (event.type === "delta" && typeof event.delta === "string") {
        full += event.delta;
        onDelta(event.delta, full);
      } else if (event.type === "done") {
        provider = String(event.provider || "");
      } else if ((event.type === "notice" || event.type === "queued") && onNotice) {
        onNotice(String(event.message || ""));
      }
    },
    signal,
  );
  return { text: full, provider };
}

export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

export type ProviderStatus = {
  name: string;
  label: string;
  model: string;
  available: boolean;
  cooldown_seconds: number;
};

export type Health = {
  status: string;
  uptime_seconds: number;
  providers: ProviderStatus[];
  research: boolean;
};

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${API_URL}/health`, { signal, cache: "no-store" });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
