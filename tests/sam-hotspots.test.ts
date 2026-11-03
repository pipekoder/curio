// @vitest-environment node
import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {sha256} from '../worker/media-store'
import type {SamInput} from '../worker/sam-client'
import type {Segmentation} from '../shared/decoder'
import {imageDimensions} from '../worker/asset-classifier'
import {SamObjectStore} from '../worker/sam-object-store'
import {collectHotspotTargets,enqueueHotspotJobs,hotspotSentence,runHotspotJob,runHotspotSweep,type HotspotDeps} from '../worker/sam-hotspots'

const png=new Uint8Array(readFileSync('public/editorial/discover/02_ceramic_vase.png'))
function d1(sqlite:DatabaseSync){
 return {prepare:(sql:string)=>({bind:(...params:unknown[])=>({
  first:async()=>sqlite.prepare(sql).get(...params as [])??null,
  all:async()=>({results:sqlite.prepare(sql).all(...params as [])}),
  run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...params as []).changes)}}),
 })})} as unknown as D1Database
}
async function fixture(products:{id:string;name:string;description:string;role?:string}[]){
 const sqlite=new DatabaseSync(':memory:')
 for(const file of ['0001_catalog.sql','0003_discovery_content.sql','0004_media_studio.sql','0010_sam_hotspot_jobs.sql'])sqlite.exec(readFileSync(`migrations/${file}`,'utf8'))
 const db=d1(sqlite)
 const versionId=`version-${'ab'.repeat(32)}`
 const hash=await sha256(png)
 const [width,height]=imageDimensions(png,'image/png')
 const run=(sql:string,...params:unknown[])=>sqlite.prepare(sql).run(...params as [])
 run(`INSERT INTO brand_sources(id,name,entry_url,kind,issue_url,created_at) VALUES(?,?,?,?,?,?)`,'source-1','Studio','https://curio.test/studio','gallery','https://example.test/i','2026-01-01')
 run(`INSERT INTO catalog_assets(id,image_url,created_at) VALUES(?,?,?)`,'asset-1','https://curio.test/vase.png','2026-01-01')
 run(`INSERT INTO asset_versions(id,asset_id,version_key,manifest_hash,source_type,provenance_json,created_at) VALUES(?,?,?,?,?,?,?)`,versionId,'asset-1','v1',hash,'synthetic_concept','{}','2026-01-01')
 run(`INSERT INTO asset_permissions(version_id,purpose,status,evidence,rights_holder,reviewer,reviewed_at) VALUES(?,?,'approved',?,?,?,?)`,versionId,'ai_analysis','evidence-doc','holder','reviewer','2026-01-01')
 run(`INSERT INTO media_objects(version_id,asset_id,r2_key,filename,sha256,byte_size,width,height,mime_type,image_type,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,versionId,'asset-1','r2/vase.png','vase.png',hash,png.length,width,height,'image/png','editorial',1,'2026-01-01')
 run(`INSERT INTO content_nodes(id,source_id,original_url,kind,latest_version,availability) VALUES(?,?,?,?,?,?)`,'node-1','source-1','https://curio.test/vase.png','image','cv-1','active')
 run(`INSERT INTO content_versions(id,node_id,fingerprint,content_json,created_at) VALUES(?,?,?,?,?)`,'cv-1','node-1','fp-1','{}','2026-01-01')
 run(`INSERT INTO content_catalog_links(content_version,asset_version) VALUES(?,?)`,'cv-1',versionId)
 run(`INSERT INTO content_reviews(version_id,purpose,status,evidence,reviewer,reviewed_at) VALUES(?,?,'approved',?,?,?)`,'cv-1','ai_analysis','evidence-doc','reviewer','2026-01-01')
 run(`INSERT INTO media_brands(id,name,created_at,updated_at) VALUES(?,?,?,?)`,'brand-1','Kiln Studio','2026-01-01','2026-01-01')
 for(const [index,product] of products.entries()){
  run(`INSERT INTO media_products(id,brand_id,name,description,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,product.id,'brand-1',product.name,product.description,'home','2026-01-01','2026-01-01')
  run(`INSERT INTO media_product_images(product_id,version_id,role,sort_order) VALUES(?,?,?,?)`,product.id,versionId,product.role??'gallery',index)
 }
 const bucket={get:async()=>({size:png.length,arrayBuffer:async()=>png.slice().buffer})} as unknown as R2Bucket
 return {db,versionId,bucket,env:()=>({CATALOG_DB:db,MEDIA_BUCKET:bucket,META_API_KEY:'TEST'} as never)}
}
const echoSam=(regions:Segmentation['regions']= [{id:'sam-0',detailId:'product-1',box:{x:.2,y:.3,width:.4,height:.3},confidence:.8,uncertainty:'model_estimate_not_identity'}])=>vi.fn(async(input:SamInput)=>({adId:input.ad.id,assetId:input.ad.image.id,width:input.ad.image.width,height:input.ad.image.height,model:'sam-3.1' as const,source:'sam_detection' as const,regions}))
const deps=(sam:ReturnType<typeof vi.fn>,allowed=true)=>({sam,reserve:vi.fn(async()=>({allowed,retryAfter:0}))} as unknown as Partial<HotspotDeps>)
const twoProducts=[{id:'product-1',name:'Ceramic Vase',description:'A wheel-thrown vase with a matte glaze. It holds single stems.'},{id:'product-2',name:'Vase Shadow',description:'Soft daylight across the table.'}]

it('derives one concise sentence without inventing product identity',()=>{
 expect(hotspotSentence('A wheel-thrown vase. It holds stems.')).toBe('A wheel-thrown vase.')
 expect(hotspotSentence('No terminal punctuation')).toBe('No terminal punctuation.')
 expect(hotspotSentence('')).toBeNull()
 expect(hotspotSentence('x'.repeat(500))!.length).toBeLessThanOrEqual(400)
})

it('deduplicates edition images across articles for one sweep',()=>{
 const edition={articles:[
  {images:[{assetId:'version-a'},{assetId:'version-b'}]},
  {images:[{assetId:'version-b'},{assetId:'version-c'}]},
  {images:[{assetId:'version-a'}]},
 ]} as never
 expect(collectHotspotTargets(edition)).toEqual(['version-a','version-b','version-c'])
})

it('processes first-time jobs once, then reuses cache without inference',async()=>{
 const {db,versionId,env}=await fixture(twoProducts)
 const sam=echoSam()
 expect(await enqueueHotspotJobs(db,[versionId,versionId])).toHaveLength(2)
 expect(await runHotspotSweep(env(),[versionId],deps(sam))).toEqual(['ready','ready'])
 expect(sam).toHaveBeenCalledTimes(2)
 expect(await runHotspotSweep(env(),[versionId],deps(sam))).toEqual(['ready','ready'])
 expect(sam).toHaveBeenCalledTimes(2)
 const regions=await new SamObjectStore(db).hotspotRegions(versionId)
 expect(regions).toHaveLength(2)
 expect(regions[0]!).toMatchObject({label:'Ceramic Vase',editorialDetail:'A wheel-thrown vase with a matte glaze.',provenance:{origin:'sam_hotspot',reviewed:false}})
})

it('records no-match for empty localization and never reprocesses terminal rows',async()=>{
 const {versionId,env}=await fixture(twoProducts)
 const empty=echoSam([])
 expect(await runHotspotSweep(env(),[versionId],deps(empty))).toEqual(['no-match','no-match'])
 expect(empty).toHaveBeenCalledTimes(2)
 expect(await runHotspotSweep(env(),[versionId],deps(empty))).toEqual(['no-match','no-match'])
 expect(empty).toHaveBeenCalledTimes(2)
})

it('fails paid-call errors once without automatic retry',async()=>{
 const {db,versionId,env}=await fixture(twoProducts)
 const broken=vi.fn(async()=>{throw new Error('provider down')})
 await enqueueHotspotJobs(db,[versionId])
 const ids=(await db.prepare(`SELECT id FROM sam_hotspot_jobs`).bind().all<{id:string}>()).results.map(row=>row.id)
 expect(await runHotspotJob(env(),ids[0],deps(broken))).toBe('failed')
 expect(await runHotspotJob(env(),ids[0],deps(broken))).toBe('skipped')
 expect(broken).toHaveBeenCalledTimes(1)
})

it('lets exactly one concurrent runner execute each job',async()=>{
 const {db,versionId,env}=await fixture(twoProducts)
 const sam=echoSam()
 await enqueueHotspotJobs(db,[versionId])
 const ids=(await db.prepare(`SELECT id FROM sam_hotspot_jobs`).bind().all<{id:string}>()).results.map(row=>row.id)
 const d=deps(sam)
 const outcomes=await Promise.all(ids.flatMap(id=>[runHotspotJob(env(),id,d),runHotspotJob(env(),id,d)]))
 expect(outcomes.filter(outcome=>outcome==='ready')).toHaveLength(2)
 expect(outcomes.filter(outcome=>outcome==='skipped')).toHaveLength(2)
 expect(sam).toHaveBeenCalledTimes(2)
})

it('segregates stale cache when the fingerprint changes',async()=>{
 const {db,versionId,env}=await fixture(twoProducts)
 const sam=echoSam()
 await runHotspotSweep(env(),[versionId],deps(sam))
 expect(await new SamObjectStore(db).hotspotRegions(versionId)).toHaveLength(2)
 await db.prepare(`UPDATE media_objects SET sha256=? WHERE version_id=?`).bind('0'.repeat(64),versionId).run()
 expect(await new SamObjectStore(db).hotspotRegions(versionId)).toHaveLength(0)
 expect(await enqueueHotspotJobs(db,[versionId])).toHaveLength(2)
 expect(await new SamObjectStore(db).hotspotRegions(versionId)).toHaveLength(0)
})
