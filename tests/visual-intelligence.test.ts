import { afterEach, expect, it, vi } from "vitest";
import { curationCatalog } from "../shared/catalog";
import { authoredVisualContext, relatedVisualStory, visualObservations } from "../shared/visual-observations";
import { understanding } from "../worker/asset-contracts";
import { retrievedVisualContext } from "../worker/editorial-visual-context";
import { mockUnderstanding } from "../worker/asset-classifier";
import { externalFixture, testExternalApprovals } from "./hybrid-fixtures";
import { generateEditorialResult } from "../worker/editorial";
import { defaultPreferences } from "../shared/editorial";
import { readFileSync } from "node:fs";
const id = `version-${"a".repeat(64)}`, sha = "b".repeat(64);
const observations = { subjects: ["lighting"], materialAppearance: ["paper-like"], environments: ["interior-like"], relationships: ["light-and-shadow"] };
const output = { ...mockUnderstanding(id), imageSha256: sha, observations };
const approvedFixture = { ...externalFixture, permissions: { ...externalFixture.permissions, aiAnalysis: { status: "approved" as const, evidence: "docs/TEST_ONLY.md" } } };
const hit = { analysis_evidence: "docs/TEST_ONLY.md", version_id: id, image_sha256: sha, classification_source: "meta", reader_eligible: 1, image_url: externalFixture.image.externalUrl, intelligence_json: JSON.stringify(output) };
afterEach(() => vi.unstubAllGlobals());
it("reuses the existing persistent understanding schema, with backward compatible and bounded uncertain observations", () => {
  expect(understanding.parse(output).observations).toEqual(observations);
  expect(understanding.parse(mockUnderstanding(id)).observations).toBeUndefined();
  for (const bad of [ { ...observations, materialAppearance: ["titanium"] }, { ...observations, brand: "invented" }, { ...observations, subjects: ["<script>"] }, { ...observations, relationships: ["https://example.com"] } ]) expect(visualObservations.safeParse(bad).success).toBe(false);
});
it("binds authored evidence to original published asset versions without claiming AI analysis rights", () => {
  for (const ad of curationCatalog) {
    expect(authoredVisualContext(ad)?.source).toBe("authored_illustration");
    expect(authoredVisualContext(ad)?.model).toBeNull();
    expect(ad.permissions.aiAnalysis.status).toBe("pending");
  }
  const ad = curationCatalog[0];
  expect(authoredVisualContext({ ...ad, image: { ...ad.image, id: "new-version" } })).toBeNull();
  expect(authoredVisualContext({ ...ad, permissions: { ...ad.permissions, display: { status: "blocked", evidence: null } } })).toBeNull();
  expect(authoredVisualContext(externalFixture)).toBeNull();
});
it("projects only current Meta observations for separately approved external display records", () => {
  expect(retrievedVisualContext(hit, externalFixture)).toBeNull(); // production registry empty
  expect(retrievedVisualContext(hit, approvedFixture, testExternalApprovals)).toMatchObject({ source: "meta_image_observation", model: "muse-spark-1.3", uncertainty: "appearance_not_verified_fact", observations });
  for (const change of [ { version_id: `version-${"c".repeat(64)}` }, { image_sha256: "d".repeat(64) }, { classification_source: "mock" }, { analysis_evidence: "docs/CHANGED.md" }, { reader_eligible: 0 }, { image_url: "https://private.example/test" }, { intelligence_json: "invalid" }, { intelligence_json: JSON.stringify({ ...output, observations: { ...observations, subjects: ["invented-brand"] } }) } ]) expect(retrievedVisualContext({ ...hit, ...change }, approvedFixture, testExternalApprovals)).toBeNull();
  expect(retrievedVisualContext(hit, externalFixture, testExternalApprovals)).toBeNull();
  const revoked = { ...approvedFixture, permissions: { ...approvedFixture.permissions, display: { status: "blocked" as const, evidence: null } } };
  expect(retrievedVisualContext(hit, revoked, testExternalApprovals)).toBeNull();
});
it("finds permission-checked visual relationships, excluding stale and blocked records", () => {
  const ad = curationCatalog[0], result = relatedVisualStory(ad, curationCatalog)!;
  expect(result.ad.id).not.toBe(ad.id);
  expect(authoredVisualContext(result.ad)?.observations.relationships).toContain(result.relationship);
  expect(relatedVisualStory(ad, [ad])).toBeNull();
  expect(relatedVisualStory(ad, [{ ...result.ad, permissions: { ...result.ad.permissions, display: { status: "blocked", evidence: null } } }])).toBeNull();
});
it("sends version-bound observations as uncertain context while preserving the successful live Muse plan", async () => {
  const plan = JSON.parse(readFileSync("tests/fixtures/editorial-live-home.json", "utf8")).plan;
  const send = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    const context = JSON.parse(request.messages[1].content).catalog[0].visualContext;
    expect(context).toMatchObject({ source: "authored_illustration", model: null, uncertainty: "appearance_not_verified_fact" });
    expect(request.messages[0].content).toContain("never convert material appearances into material claims");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(plan) } }] });
  });
  vi.stubGlobal("fetch", send);
  expect((await generateEditorialResult({ ...defaultPreferences, allocations: { home: 100, fashion: 0, travel: 0 }, mode: "Focused" }, curationCatalog, "FAKE")).plan).toEqual(plan);
  expect(send).toHaveBeenCalledTimes(1);
});
