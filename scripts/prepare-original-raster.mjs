import { chromium } from "@playwright/test";
import { readFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { privateRecorder } from "./editorial-live-check.mjs";
// This creates an offline review candidate. It grants no permission, publishes
// nothing, modifies no registry and never contacts an AI provider.
const directory = process.env.CURIO_ORIGINAL_RASTER_DIR;
const record = await privateRecorder(directory);
const source = new URL("../public/catalog/home-lamp.svg", import.meta.url);
const svg = await readFile(source);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.route("**/*", route => route.abort());
  await page.setContent(`<html><body style="margin:0">${svg.toString("utf8")}</body></html>`);
  await page.locator("svg").waitFor();
  const file = join(directory, "curio-original-home-lamp.png");
  const bytes = await page.screenshot({ path: file });
  await chmod(file, 0o600);
  await record("original-raster", { source: "Curio original home-lamp.svg", sourceSha256: createHash("sha256").update(svg).digest("hex"), fileName: "curio-original-home-lamp.png", sha256: createHash("sha256").update(bytes).digest("hex"), width: 1200, height: 900, mime: "image/png", origin: "offline_rasterization_not_AI", displayPermission: "pending_exact_version_review", analysisPermission: "pending_explicit_owner_approval", editsPermission: "pending", published: false, paidCalls: 0 });
} finally { await browser.close(); }
