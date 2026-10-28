import { readFile, lstat, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { privateRecorder, estimateCost } from './editorial-live-check.mjs';

// Reject paths inside ANY working tree, including other worktrees and symlinks.
export async function privatePath(path, directory = false) {
  if (!path || !isAbsolute(path)) throw Error('Absolute private path required');
  if (directory) await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw Error('Private regular file/directory required');
  const canonical = await realpath(path);
  for (let parent = directory ? canonical : dirname(canonical); ; parent = dirname(parent)) {
    let inside = false;
    try {
      const marker = join(parent, '.git'), info = await stat(marker);
      if (info.isDirectory()) { await stat(join(marker, 'HEAD')); inside = true; }
      else inside = (await readFile(marker, 'utf8')).startsWith('gitdir:');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (inside) throw Error('Private data cannot be inside Git');
    if (parent === dirname(parent)) break;
  }
  if (info.mode & 0o077) throw Error('Private data must have owner-only permissions (chmod 600 file / 700 directory)');
  return canonical;
}
export async function main(args = process.argv.slice(2)) {
  process.umask(0o077);
  const value = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const stage = value('stage') ?? 'verify';
  if (!['verify', 'muse-image', 'image-editorial', 'sam-segmentation'].includes(stage)) throw Error('Unknown stage');
  const mode = args.includes('--execute') ? 'live' : 'mock';
  // No credentials loaded or network requests made in verify/mock mode.
  const path = await privatePath(value('file') ?? '/tmp/curio-norm-ai-test.jpg');
  const bytes = new Uint8Array(await readFile(path));
  // Bundle only local code; no Vite dev server, public routes or media hosting.
  const buildResult = await build({ entryPoints: ['dev/norm-workflow.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const state = await privatePath(value('state') ?? '/tmp/curio-norm-private-state', true);
  const moduleFile = join(state, 'adapter.mjs');
  await writeFile(moduleFile, buildResult.outputFiles[0].contents, { mode: 0o600 });
  const workflow = await import(pathToFileURL(moduleFile).href);
  // Verification precedes DB creation, migration, registration and any model work.
  const assetBundle = await build({ entryPoints: ['dev/norm-asset.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const assetFile = join(state, 'asset.mjs');
  await writeFile(assetFile, assetBundle.outputFiles[0].contents, { mode: 0o600 });
  const { verifyNormBytes } = await import(pathToFileURL(assetFile).href);
  const exact = await verifyNormBytes(bytes);
  if (stage === 'verify') return { verified: true, ...exact, publicDisplayApproved: false, paidRequests: 0 };
  const evidence = await privateRecorder(value('evidence'));
  const budgetBundle = await build({ stdin: { contents: "export {InferenceBudget} from './worker/budget'; export default { fetch(){ return new Response('Private budget only') } }", resolveDir: process.cwd() }, bundle: true, platform: 'neutral', format: 'esm', write: false, logLevel: 'silent' });
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'curio-private-norm-test', modules: true, script: budgetBundle.outputFiles[0].text,
    compatibilityDate: '2026-10-26', telemetry: { enabled: false },
    resourcePersistencePath: join(state, 'database'), d1Databases: ['CATALOG_DB'],
    durableObjects: { INFERENCE_BUDGET: { className: 'InferenceBudget', useSQLite: true } },
    outboundService: () => { throw Error('Local database and budget cannot make outbound requests'); },
  }));
  try {
    const db = await mf.getD1Database('CATALOG_DB');
    if (!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_assets'").first()) {
      for (const name of ['0001_catalog.sql', '0002_asset_intelligence.sql']) await db.exec((await readFile(`migrations/${name}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\s+/g, ' '));
    }
    await workflow.initializeNorm(db, bytes);
    const rates = { input: Number(process.env.CURIO_META_INPUT_USD_PER_MILLION), cachedInput: Number(process.env.CURIO_META_CACHED_INPUT_USD_PER_MILLION), output: Number(process.env.CURIO_META_OUTPUT_USD_PER_MILLION) };
    const result = await workflow.runNormStage({ stage, mode, bytes, db,
      env: { MAGAZINE_MAX_CALLS: '3', RATE_LIMIT_SALT: 'local-norm-validation-isolated-budget-v1', INFERENCE_BUDGET: await mf.getDurableObjectNamespace('INFERENCE_BUDGET'), ...(mode === 'live' ? { META_API_KEY: process.env.META_API_KEY, META_SPARK_MODEL: 'muse-spark-1.3' } : {}) },
      approval: process.env.CURIO_NORM_APPROVAL, consent: process.env.CURIO_NORM_CONSENT === 'true', maxUsd: Number(process.env.CURIO_APPROVED_MAX_USD), rates,
      samPriceConfirmed: process.env.CURIO_NORM_SAM_PREFLIGHT === 'eligibility-jpeg-pricing-provider-cap-verified',
      prompt: value('prompt'), concept: value('concept'), approvedConcept: process.env.CURIO_NORM_APPROVED_CONCEPT,
    });
    await evidence(stage, result);
    const { output: privateOutput, ...safe } = result;
    void privateOutput;
    const estimatedUsd = mode === 'mock' || result.cached ? 0 : estimateCost(result.inference.usage, rates);
    const costWithinApprovedCap = mode === 'mock' || result.cached ? true : estimatedUsd === null ? null : estimatedUsd <= (mode === 'mock' ? 0 : Number(process.env.CURIO_APPROVED_MAX_USD));
    const report = { ...safe, exactVersion: exact.versionId, sha256: exact.sha256, evidence: mode === 'mock' ? 'mock_only_no_live_model_evidence' : 'controlled_live_attempt_not_automatic_success', estimatedUsd, approvedMaxUsd: mode === 'live' ? Number(process.env.CURIO_APPROVED_MAX_USD) : null, costWithinApprovedCap, acceptancePassed: Boolean(result.responseValid && !result.fallback && (mode === 'mock' || result.cached || costWithinApprovedCap === true)), billingReconciliationRequired: mode === 'live' && !result.cached, providerCostVerified: false, retries: 0 };
    await evidence(`${stage}-report`, report);
    return report;
  } finally { await mf.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const report = await main(); console.log(JSON.stringify(report, null, 2)); if (report.responseValid === false || report.acceptancePassed === false) process.exitCode = 1; }
  catch { console.error('Norm local validation stopped. Check private input, exact bytes, local state, stage prerequisites, evidence directory and explicit approval. No automatic retry.'); process.exitCode = 1; }
}
