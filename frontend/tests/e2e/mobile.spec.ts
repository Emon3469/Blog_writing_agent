import { expect, mockApi, test } from "./fixtures";
import { LONG_DOC, seedLibrary } from "./seed";

test.describe("mobile layout", () => {
  test("navigation drawer opens, navigates and closes", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.locator('aside[aria-hidden="false"]');
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Chats" }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('aside[aria-hidden="true"]')).toBeAttached();
  });

  test("no page scrolls horizontally", async ({ page }) => {
    await seedLibrary(page, [{ id: "d1", title: "A very long title that should wrap nicely on small screens", content: LONG_DOC }]);
    await mockApi(page);
    for (const path of ["/", "/studio", "/chat", "/tools", "/documents", "/documents/d1", "/templates", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("generation works on a phone", async ({ page }) => {
    await mockApi(page);
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("Mobile generation");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.locator("#preview").getByRole("heading", { level: 1 })).toBeVisible();
  });
});
