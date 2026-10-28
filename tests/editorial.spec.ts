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
    await expect(
      page.getByRole("button", {
        name: /Read sample edition|Generate my magazine/,
      }),
    ).toHaveCount(0);
    await expect(page.locator(".opening-art .image-ready")).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator(".opening-art img")
          .first()
          .evaluate((e) => getComputedStyle(e).opacity),
      )
      .toBe("1");
    await page.screenshot({
      path: `test-results/demo-landing-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Your discovery prompt").fill("paper quiet lamp");
    await page.getByRole("button", { name: "Generate magazine" }).click();
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
      .getByLabel("Your discovery prompt")
      .fill("Surprise me with woodland paths and walking outdoors");
    await page.getByRole("button", { name: "Generate magazine" }).click();
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
  await page.getByLabel("Your discovery prompt").fill("A magazine of unexpected connections");
  await page.getByRole("button", { name: "Generate magazine" }).click();
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

for (const profile of ["home", "travel"] as const)
  test(`original AI ${profile} edition renders a coherent story thread using mocked responses`, async ({
    page,
  }) => {
    const { readFileSync } = await import("node:fs");
    const plans = JSON.parse(
      readFileSync("tests/fixtures/editorial-original.json", "utf8"),
    );
    const replay = process.env.CURIO_REPLAY_DIR
      ? JSON.parse(
          readFileSync(
            `${process.env.CURIO_REPLAY_DIR}/${profile === "home" ? "focused-home" : "surprise-travel"}.json`,
            "utf8",
          ),
        )
      : null;
    if (profile === "home") plans.home = JSON.parse(readFileSync("tests/fixtures/editorial-live-home.json", "utf8")).plan;
    if (replay) plans[profile] = replay.plan;
    await page.route("**/api/editorial", async (route) => {
      const body = route.request().postDataJSON();
      if (!body.consent)
        return route.fulfill({
          status: 503,
          json: { error: "Local fallback" },
        });
      const { curationCatalog } = await import("../shared/catalog");
      if (replay) return route.fulfill({ json: replay });
      return route.fulfill({
        json: {
          plan: plans[profile],
          items: curationCatalog,
          source: "meta",
          retrieval: "fictional",
          cached: false,
        },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", {
        name:
          profile === "home"
            ? "Try a prompt: Quiet rooms"
            : "Try a prompt: Into the wild",
      })
      .click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Generate magazine" }).click();
    await expect(
      page.getByRole("heading", { name: plans[profile].title }),
    ).toBeVisible();
    await page
      .locator(".personal-feature")
      .first()
      .screenshot({ path: `test-results/mock-original-${profile}.png` });
    await expect(page.locator(".feature-narrative").first()).toHaveText(
      plans[profile].features[0].narrative,
    );
    await page
      .locator(".personal-feature")
      .first()
      .getByRole("button", { name: "Explore the story", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".original-interpretation")).toContainText(
      plans[profile].features[0].narrative,
    );
    await expect(dialog.locator(".curiosity-thread")).toContainText(
      plans[profile].connections[0].thread,
    );
    await dialog.getByRole("button", { name: /Follow the thread:/ }).click();
    await expect(dialog.locator("h2")).toBeFocused();
    await expect(dialog.locator("h2")).not.toHaveText(
      profile === "home" ? "Paper Moon Lamp" : "Moss Path",
    );
  });
