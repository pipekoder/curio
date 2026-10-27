import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importCatalog } from './catalog-import.mjs'

const state = await mkdtemp(join(tmpdir(), 'curio-catalog-'))
const token = 'FAKE_TEST_OPERATOR_TOKEN_32_CHARACTERS_ONLY', origin = 'https://curio.test'
let outbound = 0
const options = { modules: true, telemetry: { enabled: false }, scriptPath: '.wrangler/dry-run/index.js', compatibilityDate: '2026-10-26',
  d1Databases: ['CATALOG_DB'], resourcePersistencePath: state,
  bindings: { CATALOG_OPERATOR_ENABLED: 'true', CATALOG_OPERATOR_TOKEN: token, PUBLIC_APP_ORIGIN: origin },
  outboundService: () => { outbound++; throw new Error('Catalog must never use network or model APIs') } }
let mf = new Miniflare(convertV4MiniflareOptions(options))
const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }
const request = (path, method = 'GET', body, extra = {}) => mf.dispatchFetch(`${origin}/api/operator/catalog${path}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
try {
  let db = await mf.getD1Database('CATALOG_DB')
  await db.exec((await readFile('migrations/0001_catalog.sql', 'utf8')).replace(/^--.*$/gm, '').replace(/\s+/g, ' '))
  // Miniflare sets CF-Connecting-IP itself, like the edge. Missing/oversized
  // trusted-address guards are separately exercised in catalog-api.test.ts.
  for (const extra of [{ Authorization: '' }, { Authorization: 'Bearer incorrect' }, { Origin: 'https://evil.example' }]) assert.equal((await request('/status', 'GET', undefined, extra)).status, 403, JSON.stringify(extra))
  assert.equal((await request('/imports', 'POST', {}, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await request('/imports', 'POST', { x: 'x'.repeat(66000) })).status, 413)
  assert.equal((await request('/imports', 'POST', {})).status, 400)
  assert.equal((await mf.dispatchFetch(`${origin}/api/catalog/pending`)).status, 404)
  const manifest = JSON.parse(await readFile('seeds/issue-5-candidates.json', 'utf8'))
  const importerOptions = { base: 'http://127.0.0.1:18788', token, origin, send: (url, init) => mf.dispatchFetch(url, init) }
  assert.deepEqual(await importCatalog(manifest, importerOptions), { batches: 3, submitted: 10 })
  await importCatalog(manifest, importerOptions)
  const response = await request('/status')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const status = await response.json()
  assert.deepEqual(status.counts, { candidates: 10, active_candidates: 10, display_approved: 0 })
  assert.equal(status.coverage.length, 24)
  const query = await (await request('/query', 'POST', { limit: 2 })).json()
  assert.equal(query.items.length, 2)
  const asset = await (await request(`/assets/${query.items[0].id}`)).json()
  assert.equal(asset.versions.length, 1)
  assert.equal(asset.permissions.every(p => p.status === 'pending'), true)
  assert.equal(asset.intelligence.length, 0)
  assert.equal((await request('/query', 'POST', { category: "home') OR 1=1 --" })).status, 400)
  assert.equal((await request(`/versions/${asset.versions[0].id}/permissions`, 'PATCH', { purpose: 'display', status: 'approved', evidence: null, rightsHolder: null, reviewer: 'test', expectedRevision: 0 })).status, 400)
  await mf.dispose()
  mf = new Miniflare(convertV4MiniflareOptions(options))
  assert.equal((await (await request('/status')).json()).counts.candidates, 10, 'D1 metadata persists across Worker restart')
  const selection = { adId: 'home-lamp', assetId: 'asset-home-lamp-v1', detailId: 'home-lamp-detail', consent: true }
  const decoder = auth => mf.dispatchFetch(`${origin}/api/decoder`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify(selection) })
  assert.equal((await decoder(token)).status, 503, 'D1 enablement never enables SAM')
  await mf.dispose()
  const samToken = 'FAKE_SAM_OPERATOR_TOKEN_32_CHARACTERS_ONLY'
  mf = new Miniflare(convertV4MiniflareOptions({ ...options, bindings: { ...options.bindings, SAM_DECODER_ENABLED: 'true', SAM_OPERATOR_TOKEN: samToken } }))
  assert.equal((await request('/status')).status, 200, 'D1 remains available alongside the SAM route')
  assert.equal((await request('/status', 'GET', undefined, { Authorization: `Bearer ${samToken}` })).status, 403, 'SAM credential cannot access private D1')
  const wrongCredential = await decoder(token)
  assert.equal(wrongCredential.status, 403)
  assert.equal((await wrongCredential.json()).status, 'operator_required', 'D1 credential cannot authorize SAM')
  const deniedAnalysis = await decoder(samToken)
  assert.equal(deniedAnalysis.status, 403)
  assert.equal((await deniedAnalysis.json()).status, 'analysis_not_permitted', 'SAM credential cannot bypass image rights')
  await mf.dispose()
  mf = new Miniflare(convertV4MiniflareOptions({ ...options, bindings: { ...options.bindings, CATALOG_OPERATOR_ENABLED: 'false' } }))
  assert.equal((await request('/status')).status, 503)
  await assert.rejects(() => importCatalog(manifest, { ...importerOptions, base: 'https://production.example' }), /local/)
  assert.equal(outbound, 0)
  console.log('PASS: production Worker + persistent D1; separate SAM/D1 credentials, default-off and analysis-rights gates; import/dedupe/query/security; 0 external or model calls')
} finally { await mf.dispose(); await rm(state, { recursive: true, force: true }) }
