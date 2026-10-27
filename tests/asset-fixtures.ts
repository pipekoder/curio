import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import type { DiscoveryItem } from '../worker/asset-contracts'
export async function assetDatabase() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-10-26', d1Databases: ['CATALOG_DB'], telemetry: { enabled: false }, outboundService: () => { throw new Error('No external network in asset tests') } }))
  const db = await mf.getD1Database('CATALOG_DB') as unknown as D1Database
  for (const name of ['0001_catalog.sql','0002_asset_intelligence.sql']) await db.exec(readFileSync(`migrations/${name}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
  return { db, mf }
}
export const fixtureSource = (id='fixture-brand-a') => ({ id, name: 'Explicit fictional test source', entryUrl: `https://normcph.com/fixture/${id}/`, kind: 'gallery' as const, issueUrl: 'https://github.com/pipekoder/curio/issues/5' })
export const fixtureItem = (index=0, sourceId='fixture-brand-a'): DiscoveryItem => ({
  candidate: { sourceId, imageUrl: `https://normcph.com/fixture/image-${index}.jpg`, versionKey: 'fixture-v1', sourcePage: fixtureSource(sourceId).entryUrl, retrievedAt: '2026-10-27T15:00:00Z', sha256: null, width: null, height: null, alt: null, attribution: null, sourceType: 'brand_candidate', provenance: { discoveredFrom: fixtureSource(sourceId).entryUrl, notes: 'Test-only fictional metadata, not a real asset.' } },
  publisher: { name: 'Test publisher', campaign: 'Test fixture', description: null, alt: null, sourcePage: fixtureSource(sourceId).entryUrl, hints: { categories: ['home'], aesthetics: ['Scandinavian'], tags: ['wood'] } },
  access: { status: 'unverified', transport: 'owner_metadata', httpStatus: null, contentType: null },
})
