import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function importAssetManifest(manifest, { base = 'http://127.0.0.1:18788', token, send = fetch }) {
  const url = new URL(base)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Local Worker only; production ingestion needs separate approval.')
  if (!token || token.length < 32 || !Array.isArray(manifest.sources) || !Array.isArray(manifest.items)) throw new Error('Valid manifest and private local operator token required.')
  let batches = 0
  const headers = { Authorization: `Bearer ${token}`, Origin: 'https://curio.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1' }
  const submit = async payload => {
    const r = await send(`${url.origin}/api/operator/catalog/intelligence/imports`, { method: 'POST', headers, redirect: 'error', body: JSON.stringify(payload) })
    if (!r.ok) throw new Error(`Import stopped at HTTP ${r.status}; earlier batches may have committed. Correct and reimport idempotently.`)
    batches++
  }
  for (let i=0;i<manifest.sources.length;i+=10) await submit({ sources: manifest.sources.slice(i,i+10), items: [] })
  for (let i=0;i<manifest.items.length;i+=5) await submit({ sources: [], items: manifest.items.slice(i,i+5) })
  return { submitted: manifest.items.length, batches, aiCalls: 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(process.argv[2] ?? 'seeds/asset-intelligence-v1.json','utf8'))
  console.log(JSON.stringify(await importAssetManifest(manifest,{ token: process.env.CURIO_CATALOG_OPERATOR_TOKEN })))
}
