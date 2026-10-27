import {
  mkdir,
  realpath,
  readdir,
  writeFile,
  stat,
  readFile,
} from "node:fs/promises";
import { isAbsolute, relative, join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
export function sanitizeDiagnostic(value) {
  const codes = new Set(["provider_choices_or_finish", "response_json", "provider_plan_schema", "plan_schema", "visual_vocabulary_or_characters", "phrase_length", "hypothetical_sentence_format", "asset_permission_or_pair", "asset_theme_or_copy", "connection_grounding", "original_language", "repeated_copy", "focused_coverage", "insufficient_coverage", "layout_diversity", "dominant_category", "balanced_coverage", "connection_count", "connection_sequence"]);
  return value && codes.has(value.code) && /^(response|plan|title|deck|features\.[0-5]\.(headline|narrative)|connections\.[0-4]\.thread)$/.test(value.field)
    ? { code: value.code, field: value.field } : null;
}
export const liveProfiles = [
  {
    interests: "paper quiet lamp reading rooms",
    aesthetics: ["Scandinavian"],
    allocations: { home: 100, fashion: 0, travel: 0 },
    mode: "Focused",
    consent: true,
  },
  {
    interests: "woodland path walking outdoors",
    aesthetics: ["Nature & Outdoor"],
    allocations: { home: 0, fashion: 0, travel: 100 },
    mode: "Surprise Me",
    consent: true,
  },
];
export function estimateCost(usage, rates) {
  if (
    !usage ||
    !rates ||
    !["input", "cachedInput", "output"].every(
      (k) => Number.isFinite(rates[k]) && rates[k] >= 0,
    )
  )
    return null;
  if (
    !Number.isSafeInteger(usage.inputTokens) ||
    usage.inputTokens < 0 ||
    !Number.isSafeInteger(usage.outputTokens) ||
    usage.outputTokens < 0 ||
    (usage.totalTokens !== undefined &&
      usage.totalTokens !== usage.inputTokens + usage.outputTokens)
  )
    return null;
  const cached = usage.cachedInputTokens;
  if (
    cached !== null &&
    (!Number.isSafeInteger(cached) || cached < 0 || cached > usage.inputTokens)
  )
    return null;
  if (cached === null && rates.input !== rates.cachedInput) return null;
  return (
    ((usage.inputTokens - (cached ?? 0)) * rates.input +
      (cached ?? 0) * rates.cachedInput +
      usage.outputTokens * rates.output) /
    1000000
  );
}
export async function validateLivePair({
  execute = false,
  approval = "",
  base = "http://127.0.0.1:18788",
  origin = "https://curio.test",
  rates = null,
  send = fetch,
  record = async () => {},
  pause = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const target = new URL(base);
  if (
    target.protocol !== "http:" ||
    target.hostname !== "127.0.0.1" ||
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  )
    throw Error(
      "Only an isolated local Worker may be tested; no production targets",
    );
  if (!execute)
    return {
      dryRun: true,
      profiles: liveProfiles,
      maxRequests: 2,
      maxCompletionTokens: 4400,
      networkRequestsExecuted: 0,
      approvalRequired: true,
    };
  if (approval !== "two-original-editorial-editions")
    throw Error("Explicit two-edition paid-test approval is required");
  if (
    !rates ||
    !["input", "cachedInput", "output"].every(
      (k) => Number.isFinite(rates[k]) && rates[k] >= 0,
    )
  )
    throw Error(
      "Verified Meta input, cached-input and output USD rates per million tokens are required",
    );
  const results = [];
  for (let i = 0; i < liveProfiles.length; i++) {
    if (i) await pause(61000);
    const started = performance.now();
    const response = await send(`${target.origin}/api/editorial`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1",
      },
      body: JSON.stringify(liveProfiles[i]),
    });
    if (!response.ok)
      throw Error(
        `Local validation stopped at HTTP ${response.status}; no retry`,
      );
    const data = await response.json();
    await record(i === 0 ? "focused-home" : "surprise-travel", data);
    const cost =
      data.cached &&
      data.inference?.attempted === false &&
      data.inference?.reservedUnits === 0
        ? 0
        : estimateCost(data.inference?.usage, rates);
    const valid =
      data.source === "meta" &&
      !data.cached &&
      data.inference?.reservedUnits === 1 &&
      data.inference?.attempted === true &&
      cost !== null;
    // The measurement report excludes raw prompts, prose, URLs and credentials.
    // Full server responses are separately captured only in private files. Provider accounting remains available even on rejection.
    results.push({
      profile: i === 0 ? "focused-home" : "surprise-travel",
      valid,
      responseValid: data.source === "meta",
      usageMeasured: Boolean(data.inference?.usage),
      inferenceAttempted: Boolean(data.inference?.attempted),
      reservedUnits: data.inference?.reservedUnits ?? 0,
      source: data.source,
      cached: Boolean(data.cached),
      roundTripMs: Math.round(performance.now() - started),
      providerLatencyMs: data.inference?.latencyMs ?? null,
      usage: data.inference?.usage ?? null,
      estimatedUsd: cost,
      fallbackReason: data.fallbackReason ?? null,
      validationDiagnostic: sanitizeDiagnostic(data.validationDiagnostic),
      sequence:
        data.plan?.features?.map((f) => ({
          catalogId: f.catalogId,
          layout: f.layout,
          motion: f.motion,
        })) ?? [],
      connectionCount: data.plan?.connections?.length ?? 0,
    });
    if (!valid)
      return {
        completed: false,
        requestsSent: results.length,
        results,
        stopReason:
          "Response rejected, budget unavailable, cache hit or usage unmeasured; no automatic retry",
      };
  }
  const differentiated =
    JSON.stringify(results[0].sequence) !== JSON.stringify(results[1].sequence);
  return {
    completed: differentiated,
    requestsSent: 2,
    differentiated,
    results,
    totalEstimatedUsd: results.reduce((n, r) => n + r.estimatedUsd, 0),
    pricingSource:
      "operator-provided verified Meta rates; estimate, not an invoice",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const execute = process.argv.includes("--execute");
  const record = execute
    ? await privateRecorder(process.env.CURIO_LIVE_EVIDENCE_DIR)
    : undefined;
  const report = await validateLivePair({
    record,
    execute,
    approval: process.env.CURIO_LIVE_APPROVAL,
    base: process.env.CURIO_LOCAL_WORKER_URL,
    origin: process.env.CURIO_LOCAL_APP_ORIGIN,
    rates: execute
      ? {
          input: Number(process.env.CURIO_META_INPUT_USD_PER_MTOK),
          cachedInput: Number(process.env.CURIO_META_CACHED_INPUT_USD_PER_MTOK),
          output: Number(process.env.CURIO_META_OUTPUT_USD_PER_MTOK),
        }
      : null,
  });
  console.log(JSON.stringify(report, null, 2));
  if (execute && !report.completed) process.exitCode = 1;
}

export async function privateRecorder(directory) {
  if (!directory || !isAbsolute(directory))
    throw Error(
      "An absolute private evidence directory outside Git is required",
    );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonical = await realpath(directory),
    repo = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  const rel = relative(repo, canonical);
  if (!(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
    throw Error("Evidence must remain outside the Git repository");
  for (let parent = canonical; ; parent = dirname(parent)) {
    let inside = false;
    try {
      const marker = join(parent, ".git"),
        info = await stat(marker);
      if (info.isDirectory()) {
        await stat(join(marker, "HEAD"));
        inside = true;
      } else inside = (await readFile(marker, "utf8")).startsWith("gitdir:");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (inside) throw Error("Evidence cannot be inside any Git working tree");
    if (dirname(parent) === parent) break;
  }
  if ((await readdir(canonical)).length)
    throw Error("Use a new empty evidence directory before making any calls");
  return async (name, data) => {
    if (!["focused-home", "surprise-travel"].includes(name))
      throw Error("Unknown evidence profile");
    return writeFile(
      join(canonical, `${name}.json`),
      JSON.stringify(data, null, 2),
      { mode: 0o600, flag: "wx" },
    );
  };
}
