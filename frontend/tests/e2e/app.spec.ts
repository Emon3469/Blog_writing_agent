import { expect, mockApi, test } from "./fixtures";

test.describe("app shell", () => {
  test("overview renders every dashboard block", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/Draftsmith/);
    for (const heading of ["Overview", "Writing Assistant", "Writing Trend Analytics", "Recent Documents", "Suggestions", "Tools"]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    for (const stat of ["Avg. Readability", "Avg. Reading Time", "Avg. Word Count"]) {
      await expect(page.getByText(stat)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();
    await expect(page.getByTitle("Writing server status")).toContainText("Online");
  });

  test("serves favicon and icons", async ({ request }) => {
    for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test("theme toggle switches and persists", async ({ page }) => {
    await mockApi(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(html).toHaveClass(/dark/);
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(9, 9, 11)");
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("command palette searches and navigates", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await page.keyboard.type("templ");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/templates$/);
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /Search documents, chats and pages/ }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("every route loads without errors", async ({ page }) => {
    await mockApi(page);
    for (const [path, heading] of [
      ["/studio", "Blog Studio"],
      ["/documents", "Documents"],
      ["/templates", "Templates"],
      ["/tools", "Rewrite Tools"],
      ["/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Ask anything about your writing…")).toBeVisible();
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    await mockApi(page);
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("This page doesn't exist")).toBeVisible();
    await page.getByRole("link", { name: "Back to Overview" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("templates link into the studio with presets", async ({ page }) => {
    await mockApi(page);
    await page.goto("/templates");
    await page.getByRole("link", { name: /News Roundup/ }).click();
    await expect(page).toHaveURL(/template=news-roundup/);
    await expect(page.getByRole("switch", { name: /Deep web research/ })).toHaveAttribute("aria-checked", "true");
  });
});
