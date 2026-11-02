// @vitest-environment node
import {readFileSync} from 'node:fs'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import app from '../worker/index'
import {MediaStore} from '../worker/media-store'
import {runClassification,mockUnderstanding} from '../worker/asset-classifier'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
const origin='https://curio.test',token='operator-test-token-more-than-32-characters'
let mf:Miniflare,db:D1Database,bucket:R2Bucket,versionId:string
const env=()=>({CATALOG_DB:db,MEDIA_BUCKET:bucket,CATALOG_PUBLIC_ENABLED:'true',CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CULTURAL_INTELLIGENCE_V3_ENABLED:'true',CULTURAL_LONGFORM_ENABLED:'true',META_API_KEY:'TEST_ONLY',META_SPARK_MODEL:'muse-spark-1.3',RATE_LIMIT_SALT:'test-only-salt-placeholder-at-least-32',INFERENCE_BUDGET:{idFromName:()=>({}),get:()=>({fetch:async()=>Response.json({allowed:true,retryAfter:0,reservationId:'test-reservation'})})}})
const request=(path:string,method:'GET'|'POST',body?:unknown,auth=`Bearer ${token}`)=>app.request(`${origin}/api/operator/catalog${path}`,{method,headers:{Authorization:auth,Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},...(body?{body:JSON.stringify(body)}:{})},env() as never)

beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql','0005_sam_object_reviews.sql','0006_longform_jobs.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 const media=new MediaStore(db,bucket,origin),filename='02_ceramic_vase.png'
 const upload=await media.upload(new File([readFileSync(`public/editorial/discover/${filename}`)],filename,{type:'image/png'}));versionId=upload.versionId
 await media.import({sourceText:'Owner mockup',brands:[{name:'Test Studio',story:'A fictional design studio for a test.'}],products:[{brand:'Test Studio',name:'Vessel Study',description:'A fictional vessel study for a private editorial draft.',category:'home',materials:[],imageFilenames:[filename],lifestyleTags:['Scandinavian']}],campaigns:[]})
 await runClassification({versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'TEST'} as never,'192.0.2.1',{reserve:vi.fn(async()=>({allowed:true,retryAfter:0})),classify:vi.fn(async()=>({...mockUnderstanding(versionId),imageSha256:upload.sha256,observations:{subjects:['lighting' as const],materialAppearance:[],environments:[],relationships:[]}}))})
})
afterEach(async()=>{vi.unstubAllGlobals();await mf?.dispose()})

it('creates a private job from current D1/R2 facts, advances one mocked Muse step and hides it after revocation',async()=>{
 const body={consent:true,prompt:'Explore the rituals around a simple vessel',assetVersionIds:[versionId]}
 expect((await request('/cultural/articles','POST',body,'Bearer wrong')).status).toBe(403)
 const created=await request('/cultural/articles','POST',body)
 expect(created.status,await created.clone().text()).toBe(201)
 const initial=await created.json() as {id:string;phase:string}
 expect(initial).toMatchObject({id:expect.stringMatching(/^article-[a-f0-9]{64}$/),phase:'outline'})
 const outline={title:'Four Ways to Read an Everyday Vessel',thesis:'A grounded private article about how an ordinary vessel shapes different daily questions.',sections:Array.from({length:4},(_,index)=>({id:`section-${index+1}`,heading:`A Different Editorial Question ${index+1}`,purpose:`Examine another grounded aspect of this fictional vessel study ${index+1}.`,sourceIds:[`${versionId}:brand_name`] }))}
 const send=vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(outline)}}]}));vi.stubGlobal('fetch',send)
 const advanced=await request(`/cultural/articles/${initial.id}/advance`,'POST',{consent:true})
 expect(advanced.status).toBe(200)
 expect(await advanced.json()).toMatchObject({state:{phase:'sections',modelCalls:1}})
 expect(send).toHaveBeenCalledOnce()
 expect((await request(`/cultural/articles/${initial.id}`,'GET')).status).toBe(200)
 await db.prepare('DELETE FROM media_product_images WHERE version_id=?').bind(versionId).run()
 expect((await request(`/cultural/articles/${initial.id}`,'GET')).status).toBe(404)
 expect((await request(`/cultural/articles/${initial.id}/advance`,'POST',{consent:true})).status).toBe(409)
 expect(send).toHaveBeenCalledOnce()
})
