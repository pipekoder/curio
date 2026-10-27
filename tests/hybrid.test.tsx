import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import CatalogImage from '../src/CatalogImage'
import Attribution from '../src/Attribution'
import { catalog, catalogItem, displaySource, isPublishable, validateCatalog } from '../shared/catalog'
import { isSafeHttpsUrl, approvedExternalAssets } from '../shared/url-policy'
import { magazineIssue } from '../shared/magazine'
import { externalFixture, testExternalApprovals } from './hybrid-fixtures'

afterEach(() => { cleanup(); vi.useRealTimers() })
it.each([
  'http://example.org/a.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'blob:https://example.org/id',
  'https://localhost/a.png', 'https://localhost.example.local/a.png', 'https://127.0.0.1/a.png',
  'https://0x7f000001/a.png', 'https://[::1]/a.png', 'https://169.254.169.254/a.png',
  'https://metadata.google.internal/a.png', 'https://user:pass@example.org/a.png', 'https://example.org:444/a.png',
  'https://example.org/a.png#script', 'https://example.org/a.png\n', 'https://example.org/%0aevil.png',
])('rejects unsafe image URL %s', externalUrl => {
  expect(isSafeHttpsUrl(externalUrl)).toBe(false)
  expect(catalogItem.safeParse({ ...externalFixture, image: { ...externalFixture.image, externalUrl } }).success).toBe(false)
})
it('requires independent exact URL, source page and evidence approval', () => {
  expect(Object.keys(approvedExternalAssets)).toHaveLength(0)
  expect(() => validateCatalog([externalFixture])).toThrow('not been approved')
  expect(validateCatalog([externalFixture], {}, testExternalApprovals)).toHaveLength(1)
  expect(isPublishable(externalFixture)).toBe(false)
  expect(isPublishable(externalFixture, testExternalApprovals)).toBe(true)
  for (const altered of [
    { ...externalFixture, image: { ...externalFixture.image, externalUrl: 'https://cdn.example.test/not-approved.webp' } },
    { ...externalFixture, provenance: { ...externalFixture.provenance, originalSourcePage: 'https://source.example.test/other' } },
    { ...externalFixture, permissions: { ...externalFixture.permissions, display: { status: 'approved' as const, evidence: 'docs/DIFFERENT.md' } } },
  ]) expect(() => validateCatalog([altered], {}, testExternalApprovals)).toThrow()
})
it.each(['pending', 'rejected', 'blocked'] as const)('excludes %s display status even with an approved URL', status => {
  const item = { ...externalFixture, permissions: { ...externalFixture.permissions, display: { status, evidence: null } } }
  expect(isPublishable(item, testExternalApprovals)).toBe(false)
  expect(displaySource(item, testExternalApprovals)).toBeNull()
})
it('keeps display, analysis and edits as separate evidenced permissions', () => {
  expect(isPublishable(externalFixture, testExternalApprovals)).toBe(true)
  expect(externalFixture.permissions.aiAnalysis.status).toBe('pending')
  expect(externalFixture.permissions.edits.status).toBe('pending')
  expect(catalogItem.safeParse({ ...externalFixture, permissions: { ...externalFixture.permissions, aiAnalysis: { status: 'approved', evidence: null } } }).success).toBe(false)
})
it('preserves local demos and restricts external fallbacks to the six original illustrations', () => {
  expect(displaySource(catalog[0])).toBe('/catalog/home-lamp.svg')
  expect(catalogItem.safeParse({ ...externalFixture, image: { ...externalFixture.image, fallbackPath: '/catalog/unapproved-photo.jpg' } }).success).toBe(false)
})
it('renders approved cross-origin images without requiring CORS or leaking a referrer', () => {
  const { container } = render(<CatalogImage ad={externalFixture} externalApprovals={testExternalApprovals} />)
  const image = container.querySelector('img')!
  expect(image.getAttribute('src')).toBe(externalFixture.image.externalUrl)
  expect(image.getAttribute('referrerpolicy')).toBe('no-referrer')
  expect(image.hasAttribute('crossorigin')).toBe(false)
})
it('falls back once, labels the fictional illustration, and retains the original source-page link', () => {
  render(<><CatalogImage ad={externalFixture} externalApprovals={testExternalApprovals} /><Attribution ad={externalFixture} externalApprovals={testExternalApprovals} /></>)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img').getAttribute('src')).toBe('/catalog/home-lamp.svg')
  expect(screen.getByText(/Fictional fallback illustration · Curio/)).toBeTruthy()
  const source = screen.getByRole('link', { name: /View original source page/ })
  expect(source.getAttribute('href')).toBe(externalFixture.provenance.originalSourcePage)
  expect(source.getAttribute('rel')).toContain('noreferrer')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Image unavailable')).toBeTruthy()
  expect(source.isConnected).toBe(true)
})
it('times out a hanging external image without fetching a proxy', () => {
  vi.useFakeTimers()
  render(<CatalogImage ad={externalFixture} externalApprovals={testExternalApprovals} />)
  act(() => { vi.advanceTimersByTime(10000) })
  expect(screen.getByRole('img').getAttribute('src')).toBe('/catalog/home-lamp.svg')
})
it('never renders an unapproved external URL or source link', () => {
  const { container } = render(<><CatalogImage ad={externalFixture} /><Attribution ad={externalFixture} /></>)
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
})
it('escapes HTML-like catalog text and rejects active URL protocols', () => {
  const malicious = { ...catalog[0], advertiser: { name: '<img src=x onerror=alert(1)>', verification: 'unverified' as const, evidence: null }, campaign: { title: '<script>alert(1)</script>', reference: null } }
  const { container } = render(<Attribution ad={malicious} />)
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(container.querySelector('script, img, iframe')).toBeNull()
})
it('rejects unapproved external records in API issue validation', () => {
  expect(magazineIssue.safeParse({ id: '00000000-0000-4000-8000-000000000003', title: 'Unapproved', model: 'muse-spark-1.3', source: 'meta_generated_commentary', layoutIntent: 'airy', sections: [{ category: 'home', weight: 100, ad: externalFixture, commentary: 'Quiet shapes.', commentarySource: 'ai_interpretation_not_verified_fact' }] }).success).toBe(false)
})
