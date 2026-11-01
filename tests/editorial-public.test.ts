// @vitest-environment node
import {readFileSync} from 'node:fs'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import app from '../worker/index'
import {MediaStore} from '../worker/media-store'
import {runClassification,mockUnderstanding} from '../worker/asset-classifier'
import {editorialDimensions,EDITORIAL_STANDARD_VERSION} from '../shared/editorial-standard'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
const origin='https://curio.example.com'
let mf:Miniflare,db:D1Database,bucket:R2Bucket,store:MediaStore,ids:string[]
const reserve=vi.fn(async(_url:string,_init:RequestInit)=>{void _url;void _init;return Response.json({allowed:true,retryAfter:0})})
const budget={idFromName:vi.fn(()=>({})),get:vi.fn(()=>({fetch:reserve}))} as unknown as DurableObjectNamespace
const prefs={interests:'Explore the relationship between seating and light',aesthetics:['Scandinavian'],allocations:{home:100,fashion:0,travel:0},mode:'Focused',consent:true}
const env=()=>({CATALOG_DB:db,CATALOG_PUBLIC_ENABLED:'true',PUBLIC_APP_ORIGIN:origin,MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',META_API_KEY:'FAKE',META_SPARK_MODEL:'muse-spark-1.3',RATE_LIMIT_SALT:'test-only-high-entropy-salt-placeholder-32',INFERENCE_BUDGET:budget,MAGAZINE_MAX_CALLS:'20'})
const post=(overrides:Record<string,unknown>={},headers:Record<string,string>={},prompt=prefs.interests)=>app.request(`${origin}/api/editorial`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify({...prefs,interests:prompt})},{...env(),...overrides})

beforeEach(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
  db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database
  bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
  for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
  store=new MediaStore(db,bucket,origin)
  const files=['01_boucle_lounge_chair.png','02_ceramic_vase.png']
  const uploads=[]
  for(const name of files)uploads.push(await store.upload(new File([readFileSync(`public/editorial/discover/${name}`)],name,{type:'image/png'})))
  ids=uploads.map(upload=>upload.versionId)
  await store.import({sourceText:'Owner test fixture',brands:[{name:'Northline Studio',story:'Fictional owner mockup brand.'}],products:[{brand:'Northline Studio',name:'Room Study',description:'A fictional interior composition for editorial study.',category:'home',materials:[],imageFilenames:files,lifestyleTags:['Scandinavian']}],campaigns:[]})
  for(const upload of uploads)await runClassification({versionId:upload.versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'} as never,'192.0.2.1',{reserve:vi.fn(async()=>({allowed:true,retryAfter:0})),classify:vi.fn(async()=>({...mockUnderstanding(upload.versionId),imageSha256:upload.sha256,observations:{subjects:['seating' as const],materialAppearance:[],environments:[],relationships:['curve-and-space' as const]}}))})
  reserve.mockClear()
})
afterEach(async()=>{vi.unstubAllGlobals();reserve.mockClear();await mf?.dispose()})

function provider(decision:'PASS'|'REJECT'){
  let plan:Record<string,unknown>|null=null
  return vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
    if(String(body.messages[0].content).includes('independent AI Editorial Reviewer')){
      const features=(plan!.features as {assetId:string}[])
      const score=decision==='PASS'?5:1
      const review={rubricVersion:EDITORIAL_STANDARD_VERSION,dimensions:Object.fromEntries(editorialDimensions.map(d=>[d,{score,reason:'The narrative has been independently assessed against the supplied evidence.',evidenceRefs:[`feature:${features[0].assetId}`]}])),magazineFeedback:'An independent editorial assessment.',featureFeedback:features.map(f=>({assetId:f.assetId,strengths:[],issues:[]})),revisionInstructions:[]}
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(review)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
    }
    const assets=input.catalog as {catalogId:string;assetId:string;aestheticTags:string[]}[]
    const features=assets.slice(0,2).map((asset,index)=>({catalogId:asset.catalogId,assetId:asset.assetId,headline:index?'A Second View of Space':'Where Attention Begins',narrative:index?'A second composition changes the rhythm of attention across the room.':'The visible arrangement invites a closer look at the space around it.',observationKeys:['subjects.seating'],discoveryQuestion:'How does this arrangement change the way the surrounding space is read?',sourceIds:[input.factualSources.find((source:{assetId:string})=>source.assetId===asset.assetId).id],layout:index?'split':'hero',motion:'still',theme:asset.aestheticTags[0]}))
    plan={qualityVersion:3,title:'The Architecture of Attention',deck:'Two visual studies invite a closer look at space and attention.',features,connections:[{fromAssetId:features[0].assetId,toAssetId:features[1].assetId,thread:'A change in arrangement gives the second composition a different rhythm.'}]}
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
}

it('allows a consenting visitor to receive only independently reviewed published D1 content',async()=>{
  const send=provider('PASS');vi.stubGlobal('fetch',send)
  const result=await (await post()).json() as Record<string,unknown>
  expect(result).toMatchObject({source:'meta',retrieval:'d1',cached:false,inference:{attempted:true,reservedUnits:4}})
  expect(send).toHaveBeenCalledTimes(2)
  expect(reserve).toHaveBeenCalledOnce()
  expect(JSON.parse(String(reserve.mock.calls[0][1].body))).toMatchObject({units:4})
  expect((result.plan as {features:{assetId:string}[]}).features.map(f=>f.assetId)).toEqual(expect.arrayContaining(ids))
})

it('returns a disclosed fallback for rejected reviews and exhausted budgets',async()=>{
  const send=provider('REJECT');vi.stubGlobal('fetch',send)
  expect(await (await post({}, {},'Explore the seating in an independent editorial review')).json()).toMatchObject({source:'deterministic',retrieval:'d1',fallbackReason:'editorial_rejected',inference:{attempted:true,reservedUnits:4}})
  expect(send).toHaveBeenCalledTimes(2)
  reserve.mockResolvedValueOnce(Response.json({allowed:false,retryAfter:60}))
  expect(await (await post({}, {},'Study the objects through a different editorial angle')).json()).toMatchObject({source:'deterministic',fallbackReason:'budget',inference:{attempted:false,reservedUnits:0}})
  expect(send).toHaveBeenCalledTimes(2)
})

it('fails closed on missing review, public authorization, malformed pilot restriction or revoked content',async()=>{
  const send=provider('PASS');vi.stubGlobal('fetch',send)
  expect(await (await post({EDITORIAL_REVIEW_ENABLED:'false'})).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_authorization'})
  expect(await (await post({EDITORIAL_PUBLIC_AI_ENABLED:'false'})).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_authorization'})
  expect(await (await post({EDITORIAL_PILOT_VERSION_IDS:'invalid'})).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_allowlist'})
  await db.prepare(`UPDATE content_reviews SET status='blocked' WHERE version_id=(SELECT content_version FROM content_catalog_links WHERE asset_version=?) AND purpose='display'`).bind(ids[0]).run()
  expect(await (await post()).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  expect(send).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
})

it('does not infer from metadata-free or observation-free versions',async()=>{
  const send=provider('PASS');vi.stubGlobal('fetch',send)
  await db.prepare('DELETE FROM media_product_images WHERE version_id=?').bind(ids[0]).run()
  expect(await (await post()).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  expect(send).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
  await db.prepare('DELETE FROM asset_analysis_jobs WHERE version_id=?').bind(ids[1]).run()
  expect(await (await post()).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  expect(send).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
})

it('selects exact-version published R2 media outside the pinned pilot only when dynamic public mode is enabled',async()=>{
  const send=provider('PASS');vi.stubGlobal('fetch',send)
  const pinned=Array.from({length:6},(_,i)=>`version-${String(i+1).repeat(64)}`).join(',')
  expect(await (await post({EDITORIAL_PILOT_VERSION_IDS:pinned})).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  const result=await (await post({EDITORIAL_PILOT_VERSION_IDS:pinned,EDITORIAL_DYNAMIC_CATALOG_ENABLED:'true',MEDIA_BUCKET:bucket},{},'Study the visual relationship between seating and the quiet rituals of a room')).json() as {source:string;retrieval:string;plan:{features:{assetId:string}[]}}
  expect(result).toMatchObject({source:'meta',retrieval:'d1'})
  expect(result.plan.features.map(feature=>feature.assetId)).toEqual(expect.arrayContaining(ids))
  expect(send).toHaveBeenCalledTimes(2)
})

it('excludes missing R2 objects, revoked analysis and metadata-free images in dynamic mode',async()=>{
  const send=provider('PASS');vi.stubGlobal('fetch',send)
  const options={EDITORIAL_DYNAMIC_CATALOG_ENABLED:'true',MEDIA_BUCKET:bucket}
  const key=await db.prepare('SELECT r2_key FROM media_objects WHERE version_id=?').bind(ids[0]).first<{r2_key:string}>()
  await bucket.delete(key!.r2_key)
  expect(await (await post(options)).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  expect(send).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
  await db.prepare('DELETE FROM asset_analysis_jobs WHERE version_id=?').bind(ids[1]).run()
  expect(await (await post(options)).json()).toMatchObject({source:'deterministic',fallbackReason:'pilot_not_ready'})
  expect(send).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
})
