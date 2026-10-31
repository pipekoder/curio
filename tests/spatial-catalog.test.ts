import {describe,expect,it,vi} from 'vitest'
import {readFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'
import manifest from '../src/spatial/nodes.manifest.json'
import {catalogNodesResponse} from '../src/spatial/contracts'
import {loadCatalogNodes} from '../src/spatial/nodes'
import {demoMedia} from '../src/editorial-demo-media'

const root=join(dirname(fileURLToPath(import.meta.url)),'..')

describe('spatial catalog contract',()=>{
 it('keeps the static manifest valid with every entry tracing to a real record and file',()=>{
  const nodes=catalogNodesResponse.parse(manifest)
  expect(nodes.length).toBeGreaterThanOrEqual(6)
  expect(new Set(nodes.map(n=>n.assetId)).size).toBe(nodes.length)
  for(const node of nodes){
    const record=demoMedia.find(m=>m.assetId===node.assetId)
    expect(record,node.assetId).toBeDefined()
    expect(node.label).toBe(record!.title)
    expect(node.thumbnail).toBe(record!.path)
    expect(existsSync(join(root,'public',node.thumbnail)),node.thumbnail).toBe(true)
    for(const hint of node.edgeHints??[])expect(demoMedia.some(m=>m.assetId===hint),hint).toBe(true)
  }
 })
 it('prefers the dynamic endpoint when it serves valid nodes',async()=>{
  const payload=[{assetId:'live-1',kind:'exhibit',label:'Live record',thumbnail:'/editorial/read/16_read_chair.png'}]
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(payload),{status:200}))
  const result=await loadCatalogNodes(fetchImpl as unknown as typeof fetch)
  expect(result.source).toBe('endpoint')
  expect(result.nodes).toHaveLength(1)
 })
 it('falls back to the manifest on endpoint failure or invalid payload',async()=>{
  const failing=vi.fn(async()=>{throw Error('no worker')})
  const fallback=await loadCatalogNodes(failing as unknown as typeof fetch)
  expect(fallback.source).toBe('manifest')
  expect(fallback.nodes.length).toBeGreaterThanOrEqual(6)
  const invalid=vi.fn(async()=>new Response(JSON.stringify([{assetId:'x'}]),{status:200}))
  const rejected=await loadCatalogNodes(invalid as unknown as typeof fetch)
  expect(rejected.source).toBe('manifest')
 })
 it('reads the manifest from the checked-in file, not a copy',()=>{
  const raw=JSON.parse(readFileSync(join(root,'src/spatial/nodes.manifest.json'),'utf8')) as unknown
  expect(catalogNodesResponse.parse(raw)).toHaveLength(manifest.length)
 })
})
