import assert from 'node:assert/strict'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFile } from 'node:fs/promises'
import { importAssetManifest } from './asset-intelligence-import.mjs'
const token='FAKE_TEST_OPERATOR_TOKEN_32_CHARACTERS_ONLY',origin='https://curio.test'
let outbound=0
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,telemetry:{enabled:false},scriptPath:'.wrangler/dry-run/index.js',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],bindings:{CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin},outboundService:()=>{outbound++;throw Error('Unexpected outbound access')}}))
const headers={Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'}
const call=(path,body,extra={})=>mf.dispatchFetch(`${origin}/api/operator/catalog/intelligence${path}`,{method:body===undefined?'GET':'POST',headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)})
try {
 const db=await mf.getD1Database('CATALOG_DB')
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql']) await db.exec((await readFile(`migrations/${file}`,'utf8')).replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first()).n,17)
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL").first()).n,10)
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger'").first()).n,1)
 assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok')
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[])
 assert.equal((await call('/stages',undefined,{Authorization:''})).status,403)
 assert.equal((await call('/imports',{}, {Origin:'https://evil.example'})).status,403)
 assert.equal((await call('/imports',{x:'x'.repeat(66000)})).status,413)
 const manifest=JSON.parse(await readFile('seeds/asset-intelligence-v1.json','utf8'))
 const options={token,send:(url,init)=>mf.dispatchFetch(url,init)}
 const imported=await importAssetManifest(manifest,options)
 assert.equal(imported.submitted,33);assert.equal(imported.aiCalls,0)
 await importAssetManifest(manifest,options)
 const status=await call('/stages');assert.equal(status.headers.get('Cache-Control'),'no-store')
 assert.deepEqual((await status.json()).counts,{discovered:33,imported:33,display_approved:0,ai_enriched:0,mock_enriched:0,reader_eligible:0})
 const preferences={allocations:{home:100,fashion:0,travel:0},aesthetics:[],tags:[],scope:'review'}
 const query=await call('/retrieve',preferences);assert.equal(query.status,200)
 const results=await query.json();assert.ok(results.items.length>0)
 const versionId=results.items[0].version_id
 assert.equal((await (await call('/retrieve',{...preferences,scope:'reader'})).json()).items.length,0)
 const input={versionId,mode:'mock',consent:true}
 assert.equal((await (await call('/classify',input)).json()).cached,false)
 assert.equal((await (await call('/classify',input)).json()).cached,true)
 assert.equal((await call('/classify',{...input,mode:'meta'})).status,503)
 assert.equal((await (await call('/stages')).json()).counts.ai_enriched,0)
 assert.equal((await mf.dispatchFetch(`${origin}/api/magazine/config`)).status,200)
 assert.equal((await mf.dispatchFetch(`${origin}/api/catalog/intelligence`)).status,404)
 await assert.rejects(()=>importAssetManifest(manifest,{...options,base:'https://production.example'}),/local/i)
 assert.equal(outbound,0)
 console.log('PASS: Asset Intelligence production Worker + D1 migrations; 33 deduplicated candidates, private retrieval, mock cache, default-off Meta, no public exposure or outbound calls')
} finally {await mf.dispose()}
