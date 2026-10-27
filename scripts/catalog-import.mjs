import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// On-demand manual discovery manifest. No source crawling, image downloads,
// rights promotion, model calls, scheduled work or remote D1 writes.
export async function importCatalog(manifest, { base, token, origin, send = fetch }) {
  const url = new URL(base)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('This importer supports local Worker only.')
  if (!token || token.length < 32) throw new Error('Set CURIO_CATALOG_OPERATOR_TOKEN (at least 32 characters).')
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || !Array.isArray(manifest.candidates)) throw new Error('Invalid manifest envelope.')
  const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1' }
  let imports = 0
  const submit = async body => {
    const response = await send(`${url.origin}/api/operator/catalog/imports`, { method: 'POST', headers, redirect: 'error', body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`Import stopped (HTTP ${response.status}); prior batches may have committed. Correct the manifest and rerun idempotently.`)
    imports++
  }
  for (let i = 0; i < manifest.sources.length; i += 10) await submit({ schemaVersion: 1, sources: manifest.sources.slice(i, i + 10), candidates: [] })
  for (let i = 0; i < manifest.candidates.length; i += 5) await submit({ schemaVersion: 1, sources: [], candidates: manifest.candidates.slice(i, i + 5) })
  return { batches: imports, submitted: manifest.candidates.length }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(process.argv[2] ?? 'seeds/issue-5-candidates.json', 'utf8'))
  const result = await importCatalog(manifest, { base: 'http://127.0.0.1:18788', token: process.env.CURIO_CATALOG_OPERATOR_TOKEN, origin: 'https://curio.test' })
  console.log(JSON.stringify(result))
}
