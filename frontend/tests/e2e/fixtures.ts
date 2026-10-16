import { test as base, expect, type Page, type Route } from "@playwright/test";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Event = Record<string, unknown> & { type: string };

export function sse(events: Event[]) {
  return ": connected\n\n" + events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

export const POST_MARKDOWN = [
  "# Shipping Faster With Trunk-Based Development",
  "",
  "## Why It Matters",
  "",
  "Small batches reduce risk. Teams that merge often find bugs sooner and release with confidence.",
  "",
  "## How To Start",
  "",
  "Use feature flags, keep branches short-lived and automate your tests. See [Source](https://example.com/tbd).",
  "",
  "## Takeaways",
  "",
  "Merge daily, keep the build green and measure lead time.",
].join("\n");

export function generationEvents(markdown = POST_MARKDOWN): Event[] {
  const sections = markdown.split("\n## ").slice(1).map((s, i) => ({ id: i + 1, md: `## ${s.trim()}` }));
  const title = markdown.split("\n")[0].replace(/^# /, "");
  return [
    { type: "stage", stage: "router", message: "Analysing the topic" },
    { type: "route", mode: "hybrid", reason: "Benefits from current examples.", queries: ["trunk based development 2026"] },
    { type: "stage", stage: "research", message: "Searching" },
    { type: "research", count: 1, sources: [{ title: "TBD guide", url: "https://example.com/tbd", source: "example.com" }] },
    { type: "stage", stage: "plan", message: "Outline" },
    {
      type: "plan",
      plan: {
        blog_title: title,
        audience: "Engineers",
        tone: "Practical",
        blog_kind: "explainer",
        tasks: sections.map((s) => ({ id: s.id, title: s.md.split("\n")[0].slice(3), goal: "g", target_words: 200 })),
      },
    },
    ...sections.flatMap((s) => [
      { type: "section_start", id: s.id, title: "" },
      { type: "section_delta", id: s.id, delta: s.md.slice(0, 20) },
      { type: "section_delta", id: s.id, delta: s.md.slice(20) },
      { type: "section_done", id: s.id, markdown: s.md },
    ]),
    {
      type: "done",
      title,
      markdown,
      mode: "hybrid",
      blog_kind: "explainer",
      providers: ["groq"],
      sources: [{ title: "TBD guide", url: "https://example.com/tbd", source: "example.com" }],
      elapsed_ms: 8421,
    },
  ];
}

export type ApiCalls = { generate: unknown[]; chat: unknown[]; tools: { action: string; body: unknown }[]; suggestions: number };

export async function mockApi(
  page: Page,
  overrides: Partial<{
    generate: (body: unknown) => Event[] | { status: number; body: unknown };
    chat: (body: unknown) => Event[];
    tool: (action: string, body: unknown) => Event[];
    suggestions: () => { status: number; body: unknown };
    healthStatus: number;
  }> = {},
): Promise<ApiCalls> {
  const calls: ApiCalls = { generate: [], chat: [], tools: [], suggestions: 0 };
  const stream = (route: Route, events: Event[]) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse(events) });
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" },
      });
    }
    const body = request.postDataJSON?.() ?? null;
    if (url.pathname === "/health") {
      return json(route, overrides.healthStatus ?? 200, {
        status: "ok",
        uptime_seconds: 10,
        research: true,
        providers: [
          { name: "openai", label: "OpenAI", model: "gpt-4.1-mini", available: true, cooldown_seconds: 0 },
          { name: "groq", label: "Groq", model: "openai/gpt-oss-120b", available: false, cooldown_seconds: 12 },
        ],
      });
    }
    if (url.pathname === "/api/generate") {
      calls.generate.push(body);
      const result = overrides.generate ? overrides.generate(body) : generationEvents();
      return Array.isArray(result) ? stream(route, result) : json(route, result.status, result.body);
    }
    if (url.pathname === "/api/chat") {
      calls.chat.push(body);
      const events = overrides.chat?.(body) ?? [
        { type: "delta", delta: "Here are **three** ideas:\n\n" },
        { type: "delta", delta: "1. Ship small\n2. Test often\n3. Measure" },
        { type: "done", provider: "groq" },
      ];
      return stream(route, events);
    }
    if (url.pathname.startsWith("/api/tools/")) {
      const action = url.pathname.split("/").pop()!;
      calls.tools.push({ action, body });
      return stream(
        route,
        overrides.tool?.(action, body) ?? [
          { type: "delta", delta: "There are many reasons " },
          { type: "delta", delta: "to use TypeScript." },
          { type: "done", provider: "groq" },
        ],
      );
    }
    if (url.pathname === "/api/suggestions") {
      calls.suggestions += 1;
      const res = overrides.suggestions?.() ?? {
        status: 200,
        body: {
          provider: "groq",
          suggestions: [
            { title: "Strengthen the opening hook", detail: "Lead with a concrete metric.", kind: "structure" },
            { title: "Add a code example", detail: "Show a feature flag in practice.", kind: "engagement" },
          ],
        },
      };
      return json(route, res.status, res.body);
    }
    return json(route, 404, { detail: "not mocked" });
  });
  return calls;
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && !/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d/.test(msg.text())) {
          errors.push(msg.text());
        }
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await use(errors);
      expect(errors, "unexpected console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
