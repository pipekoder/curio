import assert from "node:assert/strict";
import { acceptLiveStage } from "./live-ai-acceptance.mjs";
import { productionSmoke } from "./production-smoke.mjs";
let calls = 0;
const send = async () => { calls++; throw Error("Unexpected network"); };
for (const stage of ["muse-image", "image-editorial", "sam-segmentation"]) assert.equal((await acceptLiveStage({ stage, send })).networkRequestsExecuted, 0);
assert.equal((await productionSmoke({ send })).requests, 0);
assert.equal(calls, 0);
const base = { stage: "muse-image", execute: true, approval: "one-muse-image", versionId: `version-${"a".repeat(64)}`, assetId: "test-original-v1", sha256: "b".repeat(64), token: "FAKE_OPERATOR_TOKEN_32_CHARACTERS_ONLY", rates: { input: 1, cachedInput: 1, output: 2 }, maxUsd: 0.02 };
await assert.rejects(() => acceptLiveStage({ ...base, base: "https://curio.shuang-han807.workers.dev", send }), /Local/);
await assert.rejects(() => acceptLiveStage({ ...base, approval: "", send }), /Explicit/);
assert.equal(calls, 0);
let posts = 0;
const fake = async (_url, init) => {
  if (init.method === "GET") return Response.json({ versionId: base.versionId, imageSha256: base.sha256, inferenceMaxCalls: "3", analysis: { ready: true }, liveEnabled: true, jobs: [] });
  posts++;
  return Response.json({ origin: "meta", cached: false, result: { versionId: base.versionId, imageSha256: base.sha256, observations: {} }, inference: { attempted: true, reservedUnits: 1, latencyMs: 5, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 0 } } });
};
const report = await acceptLiveStage({ ...base, send: fake });
assert.equal(report.completed, true); assert.equal(posts, 1); assert.equal(report.retries, 0);
await assert.rejects(() => acceptLiveStage({ ...base, send: async () => Response.json({ analysis: { ready: false } }) }), /preflight/);
posts = 0;
const failed = await acceptLiveStage({ ...base, send: async (url, init) => init.method === "GET" ? fake(url, init) : (posts++, Response.json({ status: "invalid_model_output" }, { status: 502 })) });
assert.equal(failed.completed, false); assert.equal(posts, 1);
let gets = 0;
const smoke = await productionSmoke({ execute: true, send: async (url, init) => {
  gets++; assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.headers.Authorization, undefined);
  return Response.json(url.endsWith("/health") ? { ok: true, app: "curio" } : url.endsWith("/status") ? { status: "catalog_unavailable" } : { enabled: false }, { status: url.endsWith("/status") ? 503 : 200 });
} });
assert.equal(smoke.status, "passed"); assert.equal(gets, 4);
console.log("PASS: separate local single-call approvals, production/rights rejection, no retries, measured costs, private stage evidence names; read-only production smoke mocked");
for (const stage of ['image-editorial','sam-segmentation']) {
  let posts=0;
  const report=await acceptLiveStage({...base,stage,approval:`one-${stage}`,samToken:base.token,send:async(url,init)=>{
    if(init.method==='GET')return Response.json(url.endsWith('/config')?{enabled:true}:{versionId:base.versionId,imageSha256:base.sha256,inferenceMaxCalls:'3',analysis:{ready:true},editorialEnabled:true,editorialContextAssetId:base.assetId,samAssetId:base.assetId,samCommentaryEnabled:false});
    posts++;
    return Response.json(stage==='sam-segmentation'?{segmentation:{source:'sam_detection',model:'sam-3.1',assetId:base.assetId,regions:[]}}:{source:'meta',cached:false,imageContextAssetIds:[base.assetId],inference:{attempted:true,reservedUnits:1,latencyMs:10,usage:{inputTokens:100,outputTokens:50,cachedInputTokens:0,totalTokens:150}}});
  }});
  assert.equal(report.completed,true);assert.equal(posts,1);
  if(stage==='sam-segmentation'){assert.equal(report.estimatedUsd,null);assert.equal(report.measured,false)}
}
