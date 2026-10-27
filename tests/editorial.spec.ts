import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/api/magazine/config", (r) =>
    r.fulfill({ json: { enabled: false, catalogSize: 6 } }),
  );
  await page.route("**/api/editorial", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "AI disabled; exercise local fallback" },
    }),
  );
});
for (const width of [1280, 390])
  test(`personal editions and complete discovery journey at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByLabel("Your editorial interests").fill("paper quiet lamp");
    await page.getByRole("button", { name: "Focused A closer study" }).click();
    for (const [category, value] of [
      ["home", "100"],
      ["fashion", "0"],
      ["travel", "0"],
    ])
      await page
        .getByRole("spinbutton", { name: `Editorial ${category} weight` })
        .fill(value);
    await page.getByRole("button", { name: "Compose my edition" }).click();
    await expect(
      page.getByRole("heading", { name: "The art of quiet rooms" }),
    ).toBeVisible();
    const first = page.locator(".personal-feature").first();
    await expect(first).toContainText("Paper Moon Lamp");
    await first.screenshot({
      path: `test-results/editorial-home-${width}.png`,
    });
    await first
      .getByRole("button", { name: "Collect image", exact: true })
      .click();
    await first
      .getByRole("button", { name: "Explore the story", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Publisher record" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /Source: V&A/ }),
    ).toHaveAttribute(
      "href",
      "https://www.vam.ac.uk/articles/arts-and-crafts-an-introduction",
    );
    await dialog
      .getByRole("button", { name: "Paper shade", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Following: Paper shade",
    );
    await dialog.locator(".related-rail button").first().click();
    await expect(dialog.locator("h2")).not.toHaveText("Paper Moon Lamp");
    await expect(dialog.locator("h2")).toBeFocused();
    expect(await dialog.evaluate((e) => e.scrollTop)).toBe(0);
    await dialog.getByRole("button", { name: "Close exploration" }).click();
    await first
      .getByRole("button", { name: "Explore the story", exact: true })
      .click();
    await dialog.getByLabel("Collection name").fill("Quiet ideas");
    await dialog
      .getByRole("button", { name: "Collect story", exact: true })
      .click();
    await dialog.screenshot({
      path: `test-results/editorial-story-${width}.png`,
    });
    await dialog.getByRole("button", { name: "Close exploration" }).click();
    await page.getByRole("button", { name: /Your collection/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Quiet ideas" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Editorial story", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Continue exploring" })
      .last()
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Paper Moon Lamp", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Your collection (2)" }).click();
    await expect(
      dialog.getByText("Image study", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Your editorial interests")
      .fill("woodland path walking");
    await page
      .getByRole("button", { name: "Surprise Me A little unexpected" })
      .click();
    for (const [category, value] of [
      ["home", "0"],
      ["fashion", "0"],
      ["travel", "100"],
    ])
      await page
        .getByRole("spinbutton", { name: `Editorial ${category} weight` })
        .fill(value);
    await page.getByRole("button", { name: "Compose my edition" }).click();
    await expect(
      page.getByRole("heading", { name: "Into the open" }),
    ).toBeVisible();
    expect(
      await page
        .locator(".personal-feature")
        .first()
        .getAttribute("data-layout"),
    ).toBe("layered");
    await page
      .locator(".personal-feature")
      .first()
      .screenshot({ path: `test-results/editorial-travel-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("reduced motion, keyboard collection controls and unavailable local storage remain usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("blocked");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Compose my edition" }).click();
  await expect(page.locator(".personal-feature")).toHaveCount(6);
  expect(
    await page
      .locator(".personal-feature .feature-copy")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page
    .locator(".personal-feature")
    .first()
    .getByRole("button", { name: "Collect image", exact: true })
    .click();
  await page.getByRole("button", { name: "Your collection (1)" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "only for this session",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
