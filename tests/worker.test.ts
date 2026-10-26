// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import app from '../worker/index'

const preferences = {
  interests: 'Quiet spaces', lifestyles: ['Scandinavian'],
  allocations: { home: 40, fashion: 30, travel: 30 },
}
const post = (body: unknown) => app.request('/api/magazine', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

describe('Worker API', () => {
  it('reports health without credentials', async () => {
    const response = await app.request('/api/health', {}, {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, app: 'curio', metaConfigured: false })
  })
  it('returns an honest 501 without invoking any inference provider', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'))
    try {
      const response = await post(preferences)
      expect(response.status).toBe(501)
      expect(await response.json()).toMatchObject({ status: 'not_configured' })
      expect(fetch).not.toHaveBeenCalled()
    } finally { fetch.mockRestore() }
  })
  it.each([
    { ...preferences, lifestyles: [] },
    { ...preferences, lifestyles: [''] },
    { ...preferences, interests: 'x'.repeat(1001) },
    { ...preferences, allocations: { home: 40, fashion: 30, travel: 35 } },
    { ...preferences, allocations: { home: -1, fashion: 51, travel: 50 } },
    { ...preferences, allocations: { home: 40.5, fashion: 29.5, travel: 30 } },
  ])('rejects invalid preferences', async body => {
    expect((await post(body)).status).toBe(400)
  })
  it('rejects malformed JSON', async () => {
    const response = await app.request('/api/magazine', { method: 'POST', body: '{' })
    expect(response.status).toBe(400)
  })
  it('keeps unknown API routes JSON 404s', async () => {
    const response = await app.request('/api/missing')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })
})
