import { pathToFileURL } from "node:url";
import { privateRecorder, estimateCost, sanitizeDiagnostic } from "./editorial-live-check.mjs";
const stages = ["muse-image", "image-editorial", "sam-segmentation"];
export async function acceptLiveStage({ stage, execute = false, approval = "", base = "http://127.0.0.1:18788", versionId, assetId, sha256, token, samToken, rates, maxUsd, send = fetch, record = async () => {} }) {
  if (!stages.includes(stage)) throw Error("Select one known acceptance stage");
  if (!execute) return { stage, dryRun: true, networkRequestsExecuted: 0, maxModelRequests: 1, maxCompletionTokens: stage === "muse-image" ? 1200 : stage === "image-editorial" ? 2200 : null };
  const target = new URL(base);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw Error("Local Worker only");
  if (approval !== `one-${stage}` || !/^version-[a-f0-9]{64}$/.test(versionId ?? "") || !/^[a-z0-9-]{1,80}$/.test(assetId ?? "") || !/^[a-f0-9]{64}$/.test(sha256 ?? "") || !token || token.length < 32 || !Number.isFinite(maxUsd) || maxUsd <= 0) throw Error("Explicit stage approval, exact reviewed asset and positive spending cap required");
  if (stage !== "sam-segmentation" && estimateCost({ inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }, rates) === null) throw Error("Verified Meta rates required");
  if (stage === "sam-segmentation" && (!samToken || samToken.length < 32)) throw Error("Separate SAM operator token required");
  let requests = 0;
  const request = async (path, body, credential = token) => {
    requests++;
    const response = await send(`${target.origin}${path}`, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(25000), headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}), Origin: "https://curio.test", "Content-Type": "application/json", "CF-Connecting-IP": "127.0.0.1" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { ok: response.ok, status: response.status, data: await response.json() };
  };
  const ready = await request(`/api/operator/catalog/intelligence/versions/${versionId}/readiness`);
  const r = ready.data;
  if (!ready.ok || r.versionId !== versionId || r.imageSha256 !== sha256 || r.inferenceMaxCalls !== "3" || !r.analysis?.ready) throw Error("Exact media/rights/budget preflight failed; no model request");
  if (stage === "muse-image" && (!r.liveEnabled || r.jobs?.length)) throw Error("Fresh explicit analysis required; cached/failed jobs need separate review, not retries");
  if (stage === "image-editorial" && (!r.editorialEnabled || r.editorialContextAssetId !== assetId)) throw Error("No eligible persisted image context; no editorial call");
  if (stage === "sam-segmentation") {
    const config = await request("/api/decoder/config", undefined, null);
    if (!config.ok || !config.data.enabled || r.samAssetId !== assetId || r.samCommentaryEnabled) throw Error("SAM is unavailable, wrong asset, or commentary enabled; no model request");
  }
  // Exactly one model-capable request, never retried, regardless of outcome.
  const started = performance.now();
  const response = stage === "muse-image"
    ? await request("/api/operator/catalog/intelligence/classify", { versionId, mode: "meta", consent: true, retryFailed: false })
    : stage === "image-editorial"
      ? await request("/api/editorial", { prompt: "Create a quiet visual magazine about light and shadow, reading rooms and Scandinavian interiors.", consent: true }, null)
      : await request("/api/decoder", { adId: "home-lamp", assetId, detailId: "home-lamp-detail", consent: true }, samToken);
  await record(stage, response.data);
  const d = response.data, inference = d.inference;
  const estimatedUsd = stage === "sam-segmentation" ? null : estimateCost(inference?.usage, rates);
  const outputValid = response.ok && (stage === "muse-image" ? d.origin === "meta" && !d.cached && d.result?.versionId === versionId && d.result?.imageSha256 === sha256 && Boolean(d.result?.observations)
    : stage === "image-editorial" ? d.source === "meta" && !d.cached && Array.isArray(d.imageContextAssetIds) && d.imageContextAssetIds.includes(assetId)
      : d.segmentation?.source === "sam_detection" && d.segmentation?.model === "sam-3.1" && d.segmentation?.assetId === assetId);
  const measured = stage === "sam-segmentation" ? false : inference?.attempted === true && inference?.reservedUnits === 1 && estimatedUsd !== null;
  const safeInference = inference ? { attempted: inference.attempted === true, reservedUnits: Number.isInteger(inference.reservedUnits) && inference.reservedUnits >= 0 && inference.reservedUnits <= 3 ? inference.reservedUnits : null, latencyMs: Number.isFinite(inference.latencyMs) && inference.latencyMs >= 0 ? inference.latencyMs : null, usage: estimatedUsd === null ? null : { inputTokens: inference.usage.inputTokens, outputTokens: inference.usage.outputTokens, cachedInputTokens: inference.usage.cachedInputTokens, totalTokens: inference.usage.totalTokens } } : null;
  const report = { stage, regionCount: stage === "sam-segmentation" && Array.isArray(d.segmentation?.regions) ? d.segmentation.regions.length : null, evidence: "actual_local_worker_response_not_automatically_live_verified", httpStatus: response.status, outputValid, measured, costWithinApprovedCap: estimatedUsd === null ? null : estimatedUsd <= maxUsd, estimatedUsd, approvedMaxUsd: maxUsd, providerCostVerified: false, roundTripMs: Math.round(performance.now()-started), inference: safeInference, validationDiagnostic: sanitizeDiagnostic(d.validationDiagnostic), modelRequestsSubmitted: 1, httpRequests: requests, retries: 0, completed: Boolean(outputValid && (stage === "sam-segmentation" || measured && estimatedUsd <= maxUsd)) };
  await record(`${stage}-report`, report);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const execute = process.argv.includes("--execute"), stage = process.argv.find(a => a.startsWith("--stage="))?.split("=")[1] ?? "muse-image";
  const capture = execute ? await privateRecorder(process.env.CURIO_LIVE_EVIDENCE_DIR) : async () => {};
  const report = await acceptLiveStage({ stage, execute, approval: process.env.CURIO_LIVE_APPROVAL, versionId: process.env.CURIO_LIVE_VERSION_ID, assetId: process.env.CURIO_LIVE_ASSET_ID, sha256: process.env.CURIO_LIVE_SHA256, token: process.env.CURIO_CATALOG_OPERATOR_TOKEN, samToken: process.env.CURIO_SAM_OPERATOR_TOKEN, maxUsd: Number(process.env.CURIO_APPROVED_MAX_USD), rates: { input: Number(process.env.CURIO_META_INPUT_USD_PER_MILLION), cachedInput: Number(process.env.CURIO_META_CACHED_INPUT_USD_PER_MILLION), output: Number(process.env.CURIO_META_OUTPUT_USD_PER_MILLION) }, record: capture });
  console.log(JSON.stringify(report, null, 2));
  if (execute && !report.completed) process.exitCode = 1;
}
