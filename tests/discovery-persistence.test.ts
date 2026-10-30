// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {assetDatabase} from './asset-fixtures'
import {discover,type DiscoveryTransport} from '../discovery/core'
import {DiscoveryStore} from '../worker/discovery-store'
import {CatalogPublications} from '../worker/catalog-publications'
import {AssetStore} from '../worker/asset-store'
import {D1Catalog} from '../worker/catalog-store'
import {catalog,catalogItem} from '../shared/catalog'
import {editorialPool,generateEditorialResult} from '../worker/editorial'
import {mediaReadiness} from '../worker/asset-classifier'
import app from '../worker/index'
import {defaultPreferences} from '../shared/editorial'
let context:Awaited<ReturnType<typeof assetDatabase>>
afterEach(async()=>{vi.unstubAllGlobals();await context?.mf.dispose()})
const start='https://publisher.example.com/gallery'
function transport(alt='Original synthetic visual',sha='a'.repeat(64)):DiscoveryTransport{
 return {read:vi.fn(async(url:string)=>url.endsWith('.png')?{status:200,type:'image/png',body:'',bytes:100,sha256:sha,width:1200,height:900,length:100}:{status:200,type:'text/html',body:`<h1>Synthetic fixture gallery</h1><main><p>Original test lighting study.</p><img src="/image.png" alt="${alt}" width="1200" height="900"></main>`,bytes:100}),metrics:()=>({requests:2,bytes:200})}
}
async function setup(){context=await assetDatabase();return new DiscoveryStore(context.db)}
it('reuses an approved synthetic discovery through D1 retrieval and Muse editorial selection with no second crawl',async()=>{
 const store=await setup(),network=transport(),m=await discover(start,{hosts:['publisher.example.com'],dynamic:false,fingerprintImages:true,delayMs:0},network)
 const saved=await store.save(m);expect(saved.replay).toBe(false)
 const rows=await store.list(),image=rows.find(r=>r.kind==='image')!
 const promoted=await store.promote(String(image.latest_version)),version=promoted.versionId
 expect((await new CatalogPublications(context.db).list()).items).toHaveLength(0)
 await store.review({versionId:String(image.latest_version),purpose:'display',status:'approved',evidence:'docs/TEST_ONLY.md',reviewer:'Test only'})
 const asset=new AssetStore(context.db),base=new D1Catalog(context.db)
 for(const purpose of ['display','ai_analysis'])await base.review(version,{purpose,status:'approved',evidence:'docs/TEST_ONLY.md',rightsHolder:'Synthetic test creator',reviewer:'Automated fixture only',expectedRevision:0})
 await asset.reviewIdentity({sourceId:m.sourceId,canonicalBrandId:'synthetic-test',brandName:'Synthetic fixture creator',evidence:'https://publisher.example.com/evidence',reviewer:'Test only'})
 await asset.reviewReader({versionId:version,sourceId:m.sourceId,alt:'Original synthetic visual',attribution:'Synthetic fixture creator',sourcePage:start,licensingEvidence:'https://publisher.example.com/evidence',reviewer:'Test only'})
 const assetRow=await asset.version(version)
 const item=catalogItem.parse({...catalog[0],id:`catalog-${assetRow!.asset_id.slice(6,46)}`,name:'Synthetic persisted image',description:'Original synthetic lighting study.',sourceType:'editorial_support',image:{...catalog[0].image,id:version,path:null,externalUrl:'https://publisher.example.com/image.png',fallbackPath:null,alt:'Original synthetic visual',role:'supplied_image'},provenance:{...catalog[0].provenance,origin:'owner_supplied',originalSourcePage:start,attribution:'Synthetic fixture creator'},licensing:{status:'cleared',rightsHolder:'Synthetic fixture creator',evidence:'docs/TEST_ONLY.md'},permissions:{display:{status:'approved',evidence:'docs/TEST_ONLY.md'},aiAnalysis:{status:'approved',evidence:'docs/TEST_ONLY.md'},edits:{status:'pending',evidence:null}}})
 await new CatalogPublications(context.db).publish({versionId:version,item,reviewer:'Test only'})
 const publicPage=await app.request('/api/catalog/published?ids='+version,{}, {CATALOG_DB:context.db,CATALOG_PUBLIC_ENABLED:'true'})
 expect(publicPage.status).toBe(200);expect(((await publicPage.json()) as {items:{image:{id:string}}[]}).items[0].image.id).toBe(version)
 const p={...defaultPreferences,mode:'Focused' as const,allocations:{home:100,fashion:0,travel:0}},pool=await editorialPool({CATALOG_DB:context.db,CATALOG_PUBLIC_ENABLED:"true"},p)
 expect(pool.retrieval).toBe('d1');expect(pool.items.map(i=>i.image.id)).toContain(version)
 const plan=JSON.parse(readFileSync('tests/fixtures/editorial-live-home.json','utf8')).plan
 plan.features=[{...plan.features[0],catalogId:item.id,assetId:version}];plan.connections=[]
 const send=vi.fn(async(_url:string,init:RequestInit)=>{expect(JSON.parse(JSON.parse(String(init.body)).messages[1].content).catalog[0].assetId).toBe(version);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]})});vi.stubGlobal('fetch',send)
 expect((await generateEditorialResult(p,pool.items,'FAKE',[],undefined,pool.approvals)).plan.features[0].assetId).toBe(version)
 expect(network.read).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(1)
 expect((await store.promote(String(image.latest_version))).permissionsUnchanged).toBe(true)
 await store.review({versionId:String(image.latest_version),purpose:'ai_analysis',status:'rejected',evidence:'docs/TEST_ONLY.md',reviewer:'Test only'})
 expect((await new CatalogPublications(context.db).list()).items[0].permissions.aiAnalysis.status).toBe('rejected')
 expect(mediaReadiness(await asset.version(version)).ready).toBe(false)

 await base.review(version,{purpose:'display',status:'rejected',evidence:'docs/TEST_ONLY.md',rightsHolder:'Synthetic fixture creator',reviewer:'Test only',expectedRevision:1})
 expect((await new CatalogPublications(context.db).list()).items).toHaveLength(0)
})
it('persists incremental snapshots and retains rejected evidence without transferring rights to a changed version',async()=>{
 const store=await setup(),config={hosts:['publisher.example.com'],dynamic:false,fingerprintImages:true,delayMs:0}
 const first=await discover(start,config,transport());await store.save(first)
 const image=(await store.list()).find(r=>r.kind==='image')!,version=String(image.latest_version)
 await store.review({versionId:version,purpose:'display',status:'rejected',evidence:'docs/TEST_ONLY.md',reviewer:'Test only'})
 expect((await store.save(first)).replay).toBe(true)
 const same=await store.save(await discover(start,config,transport()));expect(same.states?.find(s=>s.nodeId===image.id)?.state).toBe('unchanged')
 const changed=await store.save(await discover(start,config,transport('Updated original visual','b'.repeat(64))))
 const next=changed.states!.find(s=>s.nodeId===image.id)!;expect(next.state).toBe('updated');expect(next.versionId).not.toBe(version)
 expect((await store.get(version))!.reviews).toHaveLength(1);expect((await store.get(next.versionId))!.reviews).toHaveLength(0)
 const restored=await store.save(await discover(start,config,transport()))
 const restoredVersion=restored.states!.find(s=>s.nodeId===image.id)!.versionId
 expect(restoredVersion).not.toBe(version);expect((await store.get(restoredVersion))!.reviews).toHaveLength(0)

 const empty=await discover(start,config,{read:async()=>({status:200,type:'text/html',body:'<h1>Empty gallery</h1>',bytes:10}),metrics:()=>({requests:1,bytes:10})});await store.save(empty)
 expect((await store.get(next.versionId))!.availability).toBe('removed')
 const blocked=await discover(start,config,{read:async()=>({status:403,type:'text/html',body:'',bytes:0}),metrics:()=>({requests:1,bytes:0})});await store.save(blocked)
 expect((await store.get(version))!.reviews).toHaveLength(1)
})
it('keeps partial and inaccessible runs from deleting prior candidates or review history',async()=>{
 const store=await setup(),first=await discover(start,{hosts:['publisher.example.com'],dynamic:false,fingerprintImages:true,delayMs:0},transport());await store.save(first)
 const page=(await store.list()).find(r=>r.kind==='gallery')!
 const failed=await discover(start,{hosts:['publisher.example.com'],dynamic:false}, {read:async()=>{throw Error('request_timeout')},metrics:()=>({requests:1,bytes:0})});await store.save(failed)
 expect((await store.get(String(page.latest_version)))!.availability).toBe('inaccessible')
 expect((await store.list()).some(r=>r.kind==='image')).toBe(true)
})
