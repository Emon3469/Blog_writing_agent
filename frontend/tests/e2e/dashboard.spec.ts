import { expect, mockApi, test } from "./fixtures";
import { LONG_DOC, seedLibrary } from "./seed";

test.describe("dashboard analytics", () => {
  test("computes stats, fetches suggestions and marks them done", async ({ page }) => {
    await seedLibrary(page, [
      { id: "d1", title: "Observability for Small Teams", content: LONG_DOC, template: "blog-post" },
      { id: "d2", title: "Old essay", content: "# Old essay\n\nShort text here.", template: "essay", daysAgo: 3, status: "published" },
    ]);
    const calls = await mockApi(page);
    await page.goto("/");

    const wordStat = page.getByText("Avg. Word Count").locator("xpath=../..");
    await expect(wordStat).not.toContainText(/^\s*0\s*$/);
    await expect(page.getByText("Not used yet · Start writing")).toHaveCount(0);
    await expect(page.getByText("For Observability for Small Teams")).toBeVisible();

    await expect(page.getByText("Strengthen the opening hook")).toBeVisible();
    expect(calls.suggestions).toBe(1);
    await page.getByRole("button", { name: "Mark as Done" }).first().click();
    await expect(page.getByText("Strengthen the opening hook")).toBeHidden();
    await expect(page.getByText("Add a code example")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Add a code example")).toBeVisible();
    await expect(page.getByText("Strengthen the opening hook")).toBeHidden();
    expect(calls.suggestions).toBe(1);

    await expect(page.getByRole("link", { name: /Observability for Small Teams/ }).first()).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });

  test("falls back to local suggestions when the API is down", async ({ page }) => {
    await seedLibrary(page, [{ id: "d1", title: "Observability", content: LONG_DOC }]);
    await mockApi(page, { suggestions: () => ({ status: 503, body: { detail: "down" } }) });
    await page.goto("/");
    await expect(page.getByText("Close with clear takeaways")).toBeVisible();
  });

  test("trend chart filters and exports", async ({ page }) => {
    await seedLibrary(page, [{ id: "d1", title: "Observability", content: LONG_DOC }]);
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByText("No activity in this range yet")).toBeHidden();
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(page.getByText(/Track documents with real-time analytics/)).toBeVisible();
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: "30d" }).click();
    await expect(page.getByText(/last 30 days/)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "More options" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toBe("writing-trend-documents-30d.csv");
  });

  test("empty workspace shows onboarding", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByText("Generate your first blog post")).toBeVisible();
    await expect(page.getByText("No activity in this range yet")).toBeVisible();
    await page.getByRole("link", { name: "Create a new document" }).click();
    await expect(page).toHaveURL(/\/studio$/);
  });
});
