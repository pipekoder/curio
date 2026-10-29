import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`visual detail to context to connected story at ${width}px without inference`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const modelRequests: string[] = [];
    await page.route("**/api/**", route => {
      if (route.request().url().includes("decoder")) modelRequests.push(route.request().url());
      return route.fulfill({ status: 503, json: { error: "AI disabled" } });
    });
    await page.route("https://api.meta.ai/**", route => { modelRequests.push(route.request().url()); return route.abort(); });
    await page.goto("/?legacy=1");
    await page.getByRole("button", { name: "Try a prompt: Quiet rooms" }).click();
    await page.getByRole("button", { name: "Generate magazine" }).click();
    await expect(page.getByRole("heading", { name: "The art of quiet rooms" })).toBeVisible();
    await expect(page.locator(".cover-contact-sheet .image-ready")).toHaveCount(2);
    await page.locator(".issue-cover").screenshot({ path: `test-results/visual-cover-${width}.png` });
    const feature = page.locator(".personal-feature").first();
    const hotspot = feature.getByRole("button", { name: "Explore Paper shade" });
    await expect(hotspot).toBeVisible();
    await hotspot.focus();
    await page.keyboard.press("Enter");
    const context = feature.getByRole("complementary", { name: "Visual detail context" });
    await expect(context).toContainText("not AI image analysis");
    await expect(context).toContainText("paper like");
    await expect(feature).toContainText("mock segmentation");
    const thread = context.getByRole("button", { name: "Read the connected story: Pebble Chair →" });
    expect(await thread.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await feature.screenshot({ path: `test-results/visual-detail-${width}.png` });
    await thread.click();
    const dialog = page.getByRole("dialog", { name: "Pebble Chair story" });
    await expect(dialog.getByRole("heading", { name: "Pebble Chair", exact: true })).toBeFocused();
    await expect(dialog.locator(".visual-story-arrival")).toContainText("From Paper shade to curve and space");
    await expect(dialog.getByRole("link", { name: /Source: V&A/ })).toBeVisible();
    await page.screenshot({ path: `test-results/visual-story-${width}.png` });
    await dialog.getByRole("button", { name: "Collect story", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Story collected", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close exploration" }).click();
    await expect(thread).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(hotspot).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(modelRequests).toEqual([]);
    await page.reload();
    await page.getByRole("button", { name: /Your collection/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Pebble Chair");
  });
}
