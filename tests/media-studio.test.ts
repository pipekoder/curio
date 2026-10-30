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

vi.setConfig({testTimeout:20000,hookTimeout:20000})
let mf:Miniflare,db:D1Database,bucket:R2Bucket,store:MediaStore
const origin='https://curio.example.com'
beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 store=new MediaStore(db,bucket,origin)
})
afterEach(async()=>mf?.dispose())

it('persists exact R2 bytes, relationships and a permission-gated Reader publication without inference',async()=>{
 const bytes=readFileSync('public/editorial/discover/02_ceramic_vase.png'),file=new File([bytes],'northline-fold-chair.png',{type:'image/png'}),batchId=await store.createBatch('owner mockup batch')
 const uploaded=await store.upload(file,batchId)
 expect(uploaded).toMatchObject({filename:file.name,mimeType:'image/png',aiAvailable:true,readerAvailable:true})
 expect(new Uint8Array(await (await bucket.get(uploaded.r2Key))!.arrayBuffer())).toEqual(new Uint8Array(bytes))
 await expect(store.upload(file,batchId)).rejects.toThrow(/already/)
 const generic=await new D1AssetRetriever(db).retrieve({allocations:{home:100,fashion:0,travel:0},aesthetics:['Quiet Luxury'],tags:['mockup'],scope:'reader',publishedOnly:true,limit:10})
 expect(generic.items.map(item=>item.version_id)).not.toContain(uploaded.versionId)
 const imported=await store.import({batchId,sourceText:'fixture',brands:[{name:'Northline Studio',story:'Fictional owner mockup brand.'}],products:[{brand:'Northline Studio',name:'Fold Chair',description:'A fictional folded chair concept.',category:'home',materials:['textile appearance'],price:1250,currency:'USD',imageFilenames:[file.name],lifestyleTags:['Scandinavian']}],campaigns:[]})
 expect(imported.products).toHaveLength(1)
 const sources=await loadEditorialSources(db,[uploaded.versionId])
 expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({assetId:uploaded.versionId,kind:'brand_story',value:'Fictional owner mockup brand.',authority:'owner_supplied_mockup'}),expect.objectContaining({kind:'product_description',value:'A fictional folded chair concept.'})]))
 const listing=await store.list();expect(listing.media[0]).toMatchObject({image_type:'product',filename:file.name});expect(listing.inferenceTriggered).toBe(false)
 const published=await new CatalogPublications(db).list('',10,[uploaded.versionId]);expect(published.items).toHaveLength(1);expect(published.items[0]).toMatchObject({name:'Fold Chair',sourceType:'synthetic_concept',permissions:{display:{status:'approved'},aiAnalysis:{status:'approved'}}})
 expect((await db.prepare('SELECT COUNT(*) AS n FROM asset_analysis_jobs').first<{n:number}>())!.n).toBe(0)
 const permit=await resolveR2MediaPermit(db,uploaded.versionId);expect(permit).toMatchObject({sha256:uploaded.sha256,mime:'image/png'})
 const data=await readR2MediaData(bucket,permit!,new AbortController().signal);expect(data.startsWith('data:image/png;base64,')).toBe(true)
 const delivered=await publicMedia(new Request(`${origin}/api/media/${uploaded.versionId}`),{CATALOG_DB:db,MEDIA_BUCKET:bucket,PUBLIC_APP_ORIGIN:origin},uploaded.versionId);expect(delivered.status).toBe(200);expect(new Uint8Array(await delivered.arrayBuffer())).toEqual(new Uint8Array(bytes))
 const classify=vi.fn().mockResolvedValue({...mockUnderstanding(uploaded.versionId),imageSha256:uploaded.sha256})
 const classified=await runClassification({versionId:uploaded.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'test-key'} as never,'192.0.2.1',{reserve:vi.fn().mockResolvedValue({allowed:true,retryAfter:0}),classify})
 expect(classified).toMatchObject({origin:'meta',cached:false,inference:{attempted:true,reservedUnits:1}});expect(classify.mock.calls[0][2]).toMatch(/^data:image\/png;base64,/)
 const discovered=await new D1AssetRetriever(db).retrieve({allocations:{home:100,fashion:0,travel:0},aesthetics:['Scandinavian'],tags:['chair'],brandDiversity:true,serendipity:0,seed:'fold chair',scope:'reader',publishedOnly:true,limit:10});expect(discovered.items.map(item=>item.version_id)).toContain(uploaded.versionId)
 const ad=published.items[0],sam=vi.fn().mockResolvedValue({adId:ad.id,assetId:ad.image.id,width:ad.image.width,height:ad.image.height,model:'sam-3.1',source:'sam_detection',regions:[]})
 const decoded=await runDecoder({adId:ad.id,assetId:ad.image.id,detailId:'detail-0',consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,SAM_DECODER_ENABLED:'true',META_SAM_MODEL:'sam-3.1',META_API_KEY:'test-key'} as never,'192.0.2.1',{catalog:[],permits:{},reserve:vi.fn().mockResolvedValue({allowed:true,retryAfter:0}),sam,commentary:vi.fn()})
 expect(decoded.segmentation).toMatchObject({assetId:uploaded.versionId,source:'sam_detection'});expect(sam.mock.calls[0][0].imageDataUrl).toMatch(/^data:image\/png;base64,/)
 await store.remove(uploaded.versionId);expect(await bucket.get(uploaded.r2Key)).toBeNull();expect((await new CatalogPublications(db).list('',10,[uploaded.versionId])).items).toHaveLength(0);expect((await publicMedia(new Request(`${origin}/api/media/${uploaded.versionId}`),{CATALOG_DB:db,MEDIA_BUCKET:bucket,PUBLIC_APP_ORIGIN:origin},uploaded.versionId)).status).toBe(404)
})

it('fails closed before storage for invalid operator access and image content',async()=>{
 const token='test-only-private-token-more-than-32-characters',env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:bucket}
 const denied=await mediaApi.request(`${origin}/`,{headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'}},env);expect(denied.status).toBe(403)
 const fake=new File([new TextEncoder().encode('not an image')],'fake.png',{type:'image/png'});await expect(store.upload(fake)).rejects.toThrow(/between 32 bytes|do not match/)
 expect((await bucket.list()).objects).toHaveLength(0)
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
