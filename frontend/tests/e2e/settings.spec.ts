import { readFile } from "node:fs/promises";
import { expect, mockApi, test } from "./fixtures";
import { LONG_DOC, seedLibrary } from "./seed";

test.describe("settings and data", () => {
  test("profile name personalises the UI", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");
    await page.getByLabel("Display name").fill("Ada Lovelace");
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("AL");
    await page.goto("/chat");
    await expect(page.getByText("Hi Ada, what are we writing today?")).toBeVisible();
  });

  test("generation defaults feed the studio", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/settings");
    await page.getByLabel("Default audience").fill("Data engineers");
    await page.getByRole("button", { name: "long", exact: true }).click();
    await page.getByLabel(/Include illustrations by default/).uncheck();
    await page.getByRole("link", { name: "Blog Studio" }).first().click();
    await page.getByLabel("Topic").fill("Defaults check");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect.poll(() => calls.generate.length).toBe(1);
    expect(calls.generate[0]).toMatchObject({ audience: "Data engineers", length: "long", include_images: false });
  });

  test("shows provider health", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings");
    await expect(page.getByRole("cell", { name: "gpt-4.1-mini" })).toBeVisible();
    await expect(page.getByText("Cooling down 12s")).toBeVisible();
    await expect(page.getByText(/Web research enabled/)).toBeVisible();
  });

  test("backs up, clears and restores the workspace", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_keep", title: "Keep me safe", content: LONG_DOC }]);
    await mockApi(page);
    await page.goto("/settings");
    await expect(page.getByText("1 document · 0 conversations")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Back up" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const backup = JSON.parse(await readFile(path!, "utf8"));
    expect(backup.docs[0].title).toBe("Keep me safe");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Clear workspace" }).click();
    await expect(page.getByText("0 documents · 0 conversations")).toBeVisible();

    await page.locator('input[type="file"][accept*="json"]').setInputFiles(path!);
    await expect(page.getByText("Restored 1 document")).toBeVisible();
    await expect(page.getByText("1 document · 0 conversations")).toBeVisible();

    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"nope": true}'),
    });
    await expect(page.getByText("That file isn't a valid Draftsmith backup")).toBeVisible();
  });

  test("sidebar export downloads the whole library", async ({ page }) => {
    await seedLibrary(page, [
      { id: "d1", title: "One", content: "# One\n\nFirst" },
      { id: "d2", title: "Two", content: "# Two\n\nSecond" },
    ]);
    await mockApi(page);
    await page.goto("/");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^draftsmith-library-\d{4}-\d{2}-\d{2}\.md$/);
    const text = await readFile((await download.path())!, "utf8");
    expect(text).toContain("# One");
    expect(text).toContain("# Two");
  });
});
