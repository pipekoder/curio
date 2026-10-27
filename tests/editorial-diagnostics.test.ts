import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { curationCatalog } from "../shared/catalog";
import { defaultPreferences, validateOriginalPlan } from "../shared/editorial";
import { diagnoseOriginalPlan } from "../shared/editorial-diagnostics";
import { generateEditorialResult } from "../worker/editorial";
const captured = JSON.parse(readFileSync("tests/fixtures/editorial-live-home.json", "utf8"));
const mocked = JSON.parse(readFileSync("tests/fixtures/editorial-original.json", "utf8"));
const home = { ...defaultPreferences, interests: "paper quiet lamp reading rooms", aesthetics: ["Scandinavian" as const], allocations: { home: 100, fashion: 0, travel: 0 }, mode: "Focused" as const };
const travel = { ...defaultPreferences, interests: "woodland path walking outdoors", aesthetics: ["Nature & Outdoor" as const], allocations: { home: 0, fashion: 0, travel: 100 }, mode: "Surprise Me" as const };
afterEach(() => vi.unstubAllGlobals());
it("replays the successful real Home plan without altering its prose or accounting", async () => {
  expect(validateOriginalPlan(captured.plan, curationCatalog, home)).toEqual(captured.plan);
  expect(diagnoseOriginalPlan(captured.plan, curationCatalog, home)).toBeNull();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(captured.plan) } }], usage: { prompt_tokens: 1889, completion_tokens: 1357, total_tokens: 3246, prompt_tokens_details: { cached_tokens: 0 } } })));
  const result = await generateEditorialResult(home, curationCatalog, "FAKE");
  expect(result.plan).toEqual(captured.plan);
  expect(result.measurement.usage).toEqual(captured.inference.usage);
  // Historical provider latency is evidence, not a mocked performance assertion.
  expect(captured.inference.latencyMs).toBe(6124);
  const other = validateOriginalPlan(mocked.travel, curationCatalog, travel);
  expect(other.title).not.toBe(result.plan.title);
  expect(other.features.map(f => f.assetId)).not.toEqual(result.plan.features.map(f => f.assetId));
  expect(other.features[0].layout).not.toBe(result.plan.features[0].layout);
  expect(other.features[0].motion).not.toBe(result.plan.features[0].motion);
});
it.each([
  ["vocabulary", { ...mocked.travel, title: "Acme titanium" }, "visual_vocabulary_or_characters", "title"],
  ["narrative", { ...mocked.travel, deck: "A quiet path with space for another way of looking." }, "hypothetical_sentence_format", "deck"],
  ["coverage", { ...mocked.travel, connections: [] }, "connection_count", "plan"],
  ["sequence", { ...mocked.travel, connections: mocked.travel.connections.map((c: Record<string,string>) => ({ ...c, fromAssetId: c.toAssetId, toAssetId: c.fromAssetId })) }, "connection_sequence", "plan"],
  ["layout", { ...mocked.travel, features: mocked.travel.features.map((f: object) => ({ ...f, layout: "hero" })) }, "layout_diversity", "plan"],
  ["asset", { ...mocked.travel, features: [{ ...mocked.travel.features[0], assetId: "unapproved-secret" }, mocked.travel.features[1]] }, "asset_permission_or_pair", "plan"],
  ["theme", { ...mocked.travel, features: [{ ...mocked.travel.features[0], theme: "private-theme" }, mocked.travel.features[1]] }, "asset_theme_or_copy", "plan"],
])("diagnoses mocked Travel %s failures without returning private content", (_name, plan, code, field) => {
  const result = diagnoseOriginalPlan(plan, curationCatalog, travel);
  expect(result).toEqual({ code, field });
  expect(JSON.stringify(result)).not.toMatch(/Acme|titanium|unapproved-secret/);
  expect(() => validateOriginalPlan(plan, curationCatalog, travel)).toThrow();
});
it.each([
  ["length", "{}", "provider_choices_or_finish"],
  ["stop", "not-json private-content", "response_json"],
  ["stop", '{"title":"private-content"}', "provider_plan_schema"],
  ["stop", JSON.stringify({ ...mocked.travel, connections: [] }), "connection_count"],
])("preserves usage and sanitized diagnostics for finish=%s", async (finish, content, code) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 1887, completion_tokens: 1202, total_tokens: 3089 } })));
  await expect(generateEditorialResult(travel, curationCatalog, "FAKE")).rejects.toMatchObject({ diagnostic: { code }, measurement: { usage: { inputTokens: 1887, outputTokens: 1202 } } });
});
