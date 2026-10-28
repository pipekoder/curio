// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { normAsset, normGeometryRecord, normObservation, verifyNormBytes } from '../dev/norm-asset'
import { initializeNorm, normSam, runNormStage } from '../dev/norm-workflow'
import { isPublishable, curationCatalog } from '../shared/catalog'
import { analysisMediaPermits, technicalMediaHosts } from '../worker/asset-sources'
import { samAssetPermits } from '../worker/sam-assets'
import { assetDatabase } from './asset-fixtures'
import { AssetStore } from '../worker/asset-store'
import { candidateIds } from '../worker/catalog-store'
import { mockUnderstanding } from '../worker/asset-classifier'
import { generateEditorialResult, EditorialGenerationError } from '../worker/editorial'
import { interpretEditorialPrompt } from '../shared/editorial-intent'
import { segmentWithMeta } from '../worker/sam-client'

vi.setConfig({ testTimeout: 30000, hookTimeout: 20000 })
afterEach(() => vi.unstubAllGlobals())
it('never publishes the private record or globally permits Presscloud analysis', async () => {
  const ad = await normGeometryRecord()
  expect(isPublishable(ad)).toBe(false)
  expect(Object.values(ad.permissions).map(p => p.status)).toEqual(['pending', 'pending', 'pending'])
  expect(ad.licensing.status).toBe('pending')
  expect(curationCatalog.some(a => a.id === ad.id || a.image.externalUrl === normAsset.originalUrl)).toBe(false)
  expect(analysisMediaPermits).toEqual({}); expect(samAssetPermits).toEqual({})
  expect([...technicalMediaHosts]).not.toContain('assets.presscloud.com')
})
it('rejects changed, absent and same-size fabricated bytes before any inference', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch', send)
  await expect(verifyNormBytes(new Uint8Array())).rejects.toThrow('length')
  await expect(verifyNormBytes(new Uint8Array(normAsset.byteLength))).rejects.toThrow('fingerprint')
  await expect(normSam({ ad: await normGeometryRecord(), detailId: 'norm-local-detail', concept: 'seating', imageDataUrl: 'data:image/jpeg;base64,YQ==' }, 'FAKE', new AbortController().signal)).rejects.toThrow()
  expect(send).not.toHaveBeenCalled()
})
it('keeps the production SAM PNG gate intact for JPEG input', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch', send)
  await expect(segmentWithMeta({ ad: await normGeometryRecord(), detailId: 'norm-local-detail', concept: 'seating', imageDataUrl: 'data:image/jpeg;base64,YQ==' }, 'FAKE', new AbortController().signal)).rejects.toThrow('approved raster')
  expect(send).not.toHaveBeenCalled()
})
it('rejects stale/missing observations without treating appearance as a fact', async () => {
  const { versionId } = await candidateIds(normAsset.originalUrl, normAsset.versionKey)
  await expect(normObservation(mockUnderstanding(versionId))).rejects.toThrow()
  const valid = { ...mockUnderstanding(versionId), imageSha256: normAsset.sha256, observations: { subjects: ['seating'], materialAppearance: ['indeterminate'], environments: [], relationships: ['light-and-shadow'] } }
  expect((await normObservation(valid)).observations?.subjects).toEqual(['seating'])
  await expect(normObservation({ ...valid, imageSha256: '0'.repeat(64) })).rejects.toThrow()
  await expect(normObservation({ ...valid, observations: { ...valid.observations, materials: ['verified oak'] } })).rejects.toThrow()
})
it('preserves Focused Home output and only sends private inspiration when explicitly supplied', async () => {
  const capture = JSON.parse(readFileSync('tests/fixtures/editorial-live-home.json', 'utf8'))
  const send = vi.fn<(_url: unknown, _init?: RequestInit) => Promise<Response>>(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(capture.plan) } }], usage: { prompt_tokens: 1889, completion_tokens: 1357, total_tokens: 3246 } }))
  vi.stubGlobal('fetch', send)
  const p = interpretEditorialPrompt({ prompt: 'quiet Scandinavian home lamp reading rooms', consent: true })
  const a = await generateEditorialResult(p, [...curationCatalog], 'FAKE')
  expect(a.plan).toEqual(capture.plan)
  expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body)).messages[1].content).not.toContain('privateReferenceContext')
  const context = { versionId: `version-${'a'.repeat(64)}`, imageSha256: normAsset.sha256, source: 'meta_image_observation' as const, observations: { subjects: ['seating' as const], materialAppearance: [], environments: [], relationships: ['light-and-shadow' as const] } }
  expect((await generateEditorialResult(p, [...curationCatalog], 'FAKE', undefined, [context])).plan).toEqual(capture.plan)
  const body = JSON.parse(String(send.mock.calls[1]?.[1]?.body))
  expect(JSON.parse(body.messages[1].content).privateReferenceContext).toEqual([context])
  expect(JSON.parse(body.messages[1].content).catalog.some((a: {assetId: string}) => a.assetId === context.versionId)).toBe(false)
})

// The owner's photograph is deliberately absent from Git/CI. These additional
// exact-byte integration tests run locally when this private path is supplied.
const privateFile = process.env.CURIO_NORM_TEST_FILE
const privateIt = privateFile && existsSync(privateFile) ? it : it.skip
let context: Awaited<ReturnType<typeof assetDatabase>>
beforeEach(async c => { if (c.task.name.startsWith('private JPEG:')) context = await assetDatabase() })
afterEach(async () => { await context?.mf.dispose(); context = undefined! })
privateIt('private JPEG: verifies exact bytes and persists separate pending metadata plus mocked stages', async () => {
  const bytes = new Uint8Array(readFileSync(privateFile!)), exact = await initializeNorm(context.db, bytes)
  const never = vi.fn(() => { throw Error('No paid calls in mocked tests') })
  const env = {}, deps = { classify: never, sam: never, editorial: never, reserve: never }
  const run = (stage: 'muse-image' | 'image-editorial' | 'sam-segmentation') => runNormStage({ stage, mode: 'mock', bytes, db: context.db, env }, deps)
  expect((await run('muse-image')).responseValid).toBe(true)
  expect((await run('muse-image')).cached).toBe(true)
  expect((await run('image-editorial')).referenceVersionId).toBe(exact.versionId)
  const sam = await run('sam-segmentation')
  expect(sam.responseValid).toBe(true); expect(sam.output).toMatchObject({ source: 'authored_demo', model: null })
  expect(never).not.toHaveBeenCalled()
  const row = await new AssetStore(context.db).version(exact.versionId)
  expect(row?.analysis_status).toBe('pending')
  expect((await new AssetStore(context.db).stages()).counts?.reader_eligible).toBe(0)
  expect((await context.db.prepare('SELECT COUNT(*) AS n FROM local_norm_results').first())?.n).toBe(3)
})
privateIt('private JPEG: blocks missing approval, wrong context origin, revoked version and repeated live attempts', async () => {
  const bytes = new Uint8Array(readFileSync(privateFile!)); await initializeNorm(context.db, bytes)
  const never = vi.fn(), base = { stage: 'muse-image' as const, mode: 'live' as const, bytes, db: context.db, env: {}, consent: true }
  await expect(runNormStage(base, { reserve: never })).rejects.toThrow('approval')
  await runNormStage({ ...base, mode: 'mock' })
  await expect(runNormStage({ ...base, stage: 'image-editorial' }, { reserve: never })).rejects.toThrow('persisted')
  expect(never).not.toHaveBeenCalled()
  await context.db.prepare("UPDATE asset_permissions SET status='blocked' WHERE purpose='ai_analysis'").run()
  await expect(runNormStage({ ...base, mode: 'mock' })).rejects.toThrow('stale or unavailable')
})
privateIt('private JPEG: exercises real Muse request/validation and private context offline, preserving failed usage and no retries', async () => {
  const bytes = new Uint8Array(readFileSync(privateFile!)), exact = await initializeNorm(context.db, bytes)
  const env = { META_API_KEY: 'FAKE', META_SPARK_MODEL: 'muse-spark-1.3', MAGAZINE_MAX_CALLS: '3' }
  const base = { mode: 'live' as const, bytes, db: context.db, env, consent: true, maxUsd: 0.1, rates: { input: 1, cachedInput: 1, output: 1 } }
  const reserve = vi.fn(async () => ({ allowed: true, retryAfter: 60 }))
  const analysis = { ...mockUnderstanding(exact.versionId), imageSha256: exact.sha256, observations: { subjects: ['seating'], materialAppearance: [], environments: ['interior-like'], relationships: ['light-and-shadow'] } }
  const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body))
    expect(request.model).toBe('muse-spark-1.3')
    expect(request.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true)
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })
  })
  vi.stubGlobal('fetch', send)
  const image = await runNormStage({ ...base, stage: 'muse-image', approval: 'norm-one-muse-image' }, { reserve })
  expect(image.responseValid).toBe(true); expect(image.inference).toMatchObject({ attempted: true, reservedUnits: 1, usage: { totalTokens: 30 } })
  const editorial = vi.fn(async (...args: Parameters<typeof generateEditorialResult>) => {
    expect(args[4]?.[0].versionId).toBe(exact.versionId)
    throw new EditorialGenerationError({ latencyMs: 10, usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 0, totalTokens: 3 } })
  })
  const result = await runNormStage({ ...base, stage: 'image-editorial', approval: 'norm-one-image-editorial' }, { reserve, editorial })
  expect(result).toMatchObject({ responseValid: false, fallback: true, inference: { reservedUnits: 1, usage: { totalTokens: 3 } } })
  await expect(runNormStage({ ...base, stage: 'image-editorial', approval: 'norm-one-image-editorial' }, { reserve, editorial })).rejects.toThrow('already attempted')
  expect(editorial).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1)
})
privateIt('private JPEG: sends the exact JPEG to genuine SAM transport with a fully mocked empty SSE result', async () => {
  const bytes = new Uint8Array(readFileSync(privateFile!)); await initializeNorm(context.db, bytes)
  const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body))
    expect(request.model).toBe('sam-3.1')
    expect(Buffer.from(request.input[0].content[1].image_url.split(',')[1], 'base64')).toEqual(Buffer.from(bytes))
    return new Response('data: {"type":"response.completed"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', send)
  const result = await runNormStage({ stage: 'sam-segmentation', mode: 'live', bytes, db: context.db, env: { META_API_KEY: 'FAKE', META_SPARK_MODEL: 'muse-spark-1.3', MAGAZINE_MAX_CALLS: '3' }, consent: true, approval: 'norm-one-sam-segmentation', maxUsd: 0.1, samPriceConfirmed: true }, { reserve: async () => ({ allowed: true, retryAfter: 60 }) })
  expect(result).toMatchObject({ responseValid: true, output: { source: 'sam_detection', regions: [] } })
  expect(send).toHaveBeenCalledTimes(1)
})
it('rejects Git-contained, symlinked and broadly readable private data paths', async () => {
  const { mkdtemp, mkdir, writeFile, chmod, symlink, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os'), { join } = await import('node:path')
  const modulePath = '../scripts/norm-local-validation.mjs'
  const { privatePath } = await import(modulePath)
  const dir = await mkdtemp(join(tmpdir(), 'curio-norm-path-test-'))
  try {
    const file = join(dir, 'private.jpg'); await writeFile(file, 'not a photograph', { mode: 0o600 })
    expect(await privatePath(file)).toBe(file)
    await chmod(file, 0o644); await expect(privatePath(file)).rejects.toThrow('owner-only'); await chmod(file, 0o600)
    const link = join(dir, 'link.jpg'); await symlink(file, link)
    await expect(privatePath(link)).rejects.toThrow('regular')
    await mkdir(join(dir, '.git')); await writeFile(join(dir, '.git/HEAD'), 'ref: refs/heads/test\n')
    await expect(privatePath(file)).rejects.toThrow('inside Git')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
