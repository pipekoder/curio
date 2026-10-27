import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('sends frontend preferences to the Hono API and displays its 501 message', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Generation is not configured.' }), { status: 501 }))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  await userEvent.type(screen.getByLabelText(/what you're curious about/), 'Quiet rooms')
  await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(fetch).toHaveBeenCalledWith('/api/magazine', expect.objectContaining({ method: 'POST' }))
  const body = JSON.parse(fetch.mock.calls[0][1].body)
  expect(body).toEqual({ interests: 'Quiet rooms', lifestyles: ['Japanese Wabi-Sabi', 'Scandinavian'], allocations: { home: 40, fashion: 30, travel: 30 } })
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Generation is not configured.')
})

it('disables generation for an invalid mix or no lifestyles', async () => {
  render(<App />)
  const button = screen.getByRole('button', { name: /Generate my magazine/ })
  fireEvent.change(screen.getByLabelText(/Home & Interior/), { target: { value: '45' } })
  expect(button).toHaveProperty('disabled', true)
  fireEvent.change(screen.getByLabelText(/Home & Interior/), { target: { value: '40' } })
  expect(button).toHaveProperty('disabled', false)
  await userEvent.click(screen.getByRole('button', { name: 'Japanese Wabi-Sabi' }))
  await userEvent.click(screen.getByRole('button', { name: 'Scandinavian' }))
  expect(button).toHaveProperty('disabled', true)
})

it('recovers from an unavailable API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('API is unavailable'))
  expect(screen.getByRole('button', { name: /Generate my magazine/ })).toHaveProperty('disabled', false)
})
