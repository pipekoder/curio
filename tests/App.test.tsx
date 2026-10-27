import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { catalog, normalizeIssue } from '../shared/magazine'

const setup = (response: () => Promise<Response>, config = { enabled: true, catalogSize: 6 }) => {
  const fetch = vi.fn((url: string, _options?: RequestInit) => url === '/api/magazine/config' ? Promise.resolve(Response.json(config)) : response())
  vi.stubGlobal('fetch', fetch); render(<App />); return fetch
}
const legacy = () => within(document.querySelector('.config') as HTMLElement)
const consent = async () => {
  await userEvent.click(legacy().getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('button', { name: /Generate my magazine/ })).toHaveProperty('disabled', false))
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('requires consent, submits preferences and renders a validated fictional issue', async () => {
  const issue = normalizeIssue({ title: 'Quiet moments', sections: ['home', 'fashion', 'travel'].map(category => ({ category, catalogId: catalog.find(item => item.category === category)!.id, assetId: catalog.find(item => item.category === category)!.image.id, commentary: 'A calm visual rhythm.' })) }, { interests: '', lifestyles: ['Scandinavian'], allocations: { home: 40, fashion: 30, travel: 30 }, consent: true })
  const fetch = setup(async () => Response.json(issue))
  expect(screen.getByRole('button', { name: /Generate my magazine/ })).toHaveProperty('disabled', true)
  await consent()
  await userEvent.type(screen.getByLabelText(/what you're curious about/), 'Quiet rooms')
  await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(await screen.findByRole('heading', { name: 'Quiet moments' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Quiet moments' })).getAllByText('Original illustration · fictional placeholder')).toHaveLength(3)
  const call = fetch.mock.calls.find(([url]) => url === '/api/magazine')!
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({ interests: 'Quiet rooms', consent: true, allocations: { home: 40, fashion: 30, travel: 30 } })
})
it('disables invalid allocations and no lifestyles', async () => {
  setup(async () => Response.json({})); await consent()
  const button = screen.getByRole('button', { name: /Generate my magazine/ })
  fireEvent.change(screen.getByLabelText(/Home & Interior/), { target: { value: '45' } }); expect(button).toHaveProperty('disabled', true)
  fireEvent.change(screen.getByLabelText(/Home & Interior/), { target: { value: '40' } })
  await userEvent.click(legacy().getByRole('button', { name: 'Japanese Wabi-Sabi' })); await userEvent.click(legacy().getByRole('button', { name: 'Scandinavian' }))
  expect(button).toHaveProperty('disabled', true)
})
it.each([
  [503, 'Magazine generation is disabled.'], [504, 'Meta took too long.'], [429, 'Safety limit reached.'], [502, 'Output could not be validated.'],
])('displays API status %s', async (status, message) => {
  setup(async () => Response.json({ message }, { status })); await consent()
  await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(await legacy().findByRole('status')).toHaveProperty('textContent', message)
})
it('handles empty catalogs', async () => { setup(async () => Response.json({}), { enabled: true, catalogSize: 0 }); expect(await legacy().findByRole('status')).toHaveProperty('textContent', expect.stringContaining('empty')) })
it('handles disabled configuration without submitting', async () => { const fetch = setup(async () => Response.json({}), { enabled: false, catalogSize: 6 }); expect(await legacy().findByRole('status')).toHaveProperty('textContent', expect.stringContaining('disabled')); expect(fetch).toHaveBeenCalledTimes(1) })
it('handles network failure and restores the button', async () => {
  setup(async () => { throw new Error('offline') }); await consent(); await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(await legacy().findByRole('status')).toHaveProperty('textContent', expect.stringContaining('API is unavailable'))
  expect(screen.getByRole('button', { name: /Generate my magazine/ })).toHaveProperty('disabled', false)
})
it('shows loading and prevents duplicate clicks', async () => {
  setup(() => new Promise(() => {})); await consent(); await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(screen.getByRole('button', { name: /Creating your edition/ })).toHaveProperty('disabled', true)
})

it('rejects malformed successful output without rendering an issue', async () => {
  setup(async () => Response.json({ title: 'Unvalidated' })); await consent()
  await userEvent.click(screen.getByRole('button', { name: /Generate my magazine/ }))
  expect(await legacy().findByRole('status')).toHaveProperty('textContent', expect.stringContaining('could not be validated'))
  expect(screen.queryByRole('heading', { name: 'Unvalidated' })).toBeNull()
})
