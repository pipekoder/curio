// @vitest-environment node
import { expect, it } from 'vitest'
import { catalogApi } from '../worker/catalog-api'
const token = 'test-only-private-token-more-than-32-characters'
const env = { CATALOG_OPERATOR_ENABLED: 'true', CATALOG_OPERATOR_TOKEN: token, PUBLIC_APP_ORIGIN: 'https://curio.test', CATALOG_DB: {} as D1Database }
const headers = { Authorization: `Bearer ${token}`, Origin: 'https://curio.test', 'CF-Connecting-IP': '192.0.2.1' }
it.each([
  { Authorization: '' }, { Authorization: 'Bearer incorrect' }, { Authorization: 'x'.repeat(513) },
  { Origin: '' }, { Origin: 'https://evil.example' },
  { 'CF-Connecting-IP': '' }, { 'CF-Connecting-IP': 'x'.repeat(65) },
])('rejects invalid operator credentials/origin/trusted address before D1 access: %j', async extra => {
  const response = await catalogApi.request('https://curio.test/status', { headers: { ...headers, ...extra } }, env)
  expect(response.status).toBe(403)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
it.each([{ CATALOG_OPERATOR_ENABLED: 'false' }, { CATALOG_OPERATOR_TOKEN: 'short' }, { CATALOG_DB: undefined }])('fails closed for unavailable private catalog: %j', async extra => {
  expect((await catalogApi.request('https://curio.test/status', { headers }, { ...env, ...extra })).status).toBe(503)
})
