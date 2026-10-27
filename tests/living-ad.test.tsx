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
