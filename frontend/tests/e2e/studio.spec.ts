import { expect, mockApi, POST_MARKDOWN, test } from "./fixtures";

test.describe("blog studio", () => {
  test("generates a post, saves it and updates the dashboard", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/studio");

    await page.getByLabel("Topic").fill("Why small teams should adopt trunk-based development");
    await page.getByRole("button", { name: /Generate post/ }).click();

    const preview = page.locator("#preview");
    await expect(preview.getByRole("heading", { name: "Shipping Faster With Trunk-Based Development", level: 1 })).toBeVisible();
    await expect(preview.getByRole("heading", { name: "How To Start" })).toBeVisible();
    await expect(page.getByText("Agent progress")).toBeVisible();
    await expect(page.getByText("Hybrid · fresh examples")).toBeVisible();
    await expect(page.getByRole("link", { name: /TBD guide/ })).toHaveAttribute("href", "https://example.com/tbd");
    await expect(page.getByText(/Done in/)).toContainText("8.4s");
    await expect(page.getByText("Your post is ready")).toBeVisible();

    expect(calls.generate).toHaveLength(1);
    expect(calls.generate[0]).toMatchObject({
      topic: "Why small teams should adopt trunk-based development",
      template: "Blog Post",
      length: "medium",
      include_images: true,
      force_research: false,
    });

    await page.getByRole("button", { name: /Open editor/ }).click();
    await expect(page).toHaveURL(/\/documents\/d_/);
    await expect(page.getByLabel("Document title")).toHaveValue("Shipping Faster With Trunk-Based Development");
    await expect(page.getByText("Model provider")).toBeVisible();

    await page.getByRole("link", { name: "Overview" }).first().click();
    await expect(page.getByText("Not used yet · Start writing")).toHaveCount(1);
    await expect(page.getByText(/Last update:/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Shipping Faster/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Blog post ready")).toBeVisible();
  });

  test("sends advanced options and template presets", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/studio?template=tutorial");
    await page.getByLabel("Topic").fill("Build a CLI in Go");
    await page.getByRole("button", { name: "Short" }).click();
    await page.getByRole("switch", { name: /Illustrations/ }).click();
    await page.getByRole("switch", { name: /Deep web research/ }).click();
    await page.getByRole("button", { name: /tone & audience/ }).click();
    await page.getByLabel("Audience").fill("Go beginners");
    await page.getByLabel("Extra instructions").fill("Use cobra");
    await page.getByLabel("Topic").press("Control+Enter");

    await expect(page.locator("#preview h1")).toBeVisible();
    expect(calls.generate[0]).toMatchObject({
      topic: "Build a CLI in Go",
      template: "Technical Tutorial",
      length: "short",
      include_images: false,
      force_research: true,
      audience: "Go beginners",
      tone: "Hands-on, precise and encouraging",
    });
    expect(String((calls.generate[0] as { notes: string }).notes)).toContain("Use cobra");
  });

  test("requires a topic", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.getByText("Add a topic first")).toBeVisible();
    expect(calls.generate).toHaveLength(0);
  });

  test("shows server errors and retries", async ({ page }) => {
    let attempt = 0;
    const calls = await mockApi(page, {
      generate: () => {
        attempt += 1;
        return attempt === 1
          ? [{ type: "stage", stage: "router" }, { type: "error", message: "All language model providers are unavailable right now." }]
          : [
              { type: "plan", plan: { blog_title: "Recovered", audience: "a", tone: "t", blog_kind: "explainer", tasks: [] } },
              { type: "done", title: "Recovered", markdown: "# Recovered\n\n## Body\n\nText", providers: ["groq"], sources: [], elapsed_ms: 1000 },
            ];
      },
    });
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("Retry me please");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.getByText("All language model providers are unavailable right now.")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("#preview").getByRole("heading", { name: "Recovered", level: 1 })).toBeVisible();
    expect(calls.generate).toHaveLength(2);
  });

  test("shows validation and rate-limit responses", async ({ page }) => {
    await mockApi(page, { generate: () => ({ status: 429, body: { detail: "Too many requests. Try again in 42 seconds." } }) });
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("Rate limited topic");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.getByText("Too many requests. Try again in 42 seconds.")).toBeVisible();
  });

  test("handles a stream that ends early", async ({ page }) => {
    await mockApi(page, { generate: () => [{ type: "stage", stage: "router" }] });
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("Cut off");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await expect(page.getByText(/connection closed before the post was finished/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate post/ })).toBeEnabled();
  });

  test("copy and download actions work", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockApi(page);
    await page.goto("/studio");
    await page.getByLabel("Topic").fill("Copy me");
    await page.getByRole("button", { name: /Generate post/ }).click();
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByText("Markdown copied")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.replace(/\r\n/g, "\n")).toBe(POST_MARKDOWN);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: ".md" }).click();
    expect((await download).suggestedFilename()).toBe("shipping-faster-with-trunk-based-development.md");
  });
});
