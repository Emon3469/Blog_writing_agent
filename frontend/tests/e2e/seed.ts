import type { Page } from "@playwright/test";

export type SeedDoc = {
  id: string;
  title: string;
  content: string;
  status?: "draft" | "published";
  template?: string;
  daysAgo?: number;
};

export async function seedLibrary(page: Page, docs: SeedDoc[], extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const state = {
    docs: docs.map((d) => {
      const at = new Date(now - (d.daysAgo ?? 0) * 86400000).toISOString();
      return {
        id: d.id,
        title: d.title,
        content: d.content,
        status: d.status ?? "draft",
        template: d.template,
        createdAt: at,
        updatedAt: at,
        origin: "manual",
      };
    }),
    conversations: [],
    notices: [],
    doneSuggestions: [],
    suggestionCache: {},
    ...extra,
  };
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("draftsmith.library.v1", value);
      sessionStorage.setItem("__seeded", "1");
    }
  }, JSON.stringify(state));
}

export const LONG_DOC = [
  "# Observability for Small Teams",
  "",
  "## Why bother",
  "",
  "Logs, metrics and traces tell you what your system is doing. Without them you are guessing. ".repeat(4),
  "",
  "## Getting started",
  "",
  "Pick one tool, instrument the critical path, and set two alerts that actually page someone. ".repeat(4),
].join("\n");
