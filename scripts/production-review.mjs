import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const url = new URL(
  process.env.CURIO_PRODUCTION_REVIEW_URL ??
    "https://curio.shuang-han807.workers.dev/",
);
if (
  url.protocol !== "https:" ||
  url.hostname !== "curio.shuang-han807.workers.dev" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw Error("Only the supplied production homepage may be reviewed");
await mkdir("test-results/production", { recursive: true });
let browser;
const evidence = {
  origin: url.origin,
  reviewedAt: new Date().toISOString(),
  timezone: "Europe/Stockholm",
  apiRequestsBlocked: 0,
  thirdPartyRequestsBlocked: 0,
  modelRequestsExecuted: 0,
  screenshots: [],
  status: "unverified",
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY }
      : undefined,
  });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const request = route.request(),
        target = new URL(request.url());
      if (request.method() !== "GET" || target.pathname.startsWith("/api/")) {
        evidence.apiRequestsBlocked++;
        return route.abort();
      }
      if (target.origin !== url.origin) {
        evidence.thirdPartyRequestsBlocked++;
        return route.abort();
      }
      return route.continue();
    });
    const response = await page.goto(url.href, {
      waitUntil: "networkidle",
      timeout: 20000,
    });
    if (!response?.ok())
      throw Error("Production navigation blocked or unsuccessful");
    await page.screenshot({
      path: `test-results/production/home-${width}.png`,
      fullPage: true,
    });
    evidence.screenshots.push(`home-${width}.png`);
    evidence.status = "reviewed_frontend_only_apis_blocked";
    await context.close();
  }
} catch {
  evidence.status = "blocked_unverified";
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    "test-results/production/review.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
}
