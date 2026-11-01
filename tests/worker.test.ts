// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import app, { type Bindings } from '../worker/index'
import { catalog, normalizeIssue, type MagazineRequest } from '../shared/magazine'
import { generateMagazine } from '../worker/meta'

export const preferences: MagazineRequest = { interests: 'Quiet spaces', lifestyles: ['Scandinavian'], allocations: { home: 40, fashion: 30, travel: 30 }, consent: true }
const draft = () => ({ title: 'A quieter day', sections: ['home', 'fashion', 'travel'].map(category => ({ category, catalogId: catalog.find(item => item.category === category)!.id, assetId: catalog.find(item => item.category === category)!.image.id, commentary: 'A gentle visual rhythm.' })) })
const envelope = (content = draft(), finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(content) } }] })
const reserve = vi.fn()
const env: Bindings = { LEGACY_MAGAZINE_AI_ENABLED: 'true', META_API_KEY: 'test-server-key', META_SPARK_MODEL: 'muse-spark-1.3', PUBLIC_APP_ORIGIN: 'https://curio.test', RATE_LIMIT_SALT: 'test-only-high-entropy-salt-placeholder-32',
  INFERENCE_BUDGET: { idFromName: vi.fn(), get: () => ({ fetch: reserve }) } as unknown as DurableObjectNamespace }
const post = (body: unknown = preferences, bindings: Bindings = {}, headers: Record<string, string> = {}) => app.request('/api/magazine', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://curio.test', 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(body) }, bindings)
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); reserve.mockReset() })

describe('protected magazine API', () => {
  it('reports non-billable health/config', async () => {
    expect(await (await app.request('/api/health', {}, {})).json()).toEqual({ ok: true, app: 'curio', metaConfigured: false })
    expect(await (await app.request('/api/magazine/config', {}, {})).json()).toEqual({ enabled: false, catalogSize: 6 })
  })
  it('never calls Meta when disabled even with credentials', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post(preferences, { ...env, LEGACY_MAGAZINE_AI_ENABLED: 'false' })).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled()
  })
  it('keeps the obsolete route disabled when editorial AI is enabled', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post(preferences, { ...env, LEGACY_MAGAZINE_AI_ENABLED: undefined, MAGAZINE_AI_ENABLED: 'true', EDITORIAL_PUBLIC_AI_ENABLED: 'true' })).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled()
  })
  it.each(['META_API_KEY', 'META_SPARK_MODEL', 'PUBLIC_APP_ORIGIN', 'RATE_LIMIT_SALT', 'INFERENCE_BUDGET'] as const)('fails closed without %s', async key => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post(preferences, { ...env, [key]: undefined })).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['0', '101', 'not-a-number'])('fails closed for invalid ceiling %s', async value => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post(preferences, { ...env, MAGAZINE_MAX_CALLS: value })).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('blocks every other model including Contributor', async () => {
    expect((await post(preferences, { ...env, META_SPARK_MODEL: 'muse-spark-1.3-contributor' })).status).toBe(503)
  })
  it.each([
    { ...preferences, consent: false }, { ...preferences, lifestyles: [] }, { ...preferences, lifestyles: [''] },
    { ...preferences, interests: 'x'.repeat(1001) }, { ...preferences, allocations: { home: 40, fashion: 30, travel: 35 } },
    { ...preferences, allocations: { home: -1, fashion: 51, travel: 50 } },
    { ...preferences, allocations: { home: 40.5, fashion: 29.5, travel: 30 } },
  ])('rejects invalid request before reserving', async body => { expect((await post(body, env)).status).toBe(400); expect(reserve).not.toHaveBeenCalled() })
  it('bounds chunked input without Content-Length', async () => { expect((await post({ interests: 'x'.repeat(5000) }, env)).status).toBe(413) })
  it('rejects malformed JSON', async () => { expect((await app.request('/api/magazine', { method: 'POST', body: '{' }, {})).status).toBe(400) })
  it.each<Record<string, string>>([{ Origin: 'https://evil.test' }, { 'CF-Connecting-IP': '' }, { 'Content-Type': 'text/plain' }])('rejects unsafe origin/address/content type', async headers => { expect((await post(preferences, env, headers)).status).toBe(403); expect(reserve).not.toHaveBeenCalled() })
  it('returns 429 and retry header without inference', async () => {
    reserve.mockResolvedValue(Response.json({ allowed: false, retryAfter: 60 }))
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const response = await post(preferences, env)
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('60'); expect(fetch).not.toHaveBeenCalled()
  })
  it('fails closed if durable storage fails', async () => {
    reserve.mockRejectedValue(new Error('down')); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await post(preferences, env)).status).toBe(503); expect(fetch).not.toHaveBeenCalled()
  })
  it('uses only Meta Standard server-side after a hashed-IP reservation', async () => {
    reserve.mockResolvedValue(Response.json({ allowed: true }))
    const fetch = vi.fn().mockResolvedValue(envelope()); vi.stubGlobal('fetch', fetch)
    const response = await post(preferences, env)
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store')
    const issue = await response.json() as { sections: { weight: number }[] }
    expect(issue.sections.map(section => section.weight)).toEqual([40, 30, 30])
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.meta.ai/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer test-server-key')
    expect(JSON.parse(options.body)).toMatchObject({ model: 'muse-spark-1.3', max_completion_tokens: 1800, response_format: { type: 'json_schema' } })
    expect(reserve.mock.calls[0][1].body).not.toContain('192.0.2.1')
    expect(JSON.parse(reserve.mock.calls[0][1].body).ip).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(issue)).not.toContain('test-server-key')
  })
  it('logs operational outcomes without credentials, prompts or IPs', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    reserve.mockResolvedValue(Response.json({ allowed: true }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope()))
    expect((await post(preferences, env)).status).toBe(200)
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: 'magazine_generation', outcome: 'success', durationMs: expect.any(Number) })
    const logged = JSON.stringify(log.mock.calls)
    for (const sensitive of ['test-server-key', 'Quiet spaces', '192.0.2.1']) expect(logged).not.toContain(sensitive)
  })
  it('keeps unknown API routes JSON 404s', async () => { expect((await app.request('/api/missing', {}, {})).status).toBe(404) })
})

describe('Meta response contract', () => {
  it.each([302, 401, 429, 500])('sanitizes upstream %s without retries', async status => {
    const fetch = vi.fn().mockResolvedValue(new Response('SECRET UPSTREAM BODY', { status })); vi.stubGlobal('fetch', fetch)
    await expect(generateMagazine(preferences, 'test', 'muse-spark-1.3')).rejects.toMatchObject({ code: 'upstream_error', status: 502 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    () => new Response('not JSON'), () => envelope(draft(), 'length'), () => Response.json({ choices: [] }),
    () => envelope({ ...draft(), sections: draft().sections.map((section, index) => index === 0 ? { ...section, catalogId: 'invented-brand' } : section) }),
    () => new Response('x'.repeat(33000)),
  ])('rejects malformed, truncated, unknown or oversized output', async makeResponse => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse()))
    await expect(generateMagazine(preferences, 'test', 'muse-spark-1.3')).rejects.toMatchObject({ code: 'invalid_output' })
  })
  it('aborts on timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
    const result = expect(generateMagazine(preferences, 'test', 'muse-spark-1.3')).rejects.toMatchObject({ code: 'timeout', status: 504 })
    await vi.advanceTimersByTimeAsync(15000); await result
  })
  it('rejects network failures without leaking errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('token: secret')))
    await expect(generateMagazine(preferences, 'test', 'muse-spark-1.3')).rejects.not.toThrow('secret')
  })
  it('preserves exact allocation weights and omits zero categories', () => {
    const request = { ...preferences, allocations: { home: 100, fashion: 0, travel: 0 } }
    const issue = normalizeIssue({ title: 'Quiet', sections: [draft().sections[0]] }, request)
    expect(issue.sections).toHaveLength(1); expect(issue.sections[0].weight).toBe(100)
  })
  it.each([
    { title: 'Quiet', sections: [draft().sections[0], draft().sections[0], draft().sections[2]] },
    { title: 'Quiet', sections: draft().sections.map(s => ({ ...s, catalogId: 'home-lamp' })) },
    { ...draft(), title: 'Visit https://evil.test' },
  ])('rejects duplicates, mismatched categories and shopping links', data => { expect(() => normalizeIssue(data, preferences)).toThrow() })
})

// User-supplied URLs never become Worker fetch targets or model attachments.
it('rejects image URLs in generation input and exposes no image proxy or pending registry', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  expect((await post({ ...preferences, imageUrl: 'http://169.254.169.254/latest/meta-data/' }, env)).status).toBe(400)
  expect((await app.request('/api/image?url=https://example.org/asset', {}, env)).status).toBe(404)
  expect((await app.request('/api/catalog/pending', {}, env)).status).toBe(404)
  expect(fetch).not.toHaveBeenCalled()
})
