// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { catalog, catalogItem } from '../shared/catalog'
import { authoredDemo, bindSegmentation, containRect, segmentation } from '../shared/decoder'
import { normalizeSamResult, segmentWithMeta } from '../worker/sam-client'
import { commentaryContext, regionCommentary } from '../worker/decoder-commentary'
import { runDecoder } from '../worker/decoder'
import app, { type Bindings } from '../worker/index'
import { externalFixture } from './hybrid-fixtures'
import type { ImageSegmentationResult } from '@meta-sam/parser'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })
const request = { adId: 'home-lamp', assetId: 'asset-home-lamp-v1', detailId: 'home-lamp-detail', consent: true as const }
const operatorToken = 'test-only-operator-credential-at-least-32'
const env: Bindings = { SAM_OPERATOR_TOKEN: operatorToken, SAM_DECODER_ENABLED: 'true', META_SAM_MODEL: 'sam-3.1', META_SPARK_MODEL: 'muse-spark-1.3', META_API_KEY: 'FAKE_TEST_KEY', PUBLIC_APP_ORIGIN: 'https://curio.test', RATE_LIMIT_SALT: 'test-only-salt-placeholder-at-least-32', SAM_LIVE_ASSET_ID: 'approved-sam-test-v1' }
const post = (body: unknown, bindings: Bindings = {}) => app.request('/api/decoder', { method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, Origin: 'https://curio.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) }, bindings)
it('has six authored demos, exact versions, no fake confidence or detections', () => {
  for (const ad of catalog) {
    const demo = authoredDemo(ad)!
    expect(demo.source).toBe('authored_demo'); expect(demo.model).toBeNull()
    expect(demo.regions.length).toBeGreaterThan(0)
    expect(demo.regions.every(region => region.confidence === null)).toBe(true)
    expect(authoredDemo({ ...ad, image: { ...ad.image, id: 'new-version' } })).toBeNull()
  }
  expect(authoredDemo(externalFixture)).toBeNull()
})
it.each([
  [1000, 625, 1200, 900, { x: 83.33333333333331, y: 0, width: 833.3333333333334, height: 625 }],
  [320, 240, 1200, 900, { x: 0, y: 0, width: 320, height: 240 }],
])('maps contain geometry without crop at %s x %s', (w, h, sw, sh, expected) => {
  const result = containRect(w as number, h as number, sw as number, sh as number)!
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(result[key]).toBeCloseTo((expected as typeof result)[key])
})
it('rejects invalid geometry, duplicate regions and stale/mismatched detail identities', () => {
  expect(containRect(0, 100, 1200, 900)).toBeNull()
  const demo = authoredDemo(catalog[0])!
  expect(() => bindSegmentation({ ...demo, assetId: 'wrong-asset' }, catalog[0])).toThrow()
  expect(() => bindSegmentation({ ...demo, regions: [{ ...demo.regions[0], detailId: 'unknown' }] }, catalog[0])).toThrow()
  expect(segmentation.safeParse({ ...demo, regions: [{ ...demo.regions[0], box: { x: .9, y: .5, width: .5, height: .5 } }] }).success).toBe(false)
  expect(segmentation.safeParse({ ...demo, regions: [demo.regions[0], demo.regions[0]] }).success).toBe(false)
  expect(segmentation.safeParse({ ...demo, model: 'sam-3.1' }).success).toBe(false)
})
it('returns disabled by default, never calling a provider or accessing image assets', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const assets = vi.fn()
  expect((await post(request, { ...env, SAM_DECODER_ENABLED: undefined, ASSETS: { fetch: assets } as unknown as Fetcher })).status).toBe(503)
  expect(fetch).not.toHaveBeenCalled(); expect(assets).not.toHaveBeenCalled()
  expect(await (await app.request('/api/decoder/config', {}, {})).json()).toEqual({ enabled: false, demo: 'authored_regions_not_sam' })
})
it('blocks fictional images with no analysis permission before assets, budget or provider calls', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  expect((await post(request, env)).status).toBe(403)
  expect(fetch).not.toHaveBeenCalled()
})
it.each([{ ...request, consent: false }, { ...request, imageUrl: 'http://169.254.169.254' }, { ...request, detailId: '<script>' }])('rejects unsafe Decoder inputs', async body => { expect((await post(body, env)).status).toBe(400) })
it('rejects malformed/oversized input and unknown/stale catalog selections', async () => {
  expect((await app.request('/api/decoder', { method: 'POST', body: '{' }, {})).status).toBe(400)
  expect((await post({ ...request, extra: 'a'.repeat(2000) }, env)).status).toBe(413)
  expect((await post({ ...request, adId: 'unknown' }, env)).status).toBe(404)
  expect((await post({ ...request, assetId: 'stale' }, env)).status).toBe(409)
  expect((await post({ ...request, detailId: 'unknown' }, env)).status).toBe(400)
})

// A tiny test PNG, not a sourced campaign or shipped catalog image.
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), char => char.charCodeAt(0))
async function setup() {
  const ad = catalogItem.parse({ ...catalog[0], image: { ...catalog[0].image, id: 'approved-sam-test-v1', path: '/catalog/sam-test.png', role: 'supplied_image', width: 1, height: 1 },
    licensing: { status: 'cleared', evidence: 'docs/TEST_ONLY.md', rightsHolder: 'Test fixture' }, permissions: { ...catalog[0].permissions, aiAnalysis: { status: 'approved', evidence: 'docs/TEST_ONLY.md' } } })
  const digest = await crypto.subtle.digest('SHA-256', png)
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  const assets = vi.fn().mockImplementation(() => Promise.resolve(new Response(png, { headers: { 'Content-Type': 'image/png' } })))
  const dependencies = { catalog: [ad], permits: { [ad.image.id]: { adId: ad.id, assetId: ad.image.id, path: ad.image.path!, width: 1, height: 1, sha256, analysisEvidence: 'docs/TEST_ONLY.md' } },
    reserve: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
    sam: vi.fn().mockResolvedValue({ adId: ad.id, assetId: ad.image.id, width: 1, height: 1, model: 'sam-3.1', source: 'sam_detection', regions: [{ id: 'sam-0', detailId: request.detailId, box: { x: 0, y: 0, width: 1, height: 1 }, confidence: null, uncertainty: 'model_estimate_not_identity' }] }),
    commentary: vi.fn().mockResolvedValue({ adId: ad.id, assetId: ad.image.id, detailId: request.detailId, text: 'A quieter visual rhythm.', model: 'muse-spark-1.3', source: 'ai_interpretation_not_verified_fact' }),
  }
  return { ad, assets, dependencies, input: { ...request, assetId: ad.image.id }, bindings: { ...env, ASSETS: { fetch: assets } as unknown as Fetcher } }
}
it('runs mocked SAM and grounded commentary with two shared-budget units reserved before either provider', async () => {
  const { input, bindings, dependencies, assets } = await setup()
  const result = await runDecoder(input, { ...bindings, DECODER_COMMENTARY_ENABLED: 'true' }, '192.0.2.1', dependencies)
  expect(result.segmentation.source).toBe('sam_detection'); expect(result.commentary?.text).toContain('quieter')
  expect(dependencies.reserve).toHaveBeenCalledWith(expect.anything(), '192.0.2.1', 2, 'approved-sam-test-v1')
  expect(dependencies.reserve.mock.invocationCallOrder[0]).toBeLessThan(dependencies.sam.mock.invocationCallOrder[0])
  expect(assets.mock.calls[0][0].url).toBe('https://local-assets.invalid/catalog/sam-test.png')
})
it('reserves one call for a SAM-only authorized test; commentary remains off', async () => {
  const { input, bindings, dependencies } = await setup()
  const result = await runDecoder(input, bindings, '192.0.2.1', dependencies)
  expect(dependencies.reserve).toHaveBeenCalledWith(expect.anything(), '192.0.2.1', 1, 'approved-sam-test-v1')
  expect(result.commentary).toBeNull(); expect(dependencies.commentary).not.toHaveBeenCalled()
})
it('fails closed for unavailable or exhausted global budgets', async () => {
  const { input, bindings, dependencies } = await setup()
  dependencies.reserve.mockResolvedValue({ allowed: false, retryAfter: 60 })
  await expect(runDecoder(input, bindings, 'test', dependencies)).rejects.toMatchObject({ code: 'throttled', status: 429 })
  expect(dependencies.sam).not.toHaveBeenCalled()
  dependencies.reserve.mockRejectedValue(new Error('storage down'))
  await expect(runDecoder(input, bindings, 'test', dependencies)).rejects.toMatchObject({ code: 'protection_unavailable' })
})
it('rejects unsupported models, missing exact permits and malformed media before inference', async () => {
  const { input, bindings, dependencies, assets } = await setup()
  await expect(runDecoder(input, { ...bindings, META_SAM_MODEL: 'other-model' }, 'test', dependencies)).rejects.toMatchObject({ code: 'not_configured' })
  await expect(runDecoder(input, bindings, 'test', { ...dependencies, permits: {} })).rejects.toMatchObject({ code: 'asset_not_authorized' })
  expect(assets).not.toHaveBeenCalled()
  assets.mockResolvedValue(new Response('not PNG', { headers: { 'Content-Type': 'image/png' } }))
  await expect(runDecoder(input, bindings, 'test', dependencies)).rejects.toMatchObject({ code: 'invalid_image' })
  expect(dependencies.reserve).not.toHaveBeenCalled(); expect(dependencies.sam).not.toHaveBeenCalled()
})
it('never reads external media, even if analysis metadata is approved', async () => {
  const { input, bindings, dependencies, assets } = await setup()
  const external = { ...dependencies.catalog[0], image: { ...dependencies.catalog[0].image, externalUrl: 'https://unapproved.example.test/image.png', path: null } }
  await expect(runDecoder(input, bindings, 'test', { ...dependencies, catalog: [external] })).rejects.toMatchObject({ code: 'analysis_not_permitted' })
  expect(assets).not.toHaveBeenCalled(); expect(dependencies.reserve).not.toHaveBeenCalled()
})
it('sanitizes provider failures and aborts timed-out mock SAM calls without retry', async () => {
  const fixture = await setup()
  fixture.dependencies.sam.mockRejectedValue(new Error('secret provider response'))
  await expect(runDecoder(fixture.input, fixture.bindings, 'test', fixture.dependencies)).rejects.toMatchObject({ code: 'provider_failure', status: 502 })
  expect(fixture.dependencies.sam).toHaveBeenCalledTimes(1)
  vi.useFakeTimers()
  fixture.dependencies.sam.mockImplementation((_input, _key, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
  const result = expect(runDecoder(fixture.input, fixture.bindings, 'test', fixture.dependencies)).rejects.toMatchObject({ code: 'timeout', status: 504 })
  await vi.advanceTimersByTimeAsync(11000); await result
})
it('binds and bounds official parser output without guessing identity or confidence', () => {
  const base: ImageSegmentationResult = { media: 'image', outcome: { status: 'completed' }, revision: 1, diagnostics: [], rawOutput: '', records: [] }
  expect(normalizeSamResult(base, catalog[0], request.detailId).regions).toEqual([])
  const withBox = { ...base, records: [{ kind: 'box' as const, order: 0, objectId: '3', left: 10, top: 20, right: 110, bottom: 120 }] }
  expect(normalizeSamResult(withBox, catalog[0], request.detailId).regions[0].confidence).toBeNull()
  expect(() => normalizeSamResult({ ...withBox, rawOutput: ';w=20;h=20' }, catalog[0], request.detailId)).toThrow()
  expect(() => normalizeSamResult({ ...base, outcome: { status: 'incomplete', reason: 'eof' } }, catalog[0], request.detailId)).toThrow()
})
it('uses the fixed Meta SAM endpoint and official parser; zero matches is valid', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('data: {"type":"response.completed"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetch)
  const input = { ad: catalog[0], detailId: request.detailId, concept: 'Paper shade', imageDataUrl: 'data:image/png;base64,aGVsbG8=' }
  const result = await segmentWithMeta(input, 'FAKE_TEST_KEY', new AbortController().signal)
  expect(result.regions).toEqual([])
  expect(fetch.mock.calls[0][0]).toBe('https://api.meta.ai/v1/responses')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: 'sam-3.1', stream: true })
})
it.each([302, 401, 429, 500])('rejects Meta SAM status %s without following redirects or retrying', async status => {
  const fetch = vi.fn().mockResolvedValue(new Response('secret', { status })); vi.stubGlobal('fetch', fetch)
  await expect(segmentWithMeta({ ad: catalog[0], detailId: request.detailId, concept: 'shade', imageDataUrl: 'data:image/png;base64,aGVsbG8=' }, 'fake', new AbortController().signal)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].redirect).toBe('manual')
})
it('grounds commentary in approved text fields without image bytes, URLs or inferred product identity', async () => {
  const input = { ad: catalog[0], detailId: request.detailId, concept: 'shade', imageDataUrl: 'data:image/png;base64,SECRET' }
  const context = commentaryContext(input)
  expect(JSON.stringify(context)).not.toContain('SECRET'); expect(JSON.stringify(context)).not.toContain('http')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ adId: 'invented-ad', assetId: request.assetId, detailId: request.detailId, text: 'Unbound.', model: 'muse-spark-1.3', source: 'ai_interpretation_not_verified_fact' }) } }] })))
  await expect(regionCommentary(input, 'fake', new AbortController().signal)).rejects.toThrow('Unbound')
})

it('requires a private operator credential before any live Decoder preflight', async () => {
  expect((await post(request, { ...env, SAM_OPERATOR_TOKEN: undefined })).status).toBe(503)
  const response = await app.request('/api/decoder', { method: 'POST', headers: { Origin: 'https://curio.test', 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' }, body: JSON.stringify(request) }, env)
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ status: 'operator_required' })
})

it.each([
  ['data: not-json\n\n', 'text/event-stream'],
  ['data: {"type":"response.output_text.delta","item_id":"i","output_index":0,"content_index":0,"delta":"incomplete"}\n\n', 'text/event-stream'],
  ['data: {"type":"response.output_text.done","item_id":"i","output_index":0,"content_index":0,"text":"<0f>0<|box;x1=0;y1=0;x2=0;y2=0;w=1;h=1|><|mask;x=0;y=0;data=99999,99999,!abc|>"}\n\n', 'text/event-stream'],
  ['<html>not an event stream</html>', 'text/html'],
])('rejects malformed, truncated or unbounded SAM streams', async (body, contentType) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': contentType } })))
  await expect(segmentWithMeta({ ad: catalog[0], detailId: request.detailId, concept: 'shade', imageDataUrl: 'data:image/png;base64,aGVsbG8=' }, 'fake', new AbortController().signal)).rejects.toThrow()
})
