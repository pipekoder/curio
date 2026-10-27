import './acceptance-smoke.mjs'
import './runtime-smoke.mjs'
import './catalog-smoke.mjs'
import './asset-intelligence-smoke.mjs'
import './editorial-smoke.mjs'
import './editorial-validation-smoke.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

// Local workerd only: no deployment, credentials, or inference requests.
const state = await mkdtemp(join(tmpdir(), 'curio-smoke-'))
const port = 18787
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1',
  '--port', String(port), '--inspector-port', '0', '--persist-to', state,
], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', data => { output += data })
child.stderr.on('data', data => { output += data })
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited: ${output}`)
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) { ready = true; break }
    } catch { /* Wait for local runtime startup. */ }
    await delay(250)
  }
  assert.ok(ready, `Local Worker did not start: ${output}`)
  const health = await fetch(`${base}/api/health`)
  assert.deepEqual(await health.json(), { ok: true, app: 'curio', metaConfigured: false })
  const config = await fetch(`${base}/api/magazine/config`)
  assert.deepEqual(await config.json(), { enabled: false, catalogSize: 6 })
  // The production D1 binding is emulated locally with no catalog tables.
  // A binding must never enable operator access or trigger a schema query.
  for (const [path, method] of [['/status', 'GET'], ['/imports', 'POST'], ['/intelligence/stages', 'GET']]) {
    const catalog = await fetch(`${base}/api/operator/catalog${path}`, { method })
    assert.equal(catalog.status, 503)
    assert.equal(catalog.headers.get('Cache-Control'), 'no-store')
    assert.deepEqual(await catalog.json(), { status: 'catalog_unavailable' })
  }
  const home = await fetch(base)
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /id="root"/)
  const script = html.match(/src="([^"]+\.js)"/)[1]
  const asset = await fetch(`${base}${script}`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /javascript/)
  const images = await readdir('public/catalog')
  assert.equal(images.length, 6)
  for (const path of images) {
    const image = await fetch(`${base}/catalog/${path}`)
    assert.equal(image.status, 200)
    assert.match(image.headers.get('content-type'), /image\/svg\+xml/)
    assert.match(await image.text(), /<svg/)
  }
  const deepLink = await fetch(`${base}/edition/example`, { headers: { Accept: 'text/html' } })
  assert.equal(deepLink.status, 200)
  assert.equal(await deepLink.text(), html)
  for (const path of ['/api/missing', '/api']) {
    const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } })
    assert.equal(response.status, 404, `${path} must not fall through to the SPA`)
    assert.deepEqual(await response.json(), { error: 'Not found' })
  }
  const response = await fetch(`${base}/api/magazine`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interests: 'Quiet rooms', lifestyles: ['Scandinavian'], allocations: { home: 40, fashion: 30, travel: 30 }, consent: true }),
  })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).status, 'disabled')
  const invalid = await fetch(`${base}/api/magazine`, { method: 'POST', body: '{' })
  assert.equal(invalid.status, 400)
  console.log('PASS: local workerd health, built React assets, SPA deep link, API 404s, disabled magazine 503, invalid JSON 400')
} finally {
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await Promise.race([exited, delay(5000).then(() => child.kill('SIGKILL'))])
  await rm(state, { recursive: true, force: true })
}
