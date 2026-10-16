import { expect, mockApi, test } from "./fixtures";
import { seedLibrary } from "./seed";

test.describe("rewrite tools", () => {
  test("runs the selected tool and saves the result", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/tools?mode=fix-spelling");
    await page.getByRole("button", { name: "Try a sample" }).click();
    await page.getByPlaceholder(/Optional guidance/).fill("US spelling");
    await page.locator("section").getByRole("button", { name: "Fix Spelling" }).click();

    await expect(page.getByText("There are many reasons to use TypeScript.")).toBeVisible();
    await expect(page.getByText(/via groq/i)).toBeVisible();
    expect(calls.tools[0].action).toBe("fix-spelling");
    expect(calls.tools[0].body).toMatchObject({ instructions: "US spelling" });

    await page.getByRole("button", { name: "Save as document" }).click();
    await expect(page).toHaveURL(/\/documents\/d_/);
    await expect(page.getByText("There are many reasons to use TypeScript.")).toBeVisible();
  });

  test("every mode calls its endpoint", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/tools");
    await page.getByPlaceholder(/Paste a paragraph/).fill("Some text to transform.");
    const modes: [string, string][] = [
      ["AI Writing", "improve"],
      ["Rephrase", "rephrase"],
      ["Shorten", "shorten"],
      ["Expand", "expand"],
      ["Summarize", "summarize"],
      ["Headlines", "headline"],
    ];
    for (const [label, action] of modes) {
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await page.locator("section").getByRole("button", { name: label, exact: true }).click();
      await expect.poll(() => calls.tools.at(-1)?.action).toBe(action);
      await expect(page.getByText("There are many reasons to use TypeScript.")).toBeVisible();
    }
  });

  test("applies a rewrite back to a document", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_src", title: "Source", content: "# Source\n\nTeh orignal text." }]);
    await mockApi(page);
    await page.goto("/tools?doc=d_src&mode=fix-spelling");
    await expect(page.getByPlaceholder(/Paste a paragraph/)).toHaveValue("# Source\n\nTeh orignal text.");
    await page.locator("section").getByRole("button", { name: "Fix Spelling" }).click();
    await page.getByRole("button", { name: "Apply to document" }).click();
    await expect(page).toHaveURL(/\/documents\/d_src$/);
    await expect(page.getByText("There are many reasons to use TypeScript.")).toBeVisible();
  });

  test("shows API errors", async ({ page }) => {
    await mockApi(page, { tool: () => [{ type: "error", message: "All language model providers are unavailable right now." }] });
    await page.goto("/tools");
    await page.getByPlaceholder(/Paste a paragraph/).fill("Text");
    await page.locator("section").getByRole("button", { name: "AI Writing" }).click();
    await expect(page.getByText("All language model providers are unavailable right now.")).toBeVisible();
  });
});
