import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LivingAdvertisement from '../src/LivingAdvertisement'
import { catalog } from '../shared/catalog'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
function loadedDemo() {
  const view = render(<LivingAdvertisement ad={catalog[0]} eager />)
  const image = screen.getByRole('img')
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 900 } })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 450 } as DOMRect)
  fireEvent.load(image)
  return view
}
it('labels authored demo regions and reveals grounded details without model calls', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const { container } = loadedDemo()
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Explore Paper shade' }))
    expect(screen.getByRole('region', { name: 'Paper shade editorial reveal' })).toBeTruthy()
    expect(container.querySelector('.region-dimming')).toBeTruthy()
    expect(screen.getByText(/not a measured mask/)).toBeTruthy()
    expect(screen.getByText(/No real advertiser/)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})
it('changes selection, supports Escape and returns focus to the hotspot', async () => {
  loadedDemo()
  const stand = screen.getByRole('button', { name: 'Explore Lamp stand' })
  await userEvent.click(stand)
  expect(stand.getAttribute('aria-expanded')).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: /Why does this composition/ }))
  expect(screen.getByText(/Authored interpretation:/)).toBeTruthy()
  await userEvent.keyboard('{Escape}')
  expect(stand.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(stand)
  expect(screen.queryByRole('region', { name: /editorial reveal/ })).toBeNull()
})
it('offers a catalog-bound related discovery and leaves the original image available', async () => {
  loadedDemo()
  await userEvent.click(screen.getByRole('button', { name: 'Explore Paper shade' }))
  await userEvent.click(screen.getByRole('button', { name: 'Explore a related discovery' }))
  expect(screen.getByRole('complementary', { name: 'Related catalog discovery' }).textContent).toContain('Pebble Chair')
  expect(screen.getByRole('img').getAttribute('src')).toBe('/catalog/home-lamp.svg')
})
it('withholds hotspots for failed images or mismatched raster dimensions', () => {
  const { container } = loadedDemo()
  fireEvent.error(screen.getByRole('img'))
  expect(container.querySelector('.living-overlay')).toBeNull()
  expect(screen.getByText('Image unavailable')).toBeTruthy()
})
it('renders only permission-bound SAM result regions, while authored commentary stays separately labeled', async () => {
  const { catalogItem } = await import('../shared/catalog')
  const { normalizeSamResult } = await import('../worker/sam-client')
  const ad = catalogItem.parse({ ...catalog[0], image: { ...catalog[0].image, id: 'test-sam-render-v1', path: '/catalog/test-render.png', role: 'supplied_image' }, licensing: { status: 'cleared', evidence: 'docs/TEST_ONLY.md', rightsHolder: 'Test fixture creator' }, permissions: { ...catalog[0].permissions, aiAnalysis: { status: 'approved', evidence: 'docs/TEST_ONLY.md' } } })
  const result = normalizeSamResult({ media: 'image', outcome: { status: 'completed' }, revision: 1, diagnostics: [], rawOutput: '', records: [{ kind: 'box', order: 0, objectId: '2', left: 560, top: 170, right: 960, bottom: 490 }] }, ad, 'home-lamp-detail')
  const { readerSegmentation } = await import('../shared/decoder')
  expect(readerSegmentation(ad, { ...result, assetId: 'stale' })).toBeNull()
  expect(readerSegmentation({ ...ad, permissions: { ...ad.permissions, aiAnalysis: { status: 'blocked', evidence: null } } }, result)).toBeNull()
  const view = render(<LivingAdvertisement ad={ad} eager samResult={result} />)
  const image = screen.getByRole('img')
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 900 } })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 600, height: 450 } as DOMRect)
  fireEvent.load(image)
  await userEvent.click(screen.getByRole('button', { name: 'Explore Paper shade' }))
  expect(screen.getByText(/SAM 3.1 structured regions/)).toBeTruthy()
  expect(screen.getByText('LOOK CLOSER / MODEL ESTIMATE')).toBeTruthy()
  expect(screen.queryByText(/mock segmentation/)).toBeNull()
  await userEvent.click(screen.getByText('How this detail was annotated'))
  expect(screen.getByText(/model-estimated bounding box/)).toBeTruthy()
  view.rerender(<LivingAdvertisement ad={{ ...ad, permissions: { ...ad.permissions, aiAnalysis: { status: 'blocked', evidence: null } } }} eager samResult={result} />)
  expect(screen.queryByRole('region', { name: 'Paper shade editorial reveal' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Explore Paper shade' })).toBeNull()
  view.rerender(<LivingAdvertisement ad={ad} eager samResult={{ ...result, regions: [] }} />)
  expect(screen.getByText(/No matching regions were returned/)).toBeTruthy()
})
