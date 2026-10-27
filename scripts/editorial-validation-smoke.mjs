import assert from "node:assert/strict";
import { validateLivePair, estimateCost, sanitizeDiagnostic } from "./editorial-live-check.mjs";
let requests = 0;
const send = async () => {
  requests++;
  return Response.json({
    source: "meta",
    cached: false,
    inference: {
      attempted: true,
      reservedUnits: 1,
      latencyMs: 50,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cachedInputTokens: 40,
        totalTokens: 120,
      },
    },
    plan: {
      features: [
        {
          catalogId: requests === 1 ? "home-lamp" : "travel-walk",
          layout: requests === 1 ? "hero" : "layered",
          motion: "reveal",
        },
      ],
      connections: [],
    },
  });
};
assert.equal((await validateLivePair({ send })).networkRequestsExecuted, 0);
assert.equal(requests, 0);
await assert.rejects(
  () => validateLivePair({ execute: true, send }),
  /approval/,
);
await assert.rejects(
  () =>
    validateLivePair({
      base: "https://curio.shuang-han807.workers.dev/",
      send,
    }),
  /local/,
);
assert.equal(
  estimateCost(
    { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40 },
    { input: 2, cachedInput: 1, output: 4 },
  ),
  0.00024,
);
assert.equal(
  estimateCost(
    { inputTokens: 100, outputTokens: 20, cachedInputTokens: null },
    { input: 2, cachedInput: 1, output: 4 },
  ),
  null,
);
const approved = {
  execute: true,
  approval: "two-original-editorial-editions",
  rates: { input: 2, cachedInput: 1, output: 4 },
  send,
  pause: async (ms) => assert.equal(ms, 61000),
};
const report = await validateLivePair(approved);
assert.equal(report.completed, true);
assert.equal(requests, 2);
requests = 0;
const stopped = await validateLivePair({
  ...approved,
  send: async () => {
    requests++;
    return Response.json({
      source: "deterministic",
      inference: { attempted: true, reservedUnits: 1 },
    });
  },
});
assert.equal(stopped.completed, false);
assert.equal(requests, 1);
console.log(
  "PASS: live validation is offline by default, rejects production/unapproved execution, caps at two local requests, measures verified-rate costs and stops on invalid/unmeasured results; all transport mocked",
);
const { mkdtemp, rm, readFile, stat } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { privateRecorder } = await import("./editorial-live-check.mjs");
const privateDirectory = await mkdtemp(
  join(tmpdir(), "curio-validation-test-"),
);
try {
  const record = await privateRecorder(privateDirectory);
  await record("focused-home", { fixture: true });
  assert.deepEqual(
    JSON.parse(
      await readFile(join(privateDirectory, "focused-home.json"), "utf8"),
    ),
    { fixture: true },
  );
  assert.equal(
    (await stat(join(privateDirectory, "focused-home.json"))).mode & 0o777,
    0o600,
  );
  await assert.rejects(() => privateRecorder(privateDirectory), /empty/);
  await assert.rejects(() => privateRecorder(process.cwd()), /Git|repository/);
  await assert.rejects(() => record("../../escape", {}), /profile/);
} finally {
  await rm(privateDirectory, { recursive: true, force: true });
}

assert.deepEqual(sanitizeDiagnostic({ code: "connection_sequence", field: "plan", raw: "private" }), { code: "connection_sequence", field: "plan" });
assert.equal(sanitizeDiagnostic({ code: "private provider text", field: "plan" }), null);
assert.equal(sanitizeDiagnostic({ code: "plan_schema", field: "https://private.example" }), null);
