import { expect, mockApi, test } from "./fixtures";
import { LONG_DOC, seedLibrary } from "./seed";

test.describe("chat assistant", () => {
  test("streams a reply, keeps history and restores it after reload", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/chat");
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("Give me ideas");
    await input.press("Enter");

    await expect(page.getByText("Give me ideas").first()).toBeVisible();
    await expect(page.locator("strong", { hasText: "three" })).toBeVisible();
    await expect(page.getByText("via groq")).toBeVisible();
    await expect(page).toHaveURL(/\/chat\?c=c_/);
    expect(calls.chat[0]).toEqual({ messages: [{ role: "user", content: "Give me ideas" }] });

    await input.fill("And a follow up");
    await input.press("Enter");
    await expect(page.getByText("And a follow up").first()).toBeVisible();
    await expect.poll(() => calls.chat.length).toBe(2);
    expect((calls.chat[1] as { messages: unknown[] }).messages).toHaveLength(3);

    await page.reload();
    await expect(page.getByText("And a follow up").first()).toBeVisible();
    await expect(page.locator("aside").getByText("Give me ideas")).toBeVisible();
  });

  test("shift+enter adds a newline instead of sending", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/chat");
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("line one");
    await input.press("Shift+Enter");
    await input.pressSequentially("line two");
    await expect(input).toHaveValue("line one\nline two");
    expect(calls.chat).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  test("starter prompts send immediately", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/chat");
    await page.getByRole("button", { name: /Write an outline/ }).click();
    await expect.poll(() => calls.chat.length).toBe(1);
    expect(JSON.stringify(calls.chat[0])).toContain("Shipping LLM features");
  });

  test("uses an attached document as context", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_ctx", title: "Observability for Small Teams", content: LONG_DOC }]);
    const calls = await mockApi(page);
    await page.goto("/chat?doc=d_ctx");
    await expect(page.getByText("Observability for Small Teams")).toBeVisible();
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("Summarize my draft");
    await input.press("Enter");
    await expect.poll(() => calls.chat.length).toBe(1);
    expect((calls.chat[0] as { context: string }).context).toContain("# Observability for Small Teams");
  });

  test("shows errors and can try again", async ({ page }) => {
    let attempt = 0;
    const calls = await mockApi(page, {
      chat: () => {
        attempt += 1;
        return attempt === 1
          ? [{ type: "error", message: "All language model providers are unavailable right now." }]
          : [{ type: "delta", delta: "Recovered answer" }, { type: "done", provider: "openai" }];
      },
    });
    await page.goto("/chat");
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("Hello?");
    await input.press("Enter");
    await expect(page.getByText("All language model providers are unavailable right now.")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Recovered answer")).toBeVisible();
    expect((calls.chat[1] as { messages: unknown[] }).messages).toEqual([{ role: "user", content: "Hello?" }]);
  });

  test("deletes conversations", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("Delete me later");
    await input.press("Enter");
    const item = page.locator("aside").getByText("Delete me later");
    await expect(item).toBeVisible();
    await item.hover();
    await page.getByRole("button", { name: "Delete conversation" }).click();
    await expect(item).toBeHidden();
    await expect(page.getByText("What are we writing today?")).toBeVisible();
  });
});
