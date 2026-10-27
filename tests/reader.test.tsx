import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdvertisingLibrary from '../src/AdvertisingLibrary'
import CatalogImage from '../src/CatalogImage'
import { catalog } from '../shared/catalog'

afterEach(cleanup)
it('filters six image slots without an AI request', async () => {
  render(<AdvertisingLibrary />)
  expect(screen.getAllByRole('img')).toHaveLength(6)
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'fashion')
  expect(screen.getAllByRole('img')).toHaveLength(2)
  await userEvent.selectOptions(screen.getByLabelText('Lifestyle'), 'Nature & Outdoor')
  expect(screen.queryAllByRole('img')).toHaveLength(0)
  expect(screen.getByText(/No catalog images match/)).toBeTruthy()
})
it('offers both deterministic layouts and labels the non-AI preview', async () => {
  render(<AdvertisingLibrary />)
  await userEvent.click(screen.getByRole('button', { name: /Read sample edition/ }))
  const reader = screen.getByRole('region', { name: 'A slower kind of discovery.' })
  expect(reader.classList.contains('layout-airy')).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Immersive / full frame' }))
  expect(reader.classList.contains('layout-immersive')).toBe(true)
  expect(screen.getAllByText('Authored fixture commentary · not AI output')).toHaveLength(3)
  expect(reader.querySelectorAll('figure .attribution')).toHaveLength(0)
  expect(reader.querySelectorAll('.attribution')).toHaveLength(3)
})
it('replaces a broken asset with an accessible fallback and keeps attribution', () => {
  const { container } = render(<CatalogImage ad={catalog[0]} />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Image unavailable')).toBeTruthy()
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('fictional placeholder')
  expect(container.querySelector('img')).toBeNull()
})
it('handles a missing image path and image loading completion', () => {
  const { rerender, container } = render(<CatalogImage key="missing" ad={{ ...catalog[0], image: { ...catalog[0].image, path: null } }} />)
  expect(screen.getByText('Image unavailable')).toBeTruthy()
  rerender(<CatalogImage key="present" ad={catalog[0]} />)
  fireEvent.load(screen.getByRole('img'))
  expect(container.querySelector('.image-ready')).toBeTruthy()
})
