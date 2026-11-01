// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {MediaStore} from '../worker/media-store'
import {CatalogPublications} from '../worker/catalog-publications'
import {runDecoder} from '../worker/decoder'
import {SamObjectStore} from '../worker/sam-object-store'
import app from '../worker/index'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
const origin='https://curio.test',token='operator-test-token-at-least-32-characters'
let mf:Miniflare,db:D1Database,bucket:R2Bucket,media:MediaStore
beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql','0005_sam_object_reviews.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 media=new MediaStore(db,bucket,origin)
})
afterEach(async()=>mf.dispose())

it('stores one genuine-shaped detection pending review, reuses it, publishes only after review, and fails closed on revocation',async()=>{
 const file=new File([readFileSync('public/editorial/discover/02_ceramic_vase.png')],'chair.png',{type:'image/png'})
 const uploaded=await media.upload(file)
 const imported=await media.import({sourceText:'owner mockup',brands:[{name:'Test Studio',story:'A fictional studio.'}],products:[{brand:'Test Studio',name:'Chair Study',description:'A fictional seating study.',category:'home',materials:[],price:null,currency:null,imageFilenames:['chair.png'],lifestyleTags:['Scandinavian']}],campaigns:[]})
 const ad=(await new CatalogPublications(db).list('',10,[uploaded.versionId])).items[0]
 const sam=vi.fn(async()=>({adId:ad.id,assetId:ad.image.id,width:ad.image.width,height:ad.image.height,model:'sam-3.1' as const,source:'sam_detection' as const,regions:[{id:'sam-1',detailId:'detail-0',box:{x:.2,y:.3,width:.4,height:.3},confidence:.8,uncertainty:'model_estimate_not_identity' as const}]}))
 const input={adId:ad.id,assetId:ad.image.id,detailId:'detail-0',consent:true} as const
 const env={CATALOG_DB:db,MEDIA_BUCKET:bucket,SAM_DECODER_ENABLED:'true',META_SAM_MODEL:'sam-3.1',META_API_KEY:'TEST'} as never
 const deps={catalog:[],permits:{},reserve:vi.fn(async()=>({allowed:true,retryAfter:0})),sam,commentary:vi.fn()}
 const first=await runDecoder(input,env,'192.0.2.1',deps)
 expect(first).toMatchObject({reused:false,segmentation:{source:'sam_detection'}})
 const second=await runDecoder(input,env,'192.0.2.1',deps)
 expect(second).toMatchObject({reused:true,captureId:first.captureId})
 expect(sam).toHaveBeenCalledTimes(1)
 const objects=new SamObjectStore(db)
 expect((await objects.published(uploaded.versionId))?.regions).toEqual([])
 await expect(objects.review(first.captureId!,{regionId:'sam-1',status:'approved',expectedRevision:0,editorialDetail:'A reviewed visual composition, without a product identity.',productId:'product-unlinked',identityEvidence:'docs/TEST_ONLY.md'})).rejects.toThrow('not linked')
 const reviewed=await objects.review(first.captureId!,{regionId:'sam-1',status:'approved',expectedRevision:0,editorialDetail:'The visible form creates a quieter place to pause.'})
 expect(reviewed.status).toBe('approved')
 const request=()=>app.request(`${origin}/api/catalog/object-regions/${uploaded.versionId}`,{}, {CATALOG_PUBLIC_ENABLED:'true',CATALOG_DB:db} as never)
 expect(((await (await request()).json()) as {regions:unknown[]}).regions).toEqual([expect.objectContaining({box:{x:.2,y:.3,width:.4,height:.3},provenance:expect.objectContaining({origin:'sam_detection',reviewed:true}),product:null})])
 await objects.review(first.captureId!,{regionId:'sam-1',status:'approved',expectedRevision:1,editorialDetail:'The reviewed chair form supports a quieter place to pause.',productId:imported.products[0].id,identityEvidence:'docs/TEST_ONLY.md'})
 expect(((await (await request()).json()) as {regions:unknown[]}).regions).toEqual([expect.objectContaining({product:expect.objectContaining({id:imported.products[0].id,kind:'owner_mockup'})})])
 expect((await app.request(`${origin}/api/catalog/object-regions/${uploaded.versionId}`,{}, {CATALOG_PUBLIC_ENABLED:'false',CATALOG_DB:db} as never)).status).toBe(503)
 await objects.review(first.captureId!,{regionId:'sam-1',status:'blocked',expectedRevision:2})
 expect(((await (await request()).json()) as {regions:unknown[]}).regions).toEqual([])
 await media.remove(uploaded.versionId)
 expect((await request()).status).toBe(404)
 expect((await app.request(`${origin}/api/operator/catalog/object-regions/${first.captureId}/review`,{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',Authorization:'Bearer wrong'},body:'{}'},{CATALOG_DB:db,CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin} as never)).status).toBe(403)
})
