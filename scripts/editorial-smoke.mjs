import assert from "node:assert/strict";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { importAssetManifest } from "./asset-intelligence-import.mjs";
const token = "FAKE_OPERATOR_TOKEN_32_CHARACTERS_ONLY",
  origin = "https://curio.test";
let calls = 0;
const attemptedDestinations = [];
let redirectNext = false;
const state = await mkdtemp(join(tmpdir(), "curio-editorial-"));
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "curio-editorial-test",
    resourcePersistencePath: state,
    modules: true,
    scriptPath: ".wrangler/dry-run/index.js",
    compatibilityDate: "2026-10-26",
    telemetry: { enabled: false },
    d1Databases: ["CATALOG_DB"],
    durableObjects: {
      INFERENCE_BUDGET: { className: "InferenceBudget", useSQLite: true },
    },
    bindings: {
      PUBLIC_APP_ORIGIN: origin,
      CATALOG_OPERATOR_ENABLED: "true",
      CATALOG_OPERATOR_TOKEN: token,
      MAGAZINE_AI_ENABLED: "true",
      META_API_KEY: "FAKE",
      META_SPARK_MODEL: "muse-spark-1.3",
      RATE_LIMIT_SALT: "FAKE_TEST_SALT_AT_LEAST_32_CHARACTERS",
      MAGAZINE_MAX_CALLS: "2",
    },
    outboundService: async (request) => {
      attemptedDestinations.push(request.url);
      assert.equal(request.url, "https://api.meta.ai/v1/chat/completions");
      const body = await request.json();
      assert.equal(body.model, "muse-spark-1.3");
      calls++;
      if (redirectNext)
        return new MFResponse(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/steal-key" },
        });
      return MFResponse.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                title: "The art of quiet rooms",
                deck: "Focused / Scandinavian. A local edition of authorized visual studies.",
                features: [
                  {
                    catalogId: "home-lamp",
                    assetId: "asset-home-lamp-v1",
                    headline: "A closer look: Paper Moon Lamp",
                    narrative:
                      "A fictional sculptural paper lamp for a quiet reading corner. Follow paper shade into another visual idea. This is an authored interpretation of a fictional study.",
                    layout: "hero",
                    motion: "reveal",
                    theme: "Scandinavian",
                  },
                ],
              }),
            },
          },
        ],
      });
    },
  }),
);
const preferences = {
  interests: "paper quiet rooms",
  aesthetics: ["Scandinavian"],
  allocations: { home: 100, fashion: 0, travel: 0 },
  mode: "Focused",
  consent: false,
};
const post = (p, ip = "192.0.2.1") =>
  mf.dispatchFetch(`${origin}/api/editorial`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(p),
  });
try {
  const db = await mf.getD1Database("CATALOG_DB");
  for (const name of ["0001_catalog.sql", "0002_asset_intelligence.sql"])
    await db.exec(
      (await readFile(`migrations/${name}`, "utf8"))
        .replace(/^--.*$/gm, "")
        .replace(/\s+/g, " "),
    );
  await importAssetManifest(
    JSON.parse(await readFile("seeds/asset-intelligence-v1.json", "utf8")),
    { token, send: (url, init) => mf.dispatchFetch(url, init) },
  );
  const r = await post(preferences);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  const data = await r.json();
  assert.equal(data.retrieval, "fictional");
  assert.equal(data.source, "deterministic");
  assert.ok(data.plan.features.every((f) => f.catalogId.startsWith("home-")));
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify(data).includes("normcph"));
  assert.ok(!JSON.stringify(data).includes("publisher_metadata"));
  const live = { ...preferences, consent: true };
  const a = await post(live);
  assert.equal(
    (await a.json()).source,
    "meta",
    `mocked provider calls=${calls}`,
  );
  assert.equal(calls, 1);
  assert.equal((await (await post(live)).json()).cached, true);
  assert.equal(calls, 1);
  assert.equal(
    (
      await (
        await post({ ...live, interests: "another uncached request" })
      ).json()
    ).source,
    "deterministic",
  );
  assert.equal(
    calls,
    1,
    "shared budget blocks a second uncached call during cooldown",
  );
  assert.equal(
    (
      await mf.dispatchFetch(
        `${origin}/api/operator/catalog/intelligence/stages`,
      )
    ).status,
    403,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM catalog_assets").first()).n,
    33,
  );
  redirectNext = true;
  assert.equal(
    (
      await (
        await post({ ...live, interests: "redirect fixture" }, "192.0.2.2")
      ).json()
    ).source,
    "deterministic",
  );
  assert.equal(
    calls,
    2,
    "redirects are rejected without forwarding API credentials",
  );
  assert.deepEqual(
    [...new Set(attemptedDestinations)],
    ["https://api.meta.ai/v1/chat/completions"],
    "no redirect destination may receive a request",
  );
  console.log(
    "PASS: editorial Worker + D1 retrieval excludes 33 pending assets; consent, mocked Meta plan/cache and shared DO cooldown; no editorial D1 writes, no real model calls",
  );
} finally {
  await mf.dispose();
  await rm(state, { recursive: true, force: true });
}
