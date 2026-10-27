import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions, Response as MiniflareResponse } from 'miniflare'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Exercise the production bundle and real SQLite DO, while intercepting EVERY
// outbound request. This cannot reach Meta or any other external network.
const state = await mkdtemp(join(tmpdir(), 'curio-budget-'))
let calls = 0
const options = {
  name: 'curio-test', modules: true, telemetry: { enabled: false }, scriptPath: '.wrangler/dry-run/index.js', compatibilityDate: '2026-10-26',
  durableObjects: { INFERENCE_BUDGET: { className: 'InferenceBudget', useSQLite: true } },
  resourcePersistencePath: state,
  bindings: { MAGAZINE_AI_ENABLED: 'true', META_SPARK_MODEL: 'muse-spark-1.3', META_API_KEY: 'FAKE_TEST_KEY', PUBLIC_APP_ORIGIN: 'https://curio.test', RATE_LIMIT_SALT: 'test-only-high-entropy-salt-placeholder-32', MAGAZINE_MAX_CALLS: '2' },
  outboundService: async request => {
    assert.equal(request.url, 'https://api.meta.ai/v1/chat/completions')
    const body = await request.json()
    assert.equal(body.model, 'muse-spark-1.3')
    assert.equal(body.max_completion_tokens, 1800)
    calls++
    return MiniflareResponse.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: 'Mock edition — not real AI', layoutIntent: 'immersive', sections: [{ category: 'home', catalogId: 'home-lamp', assetId: 'asset-home-lamp-v1', commentary: 'A soft visual rhythm.' }] }) } }] })
  },
}
let mf = new Miniflare(convertV4MiniflareOptions(options))
const post = ip => mf.dispatchFetch('https://curio.test/api/magazine', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://curio.test', 'CF-Connecting-IP': ip },
  body: JSON.stringify({ interests: '', lifestyles: ['Scandinavian'], allocations: { home: 100, fashion: 0, travel: 0 }, consent: true }),
})
try {
  assert.equal((await mf.dispatchFetch('https://curio.test/api/image?url=http://169.254.169.254/')).status, 404)
  assert.equal((await mf.dispatchFetch('https://curio.test/api/catalog/pending')).status, 404)
  assert.equal(calls, 0, 'no image proxy, pending registry or external fetch')
  const responses = await Promise.all(Array.from({ length: 6 }, () => post('192.0.2.1')))
  assert.equal(responses.filter(r => r.status === 200).length, 1, JSON.stringify(await Promise.all(responses.map(async r => ({ status: r.status, body: await r.clone().text() })))))
  assert.equal(responses.filter(r => r.status === 429).length, 5)
  const issue = await responses.find(r => r.status === 200).json()
  assert.equal(issue.sections[0].ad.id, 'home-lamp')
  assert.equal(issue.sections[0].weight, 100)
  assert.equal(issue.layoutIntent, 'immersive')
  assert.equal(issue.sections[0].ad.image.id, 'asset-home-lamp-v1')
  assert.equal(issue.sections[0].ad.licensing.status, 'placeholder_only')
  assert.equal(calls, 1)
  await mf.dispose()
  mf = new Miniflare(convertV4MiniflareOptions(options))
  assert.equal((await post('192.0.2.1')).status, 429, 'cooldown survives runtime restart')
  assert.equal((await post('192.0.2.2')).status, 200)
  assert.equal((await post('192.0.2.3')).status, 429, 'global lifetime ceiling survives restart')
  assert.equal(calls, 2)
  console.log('PASS: production Worker + SQLite DO concurrent throttling, persisted cooldown/lifetime ceiling, validated mock Meta issue; 0 real model calls')
} finally { await mf.dispose(); await rm(state, { recursive: true, force: true }) }
