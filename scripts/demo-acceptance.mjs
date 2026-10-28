import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
// Local tests only. No deploy, remote D1, paid inference or production mutation.
const checks = ["typecheck", "lint", "test", "build", "worker:check", "test:integration", "test:browser"];
const results = [];
for (const name of checks) {
  const started = performance.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", name], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    child.once("error", reject); child.once("exit", code => resolve(code));
  });
  results.push({ check: name, passed: code === 0, durationMs: Math.round(performance.now()-started) });
  if (code !== 0) break;
}
await mkdir("test-results", { recursive: true });
const report = { checks: results, completed: results.length === checks.length && results.every(r => r.passed), paidModelCalls: 0, productionWrites: 0 };
await writeFile("test-results/acceptance.json", JSON.stringify(report, null, 2));
if (!report.completed) process.exitCode = 1;
