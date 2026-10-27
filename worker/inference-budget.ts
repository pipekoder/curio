import type { Bindings } from './index'

// Shared namespace/name and unchanged ceilings for magazine and Decoder calls.
// Multi-model operations reserve every possible call atomically, never refund.
export async function reserveInference(env: Bindings, ip: string, units: 1 | 2 = 1, samAssetId?: string) {
  if (!env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length < 32 || !env.INFERENCE_BUDGET) throw new Error('Budget unavailable')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RATE_LIMIT_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  const hash = Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('')
  const ceiling = Number(env.MAGAZINE_MAX_CALLS ?? '20')
  if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 100) throw new Error('Invalid ceiling')
  const stub = env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  const response = await stub.fetch('https://budget/reserve', { method: 'POST', body: JSON.stringify({ ip: hash, ceiling, ...(units === 2 ? { units } : {}), ...(samAssetId ? { samAssetId } : {}) }) })
  if (!response.ok) throw new Error('Budget unavailable')
  const result = await response.json() as { allowed?: boolean; retryAfter?: number }
  if (typeof result.allowed !== 'boolean') throw new Error('Invalid budget result')
  return { allowed: result.allowed, retryAfter: result.retryAfter || 60 }
}
