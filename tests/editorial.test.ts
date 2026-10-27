import { expect, it, vi, afterEach } from "vitest";
import {
  defaultPreferences,
  fallbackPlan,
  validatePlan,
  editorialPreferences,
  readCollection,
  rankDemo,
} from "../shared/editorial";
import { curationCatalog } from "../shared/catalog";
import {
  generateEditorialPlan,
  editorialApi,
  editorialPool,
} from "../worker/editorial";
const home = {
  ...defaultPreferences,
  interests: "paper lamp quiet rooms",
  mode: "Focused" as const,
  allocations: { home: 100, fashion: 0, travel: 0 },
};
const travel = {
  ...defaultPreferences,
  interests: "woodland path walking",
  aesthetics: ["Nature & Outdoor" as const],
  mode: "Surprise Me" as const,
  allocations: { home: 0, fashion: 0, travel: 100 },
};
afterEach(() => vi.unstubAllGlobals());
it("creates distinct coherent editions without inference and honors zero weights", () => {
  const a = fallbackPlan(home),
    b = fallbackPlan(travel);
  expect(a).toEqual(fallbackPlan(home));
  expect(a.title).not.toBe(b.title);
  expect(a.features.every((f) => f.catalogId.startsWith("home-"))).toBe(true);
  expect(b.features.every((f) => f.catalogId.startsWith("travel-"))).toBe(true);
  expect(a.features[0].catalogId).toBe("home-lamp");
  expect(b.features[0].layout).toBe("layered");
  expect(
    rankDemo({ ...defaultPreferences, mode: "Balanced" })
      .slice(0, 3)
      .map((a) => a.category)
      .sort(),
  ).toEqual(["fashion", "home", "travel"]);
});
it("rejects unapproved IDs, incorrect versions, executable plans, unknown properties and invented URLs", () => {
  const plan = fallbackPlan(home);
  for (const patch of [
    { assetId: "invented" },
    { catalogId: "unknown" },
    { motion: "eval(code)" },
    { headline: "<script>alert(1)</script>" },
    { imageUrl: "https://evil.example/x.jpg" },
    { narrative: "This object is made from rare titanium by an invented designer." },
  ])
    expect(() =>
      validatePlan(
        { ...plan, features: [{ ...plan.features[0], ...patch }] },
        curationCatalog,
      ),
    ).toThrow();
  expect(() =>
    validatePlan(
      { ...plan, features: [plan.features[0], plan.features[0]] },
      curationCatalog,
    ),
  ).toThrow();
  expect(
    editorialPreferences.safeParse({
      ...home,
      allocations: { home: 101, fashion: 0, travel: 0 },
    }).success,
  ).toBe(false);
});
it("persists only approved IDs, kind and collection names and rejects corrupted or injected storage", () => {
  const record = {
    assetId: curationCatalog[0].image.id,
    kind: "story",
    shelf: "Design notes",
  };
  expect(readCollection(JSON.stringify([record]))).toEqual([record]);
  expect(
    readCollection(
      JSON.stringify([{ ...record, url: "https://evil.example" }]),
    ),
  ).toEqual([]);
  expect(
    readCollection(JSON.stringify([{ ...record, assetId: "unknown" }])),
  ).toEqual([]);
  expect(readCollection("broken")).toEqual([]);
});
it("never calls Meta when disabled or when consent is missing", async () => {
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  for (const env of [
    { PUBLIC_APP_ORIGIN: "https://curio.test", MAGAZINE_AI_ENABLED: "false" },
    { PUBLIC_APP_ORIGIN: "https://curio.test", MAGAZINE_AI_ENABLED: "true" },
  ]) {
    const r = await editorialApi.request(
      "https://curio.test/",
      {
        method: "POST",
        headers: {
          Origin: "https://curio.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(home),
      },
      env,
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as { source: string }).source).toBe(
      "deterministic",
    );
  }
  expect(send).not.toHaveBeenCalled();
});
it("denies cross-origin and oversized requests without exposing catalog/operator data", async () => {
  const env = { PUBLIC_APP_ORIGIN: "https://curio.test" };
  expect(
    (
      await editorialApi.request(
        "https://curio.test/",
        {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(home),
        },
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await editorialApi.request(
        "https://curio.test/",
        { method: "POST", body: "x".repeat(5000) },
        env,
      )
    ).status,
  ).toBe(400);
  expect((await editorialPool({}, home)).retrieval).toBe("fictional");
});
it("validates mocked Muse output with the fixed Meta model and no image pixels", async () => {
  const plan = fallbackPlan(home),
    send = vi.fn(async () =>
      Response.json({
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify(plan) } },
        ],
      }),
    );
  vi.stubGlobal("fetch", send);
  expect(await generateEditorialPlan(home, curationCatalog, "FAKE")).toEqual(
    plan,
  );
  const call = send.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toBe("https://api.meta.ai/v1/chat/completions");
  expect(JSON.parse(String(call[1].body)).model).toBe("muse-spark-1.3");
  expect(String(call[1].body)).not.toContain("image_url");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                ...plan,
                features: [{ ...plan.features[0], assetId: "unapproved" }],
              }),
            },
          },
        ],
      }),
    ),
  );
  await expect(
    generateEditorialPlan(home, curationCatalog, "FAKE"),
  ).rejects.toThrow();
});
