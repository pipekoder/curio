import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { curationCatalog } from "../shared/catalog";
import {
  defaultPreferences,
  validateOriginalPlan,
  editorialCopy,
} from "../shared/editorial";
import { visualNarrative } from "../shared/editorial-language";
import {
  generateEditorialResult,
  EditorialGenerationError,
  editorialApi,
} from "../worker/editorial";
import type { Bindings } from "../worker/index";
const plans = JSON.parse(
  readFileSync("tests/fixtures/editorial-original.json", "utf8"),
);
const home = {
  ...defaultPreferences,
  interests: "paper quiet lamp",
  allocations: { home: 100, fashion: 0, travel: 0 },
  mode: "Focused" as const,
};
const travel = {
  ...defaultPreferences,
  interests: "woodland path walking",
  aesthetics: ["Nature & Outdoor" as const],
  allocations: { home: 0, fashion: 0, travel: 100 },
  mode: "Surprise Me" as const,
};
const usage = {
  prompt_tokens: 800,
  completion_tokens: 420,
  total_tokens: 1220,
  prompt_tokens_details: { cached_tokens: 0 },
};
const envelope = (plan: unknown) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(plan) } },
    ],
    usage,
  });
afterEach(() => vi.unstubAllGlobals());
it("accepts two original, different and fully connected editions instead of template paragraph selection", () => {
  const a = validateOriginalPlan(plans.home, curationCatalog, home),
    b = validateOriginalPlan(plans.travel, curationCatalog, travel);
  expect(a.title).not.toBe(b.title);
  expect(a.features[0].layout).not.toBe(b.features[0].layout);
  for (const f of a.features) {
    const ad = curationCatalog.find((a) => a.id === f.catalogId)!;
    expect(editorialCopy(ad).narratives).not.toContain(f.narrative);
  }
  expect(a.connections?.[0].toAssetId).toBe(a.features[1].assetId);
});
it("rejects unsupported material, brand, historical, geography, URL and executable claims without another model", () => {
  for (const narrative of [
    "Imagine this lamp is made from titanium by Acme in Tokyo.",
    "Perhaps this object was manufactured in 1920.",
    "This design has a quiet shape.",
    "Imagine <script>alert(1)</script> as a quiet possibility.",
    "Imagine a quiet conversation at https://evil.example and follow it.",
  ]) {
    expect(visualNarrative(narrative)).toBe(false);
    expect(() =>
      validateOriginalPlan(
        {
          ...plans.home,
          features: [
            { ...plans.home.features[0], narrative },
            plans.home.features[1],
          ],
        },
        curationCatalog,
        home,
      ),
    ).toThrow();
  }
});
it("rejects orphaned threads, repeated prose, unsupported image pairs and monotonous layouts", () => {
  expect(() =>
    validateOriginalPlan(
      { ...plans.home, title: "quiet ".repeat(30).trim() },
      curationCatalog,
      home,
    ),
  ).toThrow();
  expect(() =>
    validateOriginalPlan(
      { ...plans.home, connections: [] },
      curationCatalog,
      home,
    ),
  ).toThrow();
  expect(() =>
    validateOriginalPlan(
      {
        ...plans.home,
        connections: [
          { ...plans.home.connections[0], toAssetId: "unapproved" },
        ],
      },
      curationCatalog,
      home,
    ),
  ).toThrow();
  expect(() =>
    validateOriginalPlan(
      {
        ...plans.home,
        features: [
          plans.home.features[0],
          {
            ...plans.home.features[1],
            narrative: plans.home.features[0].narrative,
          },
        ],
      },
      curationCatalog,
      home,
    ),
  ).toThrow();
  expect(() =>
    validateOriginalPlan(
      {
        ...plans.home,
        features: plans.home.features.map((f: Record<string, unknown>) => ({
          ...f,
          layout: "hero",
        })),
      },
      curationCatalog,
      home,
    ),
  ).toThrow();
  expect(() =>
    validateOriginalPlan(plans.home, curationCatalog, {
      ...home,
      allocations: { home: 0, fashion: 0, travel: 100 },
    }),
  ).toThrow();
});
it("measures provider token usage and latency, and retains valid accounting when prose is rejected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => envelope(plans.home)),
  );
  const result = await generateEditorialResult(home, curationCatalog, "FAKE");
  expect(result.measurement.usage).toEqual({
    inputTokens: 800,
    outputTokens: 420,
    cachedInputTokens: 0,
    totalTokens: 1220,
  });
  expect(result.measurement.latencyMs).toBeGreaterThanOrEqual(0);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      envelope({ ...plans.home, title: "Acme manufactured this object" }),
    ),
  );
  try {
    await generateEditorialResult(home, curationCatalog, "FAKE");
    throw Error("Expected rejection");
  } catch (e) {
    expect(e).toBeInstanceOf(EditorialGenerationError);
    expect(
      (e as EditorialGenerationError).measurement.usage?.outputTokens,
    ).toBe(420);
  }
});
it("keeps valid token accounting when the provider stops at the output limit", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [
          { finish_reason: "length", message: { content: "truncated" } },
        ],
        usage,
      }),
    ),
  );
  await expect(
    generateEditorialResult(home, curationCatalog, "FAKE"),
  ).rejects.toMatchObject({
    measurement: { usage: { inputTokens: 800, outputTokens: 420 } },
  });
});
it("reports an invalid response as a charged reservation with measured usage, never as a zero-cost fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      envelope({ ...plans.home, title: "Acme manufactured this object" }),
    ),
  );
  const env = {
    PUBLIC_APP_ORIGIN: "https://curio.test",
    MAGAZINE_AI_ENABLED: "true",
    META_SPARK_MODEL: "muse-spark-1.3",
    META_API_KEY: "FAKE",
    RATE_LIMIT_SALT: "FAKE_SALT_AT_LEAST_32_CHARACTERS_LONG",
    INFERENCE_BUDGET: {
      idFromName: () => "FAKE",
      get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
    },
  } as unknown as Bindings;
  const response = await editorialApi.request(
    "https://curio.test/",
    {
      method: "POST",
      headers: {
        Origin: "https://curio.test",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.50",
      },
      body: JSON.stringify({ ...home, consent: true }),
    },
    env,
  );
  const data = (await response.json()) as {
    source: string;
    fallbackReason: string;
    inference: {
      attempted: boolean;
      reservedUnits: number;
      usage: { outputTokens: number };
    };
  };
  expect(data.source).toBe("deterministic");
  expect(data.fallbackReason).toBe("invalid_output");
  expect(data).toHaveProperty("validationDiagnostic", { code: "visual_vocabulary_or_characters", field: "title" });
  expect(data.inference.reservedUnits).toBe(1);
  expect(data.inference.attempted).toBe(true);
  expect(data.inference.usage.outputTokens).toBe(420);
});
it("enforces Balanced category coverage and a heavily weighted category leading the sequence", () => {
  const fashion = {
    catalogId: "fashion-coat",
    assetId: "asset-fashion-coat-v1",
    headline: "A shape in motion",
    narrative:
      "Imagine a soft silhouette as a way to follow the rhythm between stillness and movement.",
    layout: "essay",
    motion: "still",
    theme: "French Style",
  };
  const features = [plans.home.features[0], fashion, plans.travel.features[0]];
  const chain = (rows: typeof features) =>
    rows.slice(0, -1).map((f: Record<string, string>, i: number) => ({
      fromAssetId: f.assetId,
      toAssetId: rows[i + 1].assetId,
      thread:
        "Consider a visual conversation between one quiet rhythm and another way of looking.",
    }));
  expect(
    validateOriginalPlan(
      { ...plans.home, features, connections: chain(features) },
      curationCatalog,
      defaultPreferences,
    ).features,
  ).toHaveLength(3);
  const missing = [
    plans.home.features[0],
    plans.home.features[1],
    plans.travel.features[0],
  ];
  expect(() =>
    validateOriginalPlan(
      { ...plans.home, features: missing, connections: chain(missing) },
      curationCatalog,
      defaultPreferences,
    ),
  ).toThrow(/Balanced/);
  const wrongLead = [features[2], features[1], features[0]];
  expect(() =>
    validateOriginalPlan(
      { ...plans.home, features: wrongLead, connections: chain(wrongLead) },
      curationCatalog,
      {
        ...defaultPreferences,
        allocations: { home: 60, fashion: 20, travel: 20 },
      },
    ),
  ).toThrow(/Dominant/);
});

it("fails closed when the allowed Origin is unconfigured, even if a request omits its Origin header", async () => {
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  const response = await editorialApi.request(
    "https://curio.test/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.1",
      },
      body: JSON.stringify({ ...home, consent: true }),
    },
    {
      MAGAZINE_AI_ENABLED: "true",
      META_SPARK_MODEL: "muse-spark-1.3",
      META_API_KEY: "FAKE",
    },
  );
  expect(response.status).toBe(403);
  expect(send).not.toHaveBeenCalled();
});
