// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { D1Catalog, candidateIds } from '../worker/catalog-store'
import { importManifest, intelligenceRecord, regionRecord } from '../worker/catalog-contracts'
import { categories, lifestyles } from '../shared/catalog'

// These tests start real workerd/D1 processes, rather than an in-memory mock.
vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 })

let mf: Miniflare, store: D1Catalog, db: D1Database
const seed = JSON.parse(readFileSync('seeds/issue-5-candidates.json', 'utf8'))
const first = { schemaVersion: 1, sources: seed.sources, candidates: seed.candidates.slice(0, 5) }
beforeEach(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-10-26', d1Databases: ['CATALOG_DB'], telemetry: { enabled: false }, outboundService: () => { throw new Error('No network in catalog tests') } }))
  db = await mf.getD1Database('CATALOG_DB') as unknown as D1Database
  // The migration executes through the actual local D1 SQL binding.
  await db.exec(readFileSync('migrations/0001_catalog.sql', 'utf8').replace(/^--.*$/gm, '').replace(/\s+/g, ' '))
  store = new D1Catalog(db)
})
afterEach(async () => { await mf?.dispose() })
const ids = () => candidateIds(seed.candidates[0].imageUrl, seed.candidates[0].versionKey)
const review = (purpose = 'display', status = 'approved', expectedRevision = 0) => ({ purpose, status, evidence: 'docs/TEST_RIGHTS.md', rightsHolder: 'Test fixture only', reviewer: 'test operator — fixture evidence only', expectedRevision })
const intelligence = (versionId: string, origin: 'mock' | 'meta' = 'mock') => ({ kind: 'intelligence', record: { id: `intelligence-${origin}`, versionId, model: 'muse-spark-1.3', origin,
  output: { categoryScores: Object.fromEntries(categories.map(c => [c, 1])), aestheticScores: Object.fromEntries(lifestyles.map(a => [a, 1])), tags: ['test'], objects: ['authored test label'], mood: 'test', composition: 'test', editorialThemes: ['test'] } } })
it('imports exact owner URLs, preserves all pending rights and deduplicates repeated manifests', async () => {
  await store.ingest(first, 'test')
  await store.ingest(first, 'test')
  await store.ingest({ schemaVersion: 1, sources: [], candidates: seed.candidates.slice(5) }, 'test')
  const status = await store.status()
  expect(status.counts).toEqual({ candidates: 10, active_candidates: 10, display_approved: 0 })
  expect(status.coverage).toHaveLength(24)
  expect(status.libraryLimit).toBeNull()
  const { assetId } = await ids(), asset = await store.get(assetId)
  expect(asset?.image_url).toBe(seed.candidates[0].imageUrl)
  expect(asset?.versions).toHaveLength(1)
  expect(asset?.permissions).toHaveLength(3)
  expect(asset?.permissions.every(p => p.status === 'pending')).toBe(true)
})
it('rolls back entire batch on immutable version conflict or unknown source', async () => {
  await store.ingest(first, 'test')
  await expect(store.ingest({ ...first, candidates: [{ ...seed.candidates[0], alt: 'Changed metadata requires new version' }, ...seed.candidates.slice(5, 6)] }, 'test')).rejects.toThrow(/conflicts/)
  expect((await store.status()).counts?.candidates).toBe(5)
  await expect(store.ingest({ schemaVersion: 1, sources: [], candidates: [{ ...seed.candidates[5], sourceId: 'unknown' }] }, 'test')).rejects.toThrow()
  expect((await db.prepare('SELECT COUNT(*) AS n FROM catalog_imports').first())?.n).toBe(1)
})
it('keeps version grants separate, requires evidence and rejects stale concurrent reviews', async () => {
  await store.ingest(first, 'test'); const { versionId } = await ids()
  await expect(store.review(versionId, { ...review(), evidence: null })).rejects.toThrow()
  const results = await Promise.allSettled([store.review(versionId, review()), store.review(versionId, review())])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect((await store.query({ limit: 20, includeArchived: false, permission: 'ai_analysis' })).items).toHaveLength(0)
  await store.ingest({ schemaVersion: 1, sources: [], candidates: [{ ...seed.candidates[0], versionKey: 'v2', alt: 'New reviewed metadata' }] }, 'test')
  expect((await store.query({ limit: 20, includeArchived: false, permission: 'display' })).items).toHaveLength(0)
  await store.review(versionId, review('display', 'blocked', 1))
  expect((await db.prepare('SELECT COUNT(*) AS n FROM permission_history').first())?.n).toBe(2)
})
it('paginates without a library cap and archives/reinstates without deleting provenance', async () => {
  await store.ingest(first, 'test')
  const page = await store.query({ limit: 2, includeArchived: false })
  const second = await store.query({ limit: 2, includeArchived: false, cursor: String(page.nextCursor) })
  expect(page.items.map(i => i.id).some(id => second.items.some(i => i.id === id))).toBe(false)
  const { assetId } = await ids(); await store.archive(assetId, true)
  expect((await store.query({ limit: 20, includeArchived: false })).items).toHaveLength(4)
  expect((await store.get(assetId))?.versions).toHaveLength(1)
  await store.archive(assetId, false)
  expect((await store.query({ limit: 20, includeArchived: false })).items).toHaveLength(5)
})
it('separates mock interpretations, actual Meta metadata and verified citations', async () => {
  await store.ingest(first, 'test'); const { versionId, assetId } = await ids()
  await store.annotate(intelligence(versionId))
  await expect(store.annotate(intelligence(versionId, 'meta'))).rejects.toThrow(/unapproved/)
  expect((await store.query({ limit: 20, includeArchived: false, category: 'home' })).items).toHaveLength(0)
  await store.review(versionId, review('ai_analysis'))
  await store.annotate(intelligence(versionId, 'meta')) // fixture only, no model call
  expect((await store.query({ limit: 20, includeArchived: false, category: 'home', aesthetic: lifestyles[0] })).items).toHaveLength(1)
  await store.annotate({ kind: 'fact', record: { id: 'test-fact', sourceId: seed.sources[0].id, versionId, statement: 'A test fixture fact, not a claim about this brand.', citationUrl: 'https://example.com/source', publisher: 'Test', retrievedAt: '2026-10-27T12:00:00Z', verifiedBy: 'test operator', verifiedAt: '2026-10-27T12:00:00Z' } })
  expect((await store.get(assetId))?.facts).toHaveLength(1)
  expect((await store.status()).coverage.every(c => c.indexed === 1 && c.approved === 0)).toBe(true)
})
it('validates exact source geometry and keeps authored regions distinct from SAM', async () => {
  await store.ingest({ ...first, candidates: [{ ...seed.candidates[0], width: 1200, height: 900 }] }, 'test')
  const { versionId } = await ids()
  const record = { id: 'regions-test', versionId, origin: 'authored_demo', model: null, width: 1200, height: 900, regions: [{ id: 'detail', label: 'Authored', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, confidence: null }] }
  await expect(store.annotate({ kind: 'regions', record: { ...record, width: 100 } })).rejects.toThrow()
  await store.annotate({ kind: 'regions', record })
  await expect(store.annotate({ kind: 'regions', record: { ...record, id: 'sam-test', origin: 'sam_detection', model: 'sam-3.1' } })).rejects.toThrow()
  expect(regionRecord.safeParse({ ...record, model: 'other' }).success).toBe(false)
  expect(regionRecord.safeParse({ ...record, regions: [{ ...record.regions[0], confidence: 0.9 }] }).success).toBe(false)
  expect(regionRecord.safeParse({ ...record, regions: [{ ...record.regions[0], box: { x: 0.9, y: 0, width: 0.2, height: 0.2 } }] }).success).toBe(false)
})
it('rejects arbitrary fields, unsafe image URLs, excessive batches and non-Meta metadata', () => {
  for (const imageUrl of ['http://example.com/a.png', 'https://127.0.0.1/a', 'https://user:secret@example.com/a', 'https://example.com/a#b']) expect(importManifest.safeParse({ ...first, candidates: [{ ...seed.candidates[0], imageUrl }] }).success).toBe(false)
  expect(importManifest.safeParse({ ...first, candidates: Array(6).fill(seed.candidates[0]) }).success).toBe(false)
  expect(importManifest.safeParse({ ...first, candidates: [{ ...seed.candidates[0], permissions: { display: 'approved' } }] }).success).toBe(false)
  const r = intelligence('version-' + 'a'.repeat(64)).record
  expect(intelligenceRecord.safeParse({ ...r, model: 'gpt-anything' }).success).toBe(false)
  expect(intelligenceRecord.safeParse({ ...r, output: { ...r.output, javascript: 'alert(1)' } }).success).toBe(false)
  expect(intelligenceRecord.safeParse({ ...r, output: { ...r.output, categoryScores: { home: 1 } } }).success).toBe(false)
})
it('stores and paginates 125 synthetic test candidates without a 24-image cap', async () => {
  await store.ingest({ schemaVersion: 1, sources: [seed.sources[0]], candidates: [] }, 'test')
  for (let start = 0; start < 125; start += 5) await store.ingest({ schemaVersion: 1, sources: [], candidates: Array.from({ length: 5 }, (_, i) => ({ ...seed.candidates[0], imageUrl: `https://example.com/test-only/${start + i}.png` })) }, 'test')
  const seen = new Set<unknown>(); let cursor: string | undefined
  do {
    const page = await store.query({ limit: 50, includeArchived: false, cursor })
    for (const item of page.items) seen.add(item.id)
    cursor = page.nextCursor ? String(page.nextCursor) : undefined
  } while (cursor)
  expect(seen.size).toBe(125)
}, 40000)
