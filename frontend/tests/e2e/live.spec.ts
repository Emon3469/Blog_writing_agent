import { expect, test } from "@playwright/test";

test.describe("live backend", () => {
  test.skip(process.env.LIVE !== "1", "set LIVE=1 with the API running to test real model calls");
  test.setTimeout(240_000);

  test("server reports at least one ready provider", async ({ request }) => {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const health = await (await request.get(`${api}/health`)).json();
    expect(health.status).toBe("ok");
    expect(health.providers.length).toBeGreaterThan(0);
  });

  test("generates a real post end to end", async ({ page }) => {
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("A beginner's guide to HTTP caching headers");
    await page.getByRole("button", { name: "Short" }).click();
    await page.getByRole("switch", { name: /Illustrations/ }).click();
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.getByRole("button", { name: /Open editor/ })).toBeVisible({ timeout: 200_000 });
    const h2 = page.locator("#preview h2");
    expect(await h2.count()).toBeGreaterThanOrEqual(3);
    await page.getByRole("button", { name: /Open editor/ }).click();
    await expect(page.getByText("Model provider")).toBeVisible();
  });

  test("chat streams a real reply", async ({ page }) => {
    await page.goto("/chat");
    const input = page.getByPlaceholder("Ask anything about your writing…");
    await input.fill("Suggest one headline about API rate limiting. Reply with the headline only.");
    await input.press("Enter");
    await expect(page.getByText(/^via /)).toBeVisible({ timeout: 60_000 });
  });

  test("rewrite tool returns real output", async ({ page }) => {
    await page.goto("/tools?mode=fix-spelling");
    await page.getByRole("button", { name: "Try a sample" }).click();
    await page.locator("section").getByRole("button", { name: "Fix Spelling" }).click();
    await expect(page.getByText(/There are many reasons/)).toBeVisible({ timeout: 60_000 });
  });
});
