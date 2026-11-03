// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {MediaStore} from '../worker/media-store'
import {resolveR2MediaPermit,readR2MediaData} from '../worker/media-ai-adapter'
import {CatalogPublications} from '../worker/catalog-publications'
import {mediaApi,publicMedia} from '../worker/media-api'
import {mockUnderstanding,runClassification} from '../worker/asset-classifier'
import {runDecoder} from '../worker/decoder'
import {D1AssetRetriever} from '../worker/asset-retrieval'
import app from '../worker/index'
import {loadEditorialSources} from '../worker/editorial-sources'
import {catalogItem} from '../shared/catalog'
import {editorialPlan} from '../shared/editorial'
import {editorialSources} from '../shared/editorial-sources'
import {editorialArticlePool} from '../worker/editorial-article-pool'
import {resolveEditorialInput} from '../shared/editorial-intent'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
let mf:Miniflare,db:D1Database,bucket:R2Bucket,store:MediaStore
const origin='https://curio.example.com'
beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql','0005_sam_object_reviews.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 store=new MediaStore(db,bucket,origin)
})
afterEach(async()=>mf?.dispose())

it('includes authorized, metadata-ready R2 images before analysis and reuses exact-version observations afterward',async()=>{
 const first=await store.upload(new File([readFileSync('public/editorial/discover/02_ceramic_vase.png')],'first-room.png',{type:'image/png'}))
 const second=await store.upload(new File([readFileSync('public/editorial/discover/01_boucle_lounge_chair.png')],'second-room.png',{type:'image/png'}))
 await store.import({sourceText:'Owner-provided fictional studies',brands:[{name:'Northline Studio',story:'Fictional owner-created room studies.'}],products:[{brand:'Northline Studio',name:'Room Study',description:'An owner-created composition of seating and everyday objects.',category:'home',materials:[],imageFilenames:['first-room.png','second-room.png'],lifestyleTags:['Scandinavian']}],campaigns:[]})
 // A published, metadata-complete image with no ranking hints still enters
 // bounded preparation; missing visual analysis must not hide it upstream.
 await db.prepare("UPDATE publisher_metadata SET hints_json='{}' WHERE version_id=?").bind(second.versionId).run()
 const env={CATALOG_DB:db,MEDIA_BUCKET:bucket,CATALOG_PUBLIC_ENABLED:'true'} as never
 const p=resolveEditorialInput({prompt:'Explore Scandinavian rooms and seating',consent:true})
 const before=await editorialArticlePool(env,p)
 expect(before.eligibleCount).toBe(0)
 expect(before.preparation?.pendingVersionIds).toEqual(expect.arrayContaining([first.versionId,second.versionId]))
 await expect(runClassification({versionId:second.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'test-key'} as never,'192.0.2.8',{articlePreparation:true,reserve:vi.fn().mockResolvedValue({allowed:false,retryAfter:60})})).rejects.toMatchObject({code:'inference_limit_reached'})
 expect((await db.prepare('SELECT cache_key FROM asset_analysis_jobs WHERE version_id=?').bind(second.versionId).all()).results).toHaveLength(0)
 const classified=await runClassification({versionId:first.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'test-key'} as never,'192.0.2.8',{reserve:vi.fn().mockResolvedValue({allowed:true,retryAfter:0}),classify:vi.fn(async()=>({...mockUnderstanding(first.versionId),imageSha256:first.sha256,observations:{subjects:['seating' as const],materialAppearance:[],environments:['interior-like' as const],relationships:[]}}))})
 expect(classified.origin).toBe('meta')
 const after=await editorialArticlePool(env,p)
 expect(after.eligibleCount).toBe(1)
 expect(after.items[0].image.id).toBe(first.versionId)
 expect(after.preparation?.pendingVersionIds).toContain(second.versionId)
 const release=vi.fn(async()=>Response.json({released:true}))
 await runClassification({versionId:second.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'test-key',INFERENCE_BUDGET:{idFromName:()=>({}),get:()=>({fetch:release})}} as never,'192.0.2.8',{articlePreparation:true,reserve:vi.fn().mockResolvedValue({allowed:true,reservationId:'00000000-0000-4000-8000-000000000001'}),classify:vi.fn(async()=>({...mockUnderstanding(second.versionId),imageSha256:second.sha256,observations:{subjects:['seating' as const],materialAppearance:[],environments:['interior-like' as const],relationships:[]}}))})
 expect(release).toHaveBeenCalledWith('https://budget/finish',expect.objectContaining({method:'POST'}))
 expect((await editorialArticlePool(env,p)).eligibleCount).toBe(2)
 await store.remove(first.versionId)
 expect((await editorialArticlePool(env,p)).items.map(item=>item.image.id)).toEqual([second.versionId])
})

it('persists exact R2 bytes, relationships and a permission-gated Reader publication without inference',async()=>{
 const bytes=readFileSync('public/editorial/discover/02_ceramic_vase.png'),file=new File([bytes],'northline-fold-chair.png',{type:'image/png'}),batchId=await store.createBatch('owner mockup batch')
 const uploaded=await store.upload(file,batchId)
 expect(uploaded).toMatchObject({filename:file.name,mimeType:'image/png',aiAvailable:true,readerAvailable:true})
 expect(new Uint8Array(await (await bucket.get(uploaded.r2Key))!.arrayBuffer())).toEqual(new Uint8Array(bytes))
 await expect(store.upload(file,batchId)).rejects.toThrow(/already/)
 const generic=await new D1AssetRetriever(db).retrieve({allocations:{home:100,fashion:0,travel:0},aesthetics:['Quiet Luxury'],tags:['mockup'],scope:'reader',publishedOnly:true,limit:10})
 expect(generic.items.map(item=>item.version_id)).not.toContain(uploaded.versionId)
 const imported=await store.import({batchId,sourceText:'fixture',brands:[{name:'Northline Studio',story:'Fictional owner mockup brand.'}],products:[{brand:'Northline Studio',name:'Fold Chair',description:'A fictional folded chair concept.',category:'home',materials:['textile appearance'],price:1250,currency:'USD',imageFilenames:[file.name],lifestyleTags:['Scandinavian']}],campaigns:[{brand:'Northline Studio',name:'Still Forms',description:'Owner supplied mockup campaign.',imageFilenames:[]}]})
 expect(imported.products).toHaveLength(1)
 const sources=await loadEditorialSources(db,[uploaded.versionId])
 expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({assetId:uploaded.versionId,kind:'brand_story',value:'Fictional owner mockup brand.',authority:'owner_supplied_mockup'}),expect.objectContaining({kind:'product_description',value:'A fictional folded chair concept.'})]))
 let listing=await store.list();expect(listing.media[0]).toMatchObject({image_type:'product',filename:file.name,product_ids:imported.products[0].id,editorial_ready:1});expect(listing.inferenceTriggered).toBe(false)
 const brandId=String(listing.brands[0].id),campaignId=String(listing.campaigns[0].id)
 await store.link(uploaded.versionId,{imageType:'campaign',campaignId})
 listing=await store.list();expect(listing.media[0]).toMatchObject({image_type:'campaign',product_ids:imported.products[0].id,campaign_ids:campaignId,editorial_ready:1})
 await store.link(uploaded.versionId,{imageType:'brand',brandId})
 listing=await store.list();expect(listing.media[0]).toMatchObject({image_type:'brand',product_ids:imported.products[0].id,brand_ids:brandId,campaign_ids:campaignId,editorial_ready:1})
 await expect(store.link(uploaded.versionId,{imageType:'product',productId:'product-does-not-exist'})).rejects.toThrow('Unknown product assignment.')
 listing=await store.list();expect(listing.media[0]).toMatchObject({product_ids:imported.products[0].id,brand_ids:brandId,campaign_ids:campaignId,editorial_ready:1})
 const published=await new CatalogPublications(db).list('',10,[uploaded.versionId]);expect(published.items).toHaveLength(1);expect(published.items[0]).toMatchObject({name:'Fold Chair',sourceType:'synthetic_concept',permissions:{display:{status:'approved'},aiAnalysis:{status:'approved'}}})
 const publicList=await app.request(`${origin}/api/catalog/published?ids=${uploaded.versionId}`,undefined,{CATALOG_DB:db,CATALOG_PUBLIC_ENABLED:'true'})
 expect(publicList.status).toBe(200)
 expect(await publicList.json()).toMatchObject({items:[expect.objectContaining({id:published.items[0].id,image:expect.objectContaining({id:uploaded.versionId,externalUrl:`${origin}/api/media/${uploaded.versionId}`})})],nextCursor:null})
 expect((await db.prepare('SELECT COUNT(*) AS n FROM asset_analysis_jobs').first<{n:number}>())!.n).toBe(0)
 const permit=await resolveR2MediaPermit(db,uploaded.versionId);expect(permit).toMatchObject({sha256:uploaded.sha256,mime:'image/png'})
 const data=await readR2MediaData(bucket,permit!,new AbortController().signal);expect(data.startsWith('data:image/png;base64,')).toBe(true)
 const delivered=await publicMedia(new Request(`${origin}/api/media/${uploaded.versionId}`),{CATALOG_DB:db,MEDIA_BUCKET:bucket,PUBLIC_APP_ORIGIN:origin},uploaded.versionId);expect(delivered.status).toBe(200);expect(new Uint8Array(await delivered.arrayBuffer())).toEqual(new Uint8Array(bytes))
 const classify=vi.fn().mockResolvedValue({...mockUnderstanding(uploaded.versionId),imageSha256:uploaded.sha256})
 const classified=await runClassification({versionId:uploaded.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'test-key'} as never,'192.0.2.1',{reserve:vi.fn().mockResolvedValue({allowed:true,retryAfter:0}),classify})
 expect(classified).toMatchObject({origin:'meta',cached:false,inference:{attempted:true,reservedUnits:1}});expect(classify.mock.calls[0][2]).toMatch(/^data:image\/png;base64,/)
 const discovered=await new D1AssetRetriever(db).retrieve({allocations:{home:100,fashion:0,travel:0},aesthetics:['Scandinavian'],tags:['chair'],brandDiversity:true,serendipity:0,seed:'fold chair',scope:'reader',publishedOnly:true,limit:10});expect(discovered.items.map(item=>item.version_id)).toContain(uploaded.versionId)
 const byOwnerWords=await new D1AssetRetriever(db).retrieve({allocations:{home:100,fashion:0,travel:0},aesthetics:[],editorialTerms:['folded'],scope:'reader',publishedOnly:true,limit:10});expect(byOwnerWords.items[0]).toMatchObject({version_id:uploaded.versionId,editorial_ready:1})
 const editionResponse=await app.request(`${origin}/api/editorial`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({prompt:'Explore Scandinavian chairs and quiet interiors',consent:false})},{CATALOG_DB:db,CATALOG_PUBLIC_ENABLED:'true',MAGAZINE_AI_ENABLED:'false',PUBLIC_APP_ORIGIN:origin})
 expect(editionResponse.status).toBe(200)
 const edition=await editionResponse.json() as Record<string,unknown>
 expect(edition).toMatchObject({source:'deterministic',retrieval:'d1',cached:false,fallbackReason:'disabled',inference:{attempted:false,reservedUnits:0,latencyMs:null,usage:null}})
 const editionItems=catalogItem.array().parse(edition.items),editionPlan=editorialPlan.parse(edition.plan)
 expect(editionItems).toContainEqual(expect.objectContaining({id:published.items[0].id,image:expect.objectContaining({id:uploaded.versionId,externalUrl:`${origin}/api/media/${uploaded.versionId}`}),provenance:expect.objectContaining({attribution:'Curio owner-created mockup'})}))
 expect(editionPlan.features).toEqual(expect.arrayContaining([expect.objectContaining({catalogId:published.items[0].id,assetId:uploaded.versionId})]))
 expect(editorialSources.parse(edition.editorialSources)).toEqual(expect.arrayContaining([expect.objectContaining({assetId:uploaded.versionId,kind:'brand_story'})]))
 const ad=published.items[0],sam=vi.fn().mockResolvedValue({adId:ad.id,assetId:ad.image.id,width:ad.image.width,height:ad.image.height,model:'sam-3.1',source:'sam_detection',regions:[]})
 const decoded=await runDecoder({adId:ad.id,assetId:ad.image.id,detailId:'detail-0',consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,SAM_DECODER_ENABLED:'true',META_SAM_MODEL:'sam-3.1',META_API_KEY:'test-key'} as never,'192.0.2.1',{catalog:[],permits:{},reserve:vi.fn().mockResolvedValue({allowed:true,retryAfter:0}),sam,commentary:vi.fn()})
 expect(decoded.segmentation).toMatchObject({assetId:uploaded.versionId,source:'sam_detection'});expect(sam.mock.calls[0][0].imageDataUrl).toMatch(/^data:image\/png;base64,/)
 await store.remove(uploaded.versionId);expect(await bucket.get(uploaded.r2Key)).toBeNull();expect((await new CatalogPublications(db).list('',10,[uploaded.versionId])).items).toHaveLength(0);expect((await publicMedia(new Request(`${origin}/api/media/${uploaded.versionId}`),{CATALOG_DB:db,MEDIA_BUCKET:bucket,PUBLIC_APP_ORIGIN:origin},uploaded.versionId)).status).toBe(404)
})

it('does not deliver R2 bytes when a stale publication loses content display approval',async()=>{
 const bytes=readFileSync('public/editorial/discover/02_ceramic_vase.png')
 const uploaded=await store.upload(new File([bytes],'reviewed-study.png',{type:'image/png'}))
 const request=new Request(`${origin}/api/media/${uploaded.versionId}`)
 const env={CATALOG_DB:db,MEDIA_BUCKET:bucket,PUBLIC_APP_ORIGIN:origin}
 expect((await new CatalogPublications(db).list('',10,[uploaded.versionId])).items).toHaveLength(1)
 expect((await publicMedia(request,env,uploaded.versionId)).status).toBe(200)
 await db.prepare(`UPDATE content_reviews SET status='blocked' WHERE version_id=(SELECT content_version FROM content_catalog_links WHERE asset_version=?) AND purpose='display'`).bind(uploaded.versionId).run()
 expect((await new CatalogPublications(db).list('',10,[uploaded.versionId])).items).toHaveLength(0)
 expect((await publicMedia(request,env,uploaded.versionId)).status).toBe(404)
 expect(await bucket.get(uploaded.r2Key)).not.toBeNull()
})

it('fails closed before storage for invalid operator access and image content',async()=>{
 const token='test-only-private-token-more-than-32-characters',env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:bucket}
 const denied=await mediaApi.request(`${origin}/`,{headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'}},env);expect(denied.status).toBe(403)
 const fake=new File([new TextEncoder().encode('not an image')],'fake.png',{type:'image/png'});await expect(store.upload(fake)).rejects.toThrow(/between 32 bytes|do not match/)
 expect((await bucket.list()).objects).toHaveLength(0)
})

it('persists inspected metadata, preserves links and recalculates editorial readiness',async()=>{
 const bytes=readFileSync('public/editorial/discover/02_ceramic_vase.png'),file=new File([bytes],'metadata-chair.png',{type:'image/png'}),uploaded=await store.upload(file)
 const imported=await store.import({sourceText:'incomplete fixture',brands:[{name:'Incomplete Studio',story:'',description:''}],products:[{brand:'Incomplete Studio',name:'Metadata Chair',description:'',category:'home',materials:[],price:null,currency:null,imageFilenames:[file.name],lifestyleTags:['Scandinavian']}],campaigns:[]})
 let listing=await store.list(),media=listing.media.find(row=>row.version_id===uploaded.versionId)!
 expect(media).toMatchObject({product_ids:imported.products[0].id,editorial_ready:0})
 const brandId=String(listing.products.find(row=>row.id===imported.products[0].id)!.brand_id)
 const token='test-only-private-token-more-than-32-characters',response=await mediaApi.request(`${origin}/metadata`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({brand:{id:brandId,story:'An owner-supplied fictional studio story.'},product:{id:imported.products[0].id,description:'An owner-supplied fictional chair description.'}})},{CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:bucket})
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({updated:true,affectedVersions:[uploaded.versionId]})
 listing=await store.list();media=listing.media.find(row=>row.version_id===uploaded.versionId)!
 expect(media).toMatchObject({product_ids:imported.products[0].id,editorial_ready:1})
 expect(listing.brands.find(row=>row.id===brandId)).toMatchObject({story:'An owner-supplied fictional studio story.',description:''})
 expect(listing.products.find(row=>row.id===imported.products[0].id)).toMatchObject({description:'An owner-supplied fictional chair description.'})
 const publication=await new CatalogPublications(db).list('',10,[uploaded.versionId])
 expect(publication.items[0]).toMatchObject({description:'An owner-supplied fictional chair description.',lifestyleTags:['Scandinavian']})
 await expect(store.updateMetadata({brand:{id:brandId,description:'Must remain unsaved.'},product:{id:'product-missing',description:'Should not save.'}})).rejects.toThrow('Unknown product metadata record.')
 expect((await store.list()).brands.find(row=>row.id===brandId)).toMatchObject({description:''})
 expect((await store.list()).media.find(row=>row.version_id===uploaded.versionId)).toMatchObject({product_ids:imported.products[0].id,editorial_ready:1})
})

it('accepts an authenticated same-origin browser GET without Origin and rejects cross-origin or write lookalikes',async()=>{
 const token='test-only-private-token-more-than-32-characters',env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:bucket}
 const authorized={Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1','Sec-Fetch-Site':'same-origin',Referer:`${origin}/internal/media`}
 const opened=await mediaApi.request(`${origin}/`,{headers:authorized},env)
 expect(opened.status).toBe(200)
 expect(opened.headers.get('Cache-Control')).toBe('no-store')

 const explicitCrossOrigin=await mediaApi.request(`${origin}/`,{headers:{...authorized,Origin:'https://evil.example'}},env)
 expect(explicitCrossOrigin.status).toBe(403)
 const crossSiteMetadata=await mediaApi.request(`${origin}/`,{headers:{...authorized,'Sec-Fetch-Site':'cross-site'}},env)
 expect(crossSiteMetadata.status).toBe(403)
 const crossOriginReferer=await mediaApi.request(`${origin}/`,{headers:{...authorized,Referer:'https://evil.example/studio'}},env)
 expect(crossOriginReferer.status).toBe(403)
 const missingBrowserEvidence=await mediaApi.request(`${origin}/`,{headers:{Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1'}},env)
 expect(missingBrowserEvidence.status).toBe(403)
 const badToken=await mediaApi.request(`${origin}/`,{headers:{...authorized,Authorization:'Bearer incorrect'}},env)
 expect(badToken.status).toBe(403)
 const writeWithoutOrigin=await mediaApi.request(`${origin}/batches`,{method:'POST',headers:{...authorized,'Content-Type':'application/json'},body:'{"sourceText":""}'},env)
 expect(writeWithoutOrigin.status).toBe(403)
})

it('mounts authenticated Media Studio root GETs with and without a trailing slash',async()=>{
 const token='test-only-private-token-more-than-32-characters',env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:bucket}
 const headers={Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1','Sec-Fetch-Site':'same-origin',Referer:`${origin}/internal/media`}
 for(const path of ['/api/operator/media','/api/operator/media/']){
  const response=await app.request(`${origin}${path}`,{headers},env)
  expect(response.status,path).toBe(200)
  expect(await response.json()).toMatchObject({media:[],brands:[],products:[],campaigns:[]})
  const denied=await app.request(`${origin}${path}`,{headers:{...headers,Authorization:'Bearer incorrect'}},env)
  expect(denied.status,path).toBe(403)
  expect(await denied.json()).toEqual({error:'Operator access required.'})
 }
})

it('reports exact-version pilot readiness and loses publication on display revocation',async()=>{
 const filename='02_ceramic_vase.png',bytes=readFileSync(`public/editorial/discover/${filename}`)
 const uploaded=await store.upload(new File([bytes],filename,{type:'image/png'}))
 await store.import({sourceText:'Owner fixture',brands:[{name:'Northline Studio',story:'Fictional owner mockup brand.'}],products:[{brand:'Northline Studio',name:'Vase Study',description:'A fictional owner-created interior study.',category:'home',materials:[],imageFilenames:[filename],lifestyleTags:['Scandinavian']}],campaigns:[]})
 await runClassification({versionId:uploaded.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'} as never,'192.0.2.1',{reserve:vi.fn(async()=>({allowed:true,retryAfter:0})),classify:vi.fn(async()=>({...mockUnderstanding(uploaded.versionId),imageSha256:uploaded.sha256,observations:{subjects:['seating' as const],materialAppearance:[],environments:[],relationships:['curve-and-space' as const]}}))})
 const ids=[uploaded.versionId,...Array.from({length:5},(_,i)=>`version-${String(i).repeat(64)}`)]
 const token='test-only-private-token-more-than-32-characters'
 const env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,EDITORIAL_PILOT_VERSION_IDS:ids.join(',')}
 const request=()=>app.request(`${origin}/api/operator/catalog/intelligence/pilot/readiness`,{headers:{Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1','Sec-Fetch-Site':'same-origin',Referer:`${origin}/internal/media`}},env)
 const initial=await (await request()).json() as {ready:boolean;assets:{versionId:string;published:boolean;editorialMetadata:boolean;imageAnalysis:boolean;editorialReady:boolean}[]}
 expect(initial.ready).toBe(false)
 expect(initial.assets).toHaveLength(6)
 expect(initial.assets[0]).toMatchObject({versionId:uploaded.versionId,published:true,editorialMetadata:true,imageAnalysis:true,editorialReady:true})
 expect(initial.assets.slice(1).every(row=>!row.published&&!row.imageAnalysis)).toBe(true)
 await db.prepare(`UPDATE content_reviews SET status='blocked' WHERE version_id=(SELECT content_version FROM content_catalog_links WHERE asset_version=?) AND purpose='display'`).bind(uploaded.versionId).run()
 const revoked=await (await request()).json() as typeof initial
 expect(revoked.assets[0]).toMatchObject({published:false,imageAnalysis:false})
})
