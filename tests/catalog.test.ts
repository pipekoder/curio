// @vitest-environment node
import { expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { catalog, catalogItem, validateCatalog, isPublishable, lifestyles, CATALOG_CAPACITY } from '../shared/catalog'
import { normalizeIssue } from '../shared/magazine'

it('provides six safe local slots, two per category, covering eight lifestyles', () => {
  expect(catalog).toHaveLength(6)
  for (const category of ['home', 'fashion', 'travel']) expect(catalog.filter(ad => ad.category === category)).toHaveLength(2)
  expect(new Set(catalog.flatMap(ad => ad.lifestyleTags)).size).toBe(lifestyles.length)
  for (const ad of catalog) {
    expect(isPublishable(ad)).toBe(true)
    expect(existsSync(`public${ad.image.path}`)).toBe(true)
    const svg = readFileSync(`public${ad.image.path}`, 'utf8')
    expect(svg).not.toMatch(/<script|<image|<text|https?:\/\/(?!www.w3.org)/)
    expect(ad.advertiser).toBeNull(); expect(ad.verifiedBrandLink).toBeNull()
    expect(ad.licensing.status).toBe('placeholder_only')
  }
})
it('supports 24 unique ads without changing the reader contract', () => {
  const records = Array.from({ length: CATALOG_CAPACITY }, (_, index) => ({ ...catalog[index % 6], id: `slot-${index}`, image: { ...catalog[index % 6].image, id: `asset-${index}` } }))
  expect(validateCatalog(records)).toHaveLength(24)
  expect(() => validateCatalog([...records, { ...records[0], id: 'slot-25' }])).toThrow()
})
it('rejects duplicate asset IDs and catalog IDs', () => { expect(() => validateCatalog([catalog[0], catalog[0]])).toThrow() })
it('records pending supplied images without publishing them', () => {
  const ad = catalogItem.parse({ ...catalog[0], image: { ...catalog[0].image, role: 'supplied_image', path: null }, licensing: { status: 'pending', evidence: null, rightsHolder: null }, provenance: { ...catalog[0].provenance, origin: 'owner_supplied' } })
  expect(isPublishable(ad)).toBe(false)
})
it('distinguishes editorial support without inventing an advertiser', () => {
  const ad = catalogItem.parse({ ...catalog[0], sourceType: 'editorial_support', image: { ...catalog[0].image, role: 'supplied_image' }, licensing: { status: 'pending', evidence: null, rightsHolder: null } })
  expect(ad.sourceType).toBe('editorial_support'); expect(isPublishable(ad)).toBe(false)
})
it('requires evidence for real advertiser identity and reuse rights', () => {
  expect(catalogItem.safeParse({ ...catalog[0], sourceType: 'licensed_brand' }).success).toBe(false)
  expect(catalogItem.safeParse({ ...catalog[0], licensing: { status: 'cleared', rightsHolder: null, evidence: null } }).success).toBe(false)
  expect(catalogItem.safeParse({ ...catalog[0], provenance: { ...catalog[0].provenance, evidence: '' } }).success).toBe(false)
})
it.each(['https://example.org/checkout', 'https://example.org/cart', 'https://example.org/?tracking=1', 'javascript:alert(1)', 'https://user:pass@example.org/'])('rejects forbidden merchant/source URL %s', url => {
  expect(catalogItem.safeParse({ ...catalog[0], verifiedBrandLink: url }).success).toBe(false)
  expect(catalogItem.safeParse({ ...catalog[0], provenance: { ...catalog[0].provenance, sourceUrl: url } }).success).toBe(false)
})
it('requires a separate human approval for even a verified advertiser homepage', () => {
  // Reserved example domain is a schema fixture, not a real advertiser record.
  const item = { ...catalog[0], sourceType: 'licensed_brand', advertiser: { name: 'Owner-supplied advertiser', verification: 'verified', evidence: 'docs/ASSET_REGISTER.md' }, image: { ...catalog[0].image, role: 'supplied_image' }, licensing: { status: 'cleared', rightsHolder: 'Owner-supplied rights holder', evidence: 'docs/ASSET_REGISTER.md' }, verifiedBrandLink: 'https://example.org/' }
  expect(() => validateCatalog([item])).toThrow('not been approved')
  expect(validateCatalog([item], { [item.id]: 'https://example.org/' })).toHaveLength(1)
})
it.each(['/catalog/../../secret.png', 'https://example.org/ad.png', '/catalog/ad.svg?url=x', '/catalog/%2e%2e.png'])('rejects unsafe image path %s', path => {
  expect(catalogItem.safeParse({ ...catalog[0], image: { ...catalog[0].image, path } }).success).toBe(false)
})
it('rejects stale exact-asset references and unlicensed source records', () => {
  const request = { interests: '', lifestyles: ['Scandinavian'], allocations: { home: 100, fashion: 0, travel: 0 }, consent: true as const }
  const raw = { title: 'A study', layoutIntent: 'airy', sections: [{ category: 'home', catalogId: catalog[0].id, assetId: 'stale-asset', commentary: 'A quiet shape.' }] }
  expect(() => normalizeIssue(raw, request)).toThrow()
  raw.sections[0].assetId = catalog[0].image.id
  expect(() => normalizeIssue(raw, request, [{ ...catalog[0], licensing: { status: 'pending', evidence: null, rightsHolder: null } }])).toThrow()
  expect(() => normalizeIssue({ ...raw, layoutIntent: '<script>' }, request)).toThrow()
  expect(normalizeIssue({ ...raw, layoutIntent: 'immersive' }, request).layoutIntent).toBe('immersive')
})
