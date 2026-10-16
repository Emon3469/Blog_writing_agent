import { expect, mockApi, test } from "./fixtures";
import { LONG_DOC, seedLibrary } from "./seed";

test.describe("documents", () => {
  test("imports a markdown file and opens it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "release-notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Release Notes 2.0\r\n\r\nWe shipped **offline mode**."),
    });
    await expect(page).toHaveURL(/\/documents\/d_/);
    await expect(page.getByLabel("Document title")).toHaveValue("Release Notes 2.0");
    await expect(page.locator("strong", { hasText: "offline mode" })).toBeVisible();
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Release Notes 2.0" })).toBeVisible();
  });

  test("rejects unsupported and empty files", async ({ page }) => {
    await mockApi(page);
    await page.goto("/documents");
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await expect(page.getByText("Unsupported file type")).toBeVisible();
    await input.setInputFiles({ name: "empty.md", mimeType: "text/markdown", buffer: Buffer.from("   ") });
    await expect(page.getByText("That file is empty")).toBeVisible();
    await expect(page).toHaveURL(/\/documents$/);
  });

  test("edits autosave and survive a reload", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_edit", title: "Draft", content: "# Draft\n\nOld body." }]);
    await mockApi(page);
    await page.goto("/documents/d_edit");
    await page.getByLabel("Document title").fill("Polished Title");
    await page.getByRole("button", { name: "Write" }).click();
    await page.getByPlaceholder("Start writing in Markdown…").fill("# Polished Title\n\nNew body with more words in it.");
    await expect(page.getByText("All changes saved")).toBeVisible();
    await page.getByRole("button", { name: "published" }).click();
    await expect(page.getByText("Marked as published")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Document title")).toHaveValue("Polished Title");
    await expect(page.getByText("New body with more words in it.")).toBeVisible();

    await page.goto("/documents");
    await page.getByRole("button", { name: "draft", exact: true }).click();
    await expect(page.getByText("No documents match your search")).toBeVisible();
    await page.getByRole("button", { name: "published", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Polished Title" })).toBeVisible();
  });

  test("navigating away flushes unsaved edits", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_fast", title: "Fast", content: "# Fast" }]);
    await mockApi(page);
    await page.goto("/documents/d_fast");
    await page.getByLabel("Document title").fill("Typed then left");
    await page.getByRole("link", { name: "Documents" }).first().click();
    await expect(page.getByRole("heading", { name: "Typed then left" })).toBeVisible();
  });

  test("searches, deletes and undoes", async ({ page }) => {
    await seedLibrary(page, [
      { id: "d_a", title: "Kubernetes Basics", content: "# Kubernetes Basics\n\npods and services" },
      { id: "d_b", title: "Observability for Small Teams", content: LONG_DOC },
    ]);
    await mockApi(page);
    await page.goto("/documents");
    await page.getByPlaceholder("Search by title or content").fill("pods");
    await expect(page.getByRole("heading", { name: "Kubernetes Basics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observability for Small Teams" })).toBeHidden();
    await page.getByPlaceholder("Search by title or content").fill("");

    await page.getByRole("button", { name: "Delete document" }).first().click();
    await expect(page.getByText("Document deleted")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  });

  test("creates blank documents and deletes from the editor", async ({ page }) => {
    await mockApi(page);
    await page.goto("/documents");
    await page.getByRole("button", { name: "Blank" }).click();
    await expect(page).toHaveURL(/\/documents\/d_/);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete document" }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByText("No documents yet")).toBeVisible();
  });

  test("unknown document id shows a friendly message", async ({ page }) => {
    await mockApi(page);
    await page.goto("/documents/d_missing");
    await expect(page.getByText("Document not found")).toBeVisible();
  });

  test("split view renders editor and preview side by side", async ({ page }) => {
    await seedLibrary(page, [{ id: "d_split", title: "Split", content: "# Split\n\n| a | b |\n|---|---|\n| 1 | 2 |" }]);
    await mockApi(page);
    await page.goto("/documents/d_split");
    await page.getByRole("button", { name: "Split" }).click();
    await expect(page.getByPlaceholder("Start writing in Markdown…")).toBeVisible();
    await expect(page.locator("article table")).toBeVisible();
  });
});
