import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const run = promisify(execFile);
async function productionRequest(url) {
  // curl inherits the managed proxy and CA trust; no redirects or credentials.
  const { stdout } = await run("curl", ["--silent", "--show-error", "--max-time", "10", "--max-filesize", "65536", "--proto", "=https", "--request", "GET", "--header", "Accept: application/json", "--write-out", "\n%{http_code}", url], { maxBuffer: 70000 });
  const at = stdout.lastIndexOf("\n"), status = Number(stdout.slice(at+1));
  return { status, json: async () => JSON.parse(stdout.slice(0,at)) };
}
const origin = "https://curio.shuang-han807.workers.dev";
export async function productionSmoke({ execute = false, send = productionRequest } = {}) {
  if (!execute) return { dryRun: true, origin, requests: 0, allowedMethods: ["GET"] };
  const results = [];
  const checks = [
    ["/api/health", 200, d => d.ok === true && d.app === "curio"],
    ["/api/magazine/config", 200, d => d.enabled === false],
    ["/api/decoder/config", 200, d => d.enabled === false],
    ["/api/operator/catalog/status", 503, d => d.status === "catalog_unavailable"],
  ];
  for (const [path, status, valid] of checks) {
    const started = performance.now();
    try {
      const r = await send(origin + path, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
      results.push({ path, status: r.status, passed: r.status === status && valid(await r.json()), latencyMs: Math.round(performance.now()-started) });
    } catch { results.push({ path, passed: false, status: null, failure: "transport_or_unreadable_response" }); }
  }
  return { origin, readOnly: true, requests: results.length, paidCalls: 0, status: results.every(r => r.passed) ? "passed" : "blocked_or_failed_unverified", results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await productionSmoke({ execute: process.argv.includes("--execute") });
  console.log(JSON.stringify(report, null, 2));
  if (report.status && report.status !== "passed") process.exitCode = 1;
}
