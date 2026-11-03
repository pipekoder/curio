// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {articleEvidenceForPrompt} from '../worker/article-evidence'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialPreferences} from '../shared/editorial'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_SINGLE_CONTRACT_VERSION,type EditorialArticleEdition} from '../shared/editorial-articles'
import {editorialDimensions,EDITORIAL_STANDARD_VERSION} from '../shared/editorial-standard'
import {articleEditorialResponse,validateArticleEdition} from '../worker/editorial-articles'
import {editorialApi} from '../worker/editorial'
import {editorialArticlePool,ArticlePoolError,reportArticlePoolFailure} from '../worker/editorial-article-pool'
import {runClassification,AssetAnalysisError} from '../worker/asset-classifier'
import {articleChiefTimeoutMs} from '../worker/article-provider-timeout'

vi.mock('../worker/editorial-article-pool',async importOriginal=>({...await importOriginal<typeof import('../worker/editorial-article-pool')>(),editorialArticlePool:vi.fn()}))
vi.mock('../worker/asset-classifier',async importOriginal=>({...await importOriginal<typeof import('../worker/asset-classifier')>(),runClassification:vi.fn()}))
const origin='https://curio.example'
const version=(n:number)=>`version-${n.toString(16).padStart(64,'0')}`
const data=Array.from({length:24},(_,i)=>{
  const assetId=version(i+1),brandName=i%2?'Second Studio':'First Studio'
  return {item:{id:`catalog-${i}`,image:{id:assetId},category:'home',lifestyleTags:['Scandinavian']} as CatalogItem,
    context:{assetId,versionId:assetId,imageSha256:'a'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',observations:{subjects:['seating'],materialAppearance:[],environments:[],relationships:[]},uncertainty:'appearance_not_verified_fact'} as VisualContext,
    sources:[{id:`${assetId}:brand_name`,assetId,kind:'brand_name',label:'Brand name',value:brandName,authority:'owner_supplied_mockup',source:'content_studio'},{id:`${assetId}:product_name`,assetId,kind:'product_name',label:'Product name',value:'Seating Study',authority:'owner_supplied_mockup',source:'content_studio'},{id:`${assetId}:product_description`,assetId,kind:'product_description',label:'Product description',value:'An owner described seating study.',authority:'owner_supplied_mockup',source:'content_studio'}] as EditorialSource[]}
})
const items=data.map(row=>row.item),contexts=data.map(row=>row.context),sources=data.flatMap(row=>row.sources)
function edition(size=3,per=3):EditorialArticleEdition{
  return {version:ARTICLE_CONTRACT_VERSION,title:'The Practice of Attention',deck:'How distinct rooms invite different ways of living.',articles:Array.from({length:size},(_,i)=>{
    const selected=data.slice(i*per,(i+1)*per)
    return {id:`article-${selected[0].item.image.id}`,heroAssetId:selected[0].item.image.id,headline:`A Room for ${i+1}`,deck:'A distinct editorial angle.',narrative:'These owner described objects invite a different way to read the room.',images:selected.map(row=>({catalogId:row.item.id,assetId:row.item.image.id,brandName:row.sources[0].value,brandSourceId:row.sources[0].id,productSourceIds:[row.sources[2].id]})),sourceIds:selected.flatMap(row=>row.sources.map(source=>source.id))}
  })}
}
const preferences:EditorialPreferences={interests:'Explore seating and everyday interiors',allocations:{home:100,fashion:0,travel:0},aesthetics:['Scandinavian'],mode:'Focused',consent:true}
function environment(overrides:Record<string,unknown>={}){
 const budget={idFromName:()=>({}),get:()=>({fetch:async(url:string)=>Response.json(url.endsWith('/reserve')?{allowed:true,reservationId:'r1'}:{ok:true})})}
 return {PUBLIC_APP_ORIGIN:origin,EDITORIAL_ARTICLES_ENABLED:'true',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',CATALOG_PUBLIC_ENABLED:'true',META_API_KEY:'fixture-only',META_SPARK_MODEL:'muse-spark-1.3',RATE_LIMIT_SALT:'fixture-salt-'.repeat(4),INFERENCE_BUDGET:budget,CATALOG_DB:{},MEDIA_BUCKET:{},...overrides} as never
}
const post=(overrides:Record<string,unknown>={},extra:Record<string,unknown>={})=>editorialApi.request(`${origin}/`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.9'},body:JSON.stringify({...preferences,editionFormat:ARTICLE_CONTRACT_VERSION,...extra})},environment(overrides))
const mockPool=(length=24)=>vi.mocked(editorialArticlePool).mockResolvedValue({items:items.slice(0,length),visualContexts:contexts.slice(0,length),sources:sources.filter(s=>items.slice(0,length).some(item=>item.image.id===s.assetId)),eligibleCount:length})
function review(value:EditorialArticleEdition,score=5,high=false){return {rubricVersion:EDITORIAL_STANDARD_VERSION,dimensions:Object.fromEntries(editorialDimensions.map(key=>[key,{score,reason:'Independent assessment against supplied evidence.',evidenceRefs:[`feature:${value.articles[0].heroAssetId}`]}])),magazineFeedback:'The edition is assessed.',featureFeedback:value.articles.map((article,i)=>({assetId:article.heroAssetId,strengths:[],issues:high&&i===0?[{severity:'high',code:'fact_integrity',evidenceRefs:[article.images[0].brandSourceId],instruction:'Remove the unsupported claim.'}]:[]})),revisionInstructions:high?['Remove the unsupported claim.']:[]}}
function provider(firstScore=5,finalScore=5,high=false){let calls=0;return vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++;const value=calls===1?edition(input.articleCount,input.catalog.length>=9?3:2):calls===2?review(input.edition,firstScore,high):calls===3?input.edition:review(input.edition,finalScore);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})})}
function singleProvider(){const base=provider();let calls=0;return vi.fn(async(url:string,init:RequestInit)=>{const response=await base(url,init) as Response;calls++;if(calls!==1)return response;const raw=await response.json() as {choices:{message:{content:string}}[]};const value={...JSON.parse(raw.choices[0].message.content),version:ARTICLE_SINGLE_CONTRACT_VERSION};return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})})}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(editorialArticlePool).mockReset();vi.mocked(runClassification).mockReset()})

it('validates exactly three articles with two or three unique exact-version images',()=>{
 const three=edition();expect(validateArticleEdition(three,items,sources,contexts,3)).toEqual(three)
 const two=structuredClone(three);two.articles.forEach(article=>{article.images.pop();article.sourceIds.splice(-3)})
 expect(validateArticleEdition(two,items,sources,contexts,3).articles.every(article=>article.images.length===2)).toBe(true)
 const tooMany=structuredClone(three);tooMany.articles[0].images.push({catalogId:items[9].id,assetId:items[9].image.id,brandName:sources[27].value,brandSourceId:sources[27].id,productSourceIds:[sources[29].id]})
 expect(()=>validateArticleEdition(tooMany,items,sources,contexts,3)).toThrow()
 expect(()=>validateArticleEdition({...three,articles:three.articles.slice(0,2)},items,sources,contexts,2)).toThrow()
 expect(new Set(three.articles[0].images.map(image=>image.brandName)).size).toBe(2)
})
it('rejects wrong catalog joins, unsupported brand attribution and reused images while allowing optional product citations',()=>{
 for(const mutate of [(e:EditorialArticleEdition)=>{e.articles[0].images[0].catalogId='wrong'},(e:EditorialArticleEdition)=>{e.articles[0].images[0].brandName='Invented'},(e:EditorialArticleEdition)=>{e.articles[1].images[1]=e.articles[0].images[1]}]){
  const candidate=structuredClone(edition());mutate(candidate);expect(()=>validateArticleEdition(candidate,items,sources,contexts,3)).toThrow()
 }
 const withoutProductCitations=edition();withoutProductCitations.articles[0].images[0].productSourceIds=[]
 withoutProductCitations.articles[0].sourceIds=withoutProductCitations.articles[0].sourceIds.filter(id=>id!==data[0].sources[2].id)
 expect(validateArticleEdition(withoutProductCitations,items,sources,contexts,3).articles[0].images[0].productSourceIds).toEqual([])
 expect(()=>validateArticleEdition(edition(),items,sources,contexts.filter(context=>context.assetId!==items[0].image.id),3)).toThrow()
})
it('keeps the public contract on pool failure while logging stage and correlation id',async()=>{
  const logged:unknown[][]=[]
  const sink=console.error
  console.error=(...args:unknown[])=>{logged.push(args)}
  try{
    vi.mocked(editorialArticlePool).mockRejectedValueOnce(new ArticlePoolError('sources',new Error('D1_ERROR: no such table: media_products')))
    const result=await post()
    expect(result.status).toBe(503)
    expect(await result.json()).toEqual({format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'unavailable',fallbackReason:'catalog_unavailable'})
    const requestId=result.headers.get('X-Curio-Request-Id')
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    const record=JSON.parse(String(logged[0][0]))
    expect(record).toMatchObject({event:'article_pool_failure',requestId,stage:'sources',code:'d1'})
    // Structured validation detail carries paths and codes, never values.
    const {z}=await import('zod')
    const parsed=z.string().max(5).safeParse('secret-value-123')
    if(parsed.success)throw Error('fixture must fail validation')
    reportArticlePoolFailure('req-fixture',new ArticlePoolError('verify',parsed.error))
    const redacted=JSON.parse(String(logged[1][0]))
    expect(redacted).toMatchObject({event:'article_pool_failure',requestId:'req-fixture',stage:'verify',code:'validation'})
    expect(String(redacted.detail)).not.toContain('secret-value-123')
  }finally{console.error=sink}
})
it('is default-off, retains the ordinary endpoint, and reports insufficient content without inference',async()=>{
 mockPool(5);expect((await post({EDITORIAL_ARTICLES_ENABLED:'false'})).status).toBe(503)
 const result=await post();expect(result.status).toBe(409);expect(await result.json()).toMatchObject({source:'deterministic',status:'insufficient_content',requiredImages:6,eligibleImages:5})
 expect(editorialArticlePool).toHaveBeenCalledTimes(1)
})
it('uses one four-unit reservation for Lite Chief and independent Reviewer and separates the Hybrid chief model',async()=>{
 mockPool();const send=provider();vi.stubGlobal('fetch',send)
 const lite=await (await post()).json() as Record<string,unknown>
 expect(lite).toMatchObject({source:'meta',retrieval:'d1',generation:{chiefEditorModel:'muse-spark-1.3',reviewerModel:'muse-spark-1.3'},inference:{reservedUnits:4,attempted:true}})
 expect((lite.articleEdition as EditorialArticleEdition).articles).toHaveLength(3)
 expect(send).toHaveBeenCalledTimes(2)
 expect((await post({EDITORIAL_HYBRID_ENABLED:'true',EDITORIAL_WONDER_PROVIDER_VERIFIED:'true',META_WONDER_MODEL:'muse-wonder-1.0'},{editorialMode:'hybrid'})).status).toBe(200)
 expect(JSON.parse(String(send.mock.calls[2][1].body)).model).toBe('muse-wonder-1.0')
})
it('uses a bounded 60-second Chief timeout for both one- and three-story editions without lengthening Reviewer calls',async()=>{
 mockPool(9)
 const originalTimeout=AbortSignal.timeout
 const limits:number[]=[]
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{limits.push(ms);return originalTimeout(ms===60000?80:ms===20000?20:ms)})
 for(const count of [1,3] as const){
  const base=count===1?singleProvider():provider()
  const send=vi.fn(async(url:string,init:RequestInit)=>{
   if(send.mock.calls.length===1){
    await new Promise(resolve=>setTimeout(resolve,40))
    if((init.signal as AbortSignal).aborted)throw (init.signal as AbortSignal).reason
   }
   return base(url,init)
  })
  vi.stubGlobal('fetch',send)
  const result=await post({}, {interests:`Delayed ${count} article Chief Editor test`,...(count===1?{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION}:{})})
  expect(await result.json()).toMatchObject({source:'meta',inference:{attempted:true,reservedUnits:4}})
  expect(send).toHaveBeenCalledTimes(2)
 }
 expect(limits.filter(ms=>ms===60000)).toHaveLength(2)
 expect(limits.filter(ms=>ms===20000)).toHaveLength(2)
 expect(limits.filter(ms=>ms===150000)).toHaveLength(2)
})
it('reports a bounded Chief provider timeout without calling Reviewer or refunding accepted units',async()=>{
 mockPool(6)
 const originalTimeout=AbortSignal.timeout
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>originalTimeout(ms===60000?25:ms))
 const send=vi.fn(async(_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
  const signal=init.signal as AbortSignal
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true})
 }))
 vi.stubGlobal('fetch',send)
 const response=await post({}, {interests:'Bounded delayed Chief Editor timeout test'})
 expect(await response.json()).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code:'provider_timeout'},inference:{attempted:true,reservedUnits:4}})
 expect(send).toHaveBeenCalledOnce()
})
it('rejects unsafe Chief timeout settings before reserving or calling Meta',async()=>{
 expect(articleChiefTimeoutMs({} as never)).toBe(60000)
 expect(articleChiefTimeoutMs({ARTICLE_CHIEF_TIMEOUT_MS:'45000'} as never)).toBe(45000)
 for(const value of ['0','19999','60001','abc','20.5'])expect(()=>articleChiefTimeoutMs({ARTICLE_CHIEF_TIMEOUT_MS:value} as never)).toThrow()
 mockPool(6)
 const send=provider();vi.stubGlobal('fetch',send)
 const response=await post({ARTICLE_CHIEF_TIMEOUT_MS:'90000'})
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({fallbackReason:'configuration'})
 expect(send).not.toHaveBeenCalled()
})
it('reports accepted non-tester reservation and safe stage-specific provider failures',async()=>{
 mockPool(6)
 const budget={idFromName:()=>({}),get:()=>({fetch:async()=>Response.json({allowed:true,retryAfter:0})})}
 const original=console.error,records:string[]=[]
 console.error=(message:unknown)=>{records.push(String(message))}
 try{
  for(const [name,send,code] of [
   ['HTTP',vi.fn(async()=>new Response('private provider detail',{status:503})),'provider_http'],
   ['context',vi.fn(async()=>new Response('private provider detail',{status:413})),'context_limit'],
   ['transport',vi.fn(async()=>{throw new TypeError('private network detail')}),'provider_transport'],
   ['timeout',vi.fn(async()=>{throw new DOMException('private timeout detail','TimeoutError')}),'provider_timeout'],
   ['envelope',vi.fn(async()=>Response.json({choices:[]})),'provider_response'],
   ['JSON',vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{private'}}]})),'response_json'],
   ['schema',vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({secret:'private evidence'})}}]})),'response_schema'],
  ] as const){
   vi.stubGlobal('fetch',send)
   const response=await post({INFERENCE_BUDGET:budget},{interests:`Distinct ${name} failure study`})
   const body=await response.json() as Record<string,unknown>
   expect(body).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code},inference:{attempted:true,reservedUnits:4}})
   expect(response.headers.get('X-Curio-Request-Id')).toBe(body.requestId)
   expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
   expect(JSON.stringify(body)).not.toContain('private')
  }
  expect(records).toHaveLength(7)
  expect(records.every(record=>!record.includes('private'))).toBe(true)
 }finally{console.error=original}
})
it('distinguishes Chief structural validation from Reviewer schema and reference validation',async()=>{
 mockPool(6)
 for(const [name,second,stage,code] of [
  ['structure',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...edition(3,2),articles:edition(3,2).articles.map((article,i)=>i?article:{...article,images:article.images.map((image,j)=>j?image:{...image,catalogId:'wrong'})})})}}]}),'chief_editor','image_identity'],
  ['identitySchema',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...edition(3,2),articles:edition(3,2).articles.map((article,i)=>i?article:{...article,heroAssetId:version(7)})})}}]}),'chief_editor','image_identity_schema'],
  ['reviewSchema',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]}),'reviewer','response_schema'],
  ['reviewReferences',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...review(edition(3,2)),featureFeedback:review(edition(3,2)).featureFeedback.map((row,i)=>i?row:{...row,assetId:version(99)})})}}]}),'reviewer','review_validation'],
 ] as const){
  let calls=0
  const first=provider()
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{calls++;return calls===1&&name!=='structure'&&name!=='identitySchema'?first(url,init):second()}))
  const response=await post({}, {interests:`Distinct ${name} validation study`})
  expect(await response.json()).toMatchObject({fallbackReason:'provider_or_validation',validationDiagnostic:{stage,code},inference:{reservedUnits:4}})
 }
})
it('identifies Reviewer, Revision and Confirmation failures without publishing an unapproved edition',async()=>{
 mockPool(6)
 for(const [failedCall,expectedStage] of [[2,'reviewer'],[3,'revision'],[4,'confirmation']] as const){
  const successful=provider(3,5)
  let calls=0
  const send=vi.fn(async(url:string,init:RequestInit)=>{calls++;return calls===failedCall?new Response('private provider response',{status:503}):successful(url,init)})
  vi.stubGlobal('fetch',send)
  const response=await post({}, {interests:`Independent ${expectedStage} failure study`})
  expect(await response.json()).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:expectedStage,code:'provider_http'},inference:{attempted:true,reservedUnits:4}})
  expect(send).toHaveBeenCalledTimes(failedCall)
 }
})
it('requires final independent confirmation after revision and falls back if that review fails',async()=>{
 mockPool();const send=provider(3,1);vi.stubGlobal('fetch',send)
 const result=await (await post({}, {interests:'A separate confirmation-failure investigation of living spaces'})).json() as Record<string,unknown>
 expect(result).toMatchObject({source:'deterministic',status:'fallback',fallbackReason:'editorial_rejected',inference:{reservedUnits:4,attempted:true}})
 expect(send).toHaveBeenCalledTimes(4)
})
it('rejects missing consent or AI flags before paid calls',async()=>{
 mockPool();const send=provider();vi.stubGlobal('fetch',send)
 expect((await post({}, {consent:false})).status).toBe(403)
 expect((await post({EDITORIAL_REVIEW_ENABLED:'false'})).status).toBe(503)
 expect(send).not.toHaveBeenCalled()
})
it('discloses the exact caller limit without model calls or global usage leakage',async()=>{
 mockPool(6)
 const send=provider();vi.stubGlobal('fetch',send)
 const denial={limitType:'global_daily',limit:100,used:100,remaining:0,requestedUnits:4,measure:'units',retryAfterSeconds:1200,resetAt:'2026-11-02T00:00:00.000Z'}
 const budget={idFromName:()=>({}),get:()=>({fetch:async()=>Response.json({allowed:false,denial,retryAfter:1200})})}
 const response=await post({INFERENCE_BUDGET:budget})
 expect(response.status).toBe(200)
 const body=await response.json() as Record<string,unknown>
 expect(body).toMatchObject({source:'deterministic',status:'fallback',fallbackReason:'budget',budget:{limitType:'global_daily',remaining:0,requestedUnits:4},inference:{attempted:false,reservedUnits:0}})
 expect(body.budget).not.toHaveProperty('used')
 expect(body.budget).not.toHaveProperty('limit')
 expect(send).not.toHaveBeenCalled()
})
function preparationDb(){
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec('CREATE TABLE asset_versions(id TEXT PRIMARY KEY)')
 sqlite.exec(readFileSync('migrations/0007_article_edition_jobs.sql','utf8'))
 for(const item of items)sqlite.prepare('INSERT INTO asset_versions(id) VALUES(?)').run(item.image.id)
 const db={prepare:(sql:string)=>({bind:(...params:unknown[])=>({
  first:async()=>sqlite.prepare(sql).get(...params as (string|number)[])??null,
  all:async()=>({results:sqlite.prepare(sql).all(...params as (string|number)[])}),
  run:async()=>({meta:{changes:sqlite.prepare(sql).run(...params as (string|number)[]).changes}}),
 })})}
 return {sqlite,db}
}
const prepared=(length:number,pendingVersionIds:string[])=>({items:items.slice(0,length),visualContexts:contexts.slice(0,length),sources:sources.slice(0,length*3),eligibleCount:length,
 preparation:{pendingVersionIds,processing:0,failed:0,rankedCount:20,evaluatedCount:20,exclusions:{relevance_or_window:0,publication:0,permissions:0,metadata:0,sources:0,image_integrity:0,observations:pendingVersionIds.length,analysis_processing:0,analysis_failed:0,invalid_observations:0,duplicate_image:0}}})
it('analyzes two authorized versions concurrently, then activates the reviewed edition at six',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  const sqlQueries:string[]=[]
  const prepare=db.prepare
  db.prepare=(sql:string)=>{sqlQueries.push(sql);return prepare(sql)}
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  let inFlight=0,maxConcurrent=0
  vi.mocked(runClassification).mockImplementation(async()=>{inFlight++;maxConcurrent=Math.max(maxConcurrent,inFlight);await gate;inFlight--;return {origin:'meta',cached:false} as never})
  vi.mocked(editorialArticlePool).mockResolvedValueOnce(prepared(4,[version(5),version(6)]))
   .mockResolvedValueOnce(prepared(6,[])).mockResolvedValueOnce(prepared(6,[]))
   .mockResolvedValueOnce(prepared(6,[])).mockResolvedValueOnce(prepared(5,[]))
  const waiting=post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  await vi.waitFor(()=>expect(maxConcurrent).toBe(2))
  const beforePoll=sqlQueries.length,beforePool=vi.mocked(editorialArticlePool).mock.calls.length
  const poll=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  expect(poll.status).toBe(202)
  expect(sqlQueries.slice(beforePoll)).toEqual(['SELECT * FROM article_edition_jobs WHERE id=?'])
  expect(vi.mocked(editorialArticlePool).mock.calls.length).toBe(beforePool)
  release()
  const first=await waiting
  expect(first.status).toBe(202)
  expect(await first.json()).toMatchObject({status:'preparing',eligibleImages:6,preparation:{outcome:'evidence_ready',retryAfterMs:0}})
  expect(runClassification).toHaveBeenCalledTimes(2)
  const send=provider();vi.stubGlobal('fetch',send)
  const second=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  expect(second.status).toBe(200)
  const secondBody=await second.json();expect(secondBody).toMatchObject({source:'meta',format:ARTICLE_CONTRACT_VERSION})
  expect(send).toHaveBeenCalledTimes(2)
  const chiefInput=JSON.parse(JSON.parse(String(send.mock.calls[0][1].body)).messages[1].content)
  const reviewerInput=JSON.parse(JSON.parse(String(send.mock.calls[1][1].body)).messages[1].content)
  expect(chiefInput.editorialEvidence.version).toBe('curio-article-evidence-v1')
  expect(chiefInput.editorialEvidence.interpretations).toHaveLength(6)
  expect(reviewerInput.editorialEvidence).toEqual(chiefInput.editorialEvidence)
  expect(chiefInput.visualContexts[0].assetId).toBe(chiefInput.editorialEvidence.interpretations[0].assetVersionId)
  const job=sqlite.prepare('SELECT state,result_json FROM article_edition_jobs').get() as {state:string;result_json:string}
  expect(job.state).toBe('completed')
  expect(JSON.parse(job.result_json).articleEdition.articles).toHaveLength(3)
  const reused=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  expect(await reused.json()).toMatchObject({source:'meta',cached:true})
  expect(sqlQueries.slice(-1)).toEqual(['SELECT * FROM article_edition_jobs WHERE id=?'])
  expect(send).toHaveBeenCalledTimes(2)
  const revoked=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  expect(revoked.status).toBe(409)
  expect(await revoked.json()).toMatchObject({source:'deterministic',fallbackReason:'evidence_changed'})
  expect(send).toHaveBeenCalledTimes(2)
 }finally{sqlite.close()}
})
it('does not retry failed analysis, and keeps budget refusal explicit',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(5,[version(6)]))
  expect((await post()).status).toBe(409)
  expect(runClassification).not.toHaveBeenCalled()
  const denied=new AssetAnalysisError('inference_limit_reached',429)
  denied.budget={limitType:'article_preparation_hourly',limit:16,used:16,remaining:0,requestedUnits:1,measure:'units',retryAfterSeconds:1200}
  vi.mocked(runClassification).mockRejectedValue(denied)
  const response=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'A separate budget-limited preparation study'})
  expect(response.status).toBe(429)
  expect(await response.json()).toMatchObject({status:'unavailable',fallbackReason:'budget',budget:{limitType:'article_preparation_hourly',limit:16,used:16,remaining:0}})
  expect(runClassification).toHaveBeenCalledOnce()
 }finally{sqlite.close()}
})
it('uses the runtime preparation concurrency limit without exceeding the six-image threshold',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(2,[version(3),version(4),version(5),version(6),version(7)]))
  vi.mocked(runClassification).mockResolvedValue({origin:'meta',cached:false} as never)
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db,ARTICLE_PREP_MAX_PER_HOUR:'24',ARTICLE_PREP_MAX_PER_DAY:'48',ARTICLE_PREP_WINDOW_LIMIT:'4',ARTICLE_PREP_WINDOW_SECONDS:'16',ARTICLE_PREP_CONCURRENCY:'4'}
  const response=await post(config,{interests:'Four concurrent room studies'})
  expect(response.status).toBe(202)
  expect(await response.json()).toMatchObject({status:'preparing',preparation:{retryAfterMs:16000}})
  expect(runClassification).toHaveBeenCalledTimes(4)
  const invalid=await post({...config,ARTICLE_PREP_CONCURRENCY:'5'},{interests:'Invalid preparation policy'})
  expect(invalid.status).toBe(503)
  expect(await invalid.json()).toMatchObject({fallbackReason:'configuration'})
  expect(runClassification).toHaveBeenCalledTimes(4)
 }finally{sqlite.close()}
})
it('caps simultaneous generation claims without blocking existing job status reads',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  const now=Date.now()
  for(let i=0;i<2;i++)sqlite.prepare(`INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,lease_until,created_at,updated_at) VALUES(?,?,?,'generating',?,?,?)`)
    .run(`other-${i}`,'other-ip','other-input',now+90_000,now,now)
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  const send=provider();vi.stubGlobal('fetch',send)
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
  const prompt={interests:'A new room investigation while two generations are active'}
  const waiting=await post(config,prompt)
  expect(waiting.status).toBe(202)
  expect(await waiting.json()).toMatchObject({preparation:{outcome:'waiting_for_capacity'}})
  expect(send).not.toHaveBeenCalled()
  // The two existing generations can still be read through their own jobs;
  // an expired generation no longer occupies a live slot.
  sqlite.prepare('UPDATE article_edition_jobs SET lease_until=? WHERE id=?').run(now-1,'other-0')
  const result=await post(config,prompt)
  expect(result.status).toBe(200)
  expect((await result.json() as {source:string}).source).toBe('meta')
  expect(send).toHaveBeenCalledTimes(2)
 }finally{sqlite.close()}
})
it('renews the D1 lease at generation claim and prevents pollers from duplicating a delayed Chief call',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const base=provider()
  const send=vi.fn(async(url:string,init:RequestInit)=>{await gate;return base(url,init)})
  vi.stubGlobal('fetch',send)
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
  const prompt={interests:'A delayed Chief Editor lease study'}
  const first=post(config,prompt)
  await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce())
  const row=sqlite.prepare('SELECT state,lease_until FROM article_edition_jobs').get() as {state:string;lease_until:number}
  expect(row.state).toBe('generating')
  expect(row.lease_until-Date.now()).toBeGreaterThan(180000)
  const poll=await post(config,prompt)
  expect(poll.status).toBe(202)
  expect(send).toHaveBeenCalledOnce()
  release()
  expect((await (await first).json() as {source:string}).source).toBe('meta')
  expect(send).toHaveBeenCalledTimes(2)
 }finally{sqlite.close()}
})
it('stores a timed-out generation as failed and does not repeat its paid call on the next poll',async()=>{
 const {sqlite,db}=preparationDb()
 const originalTimeout=AbortSignal.timeout
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>originalTimeout(ms===60000?25:ms))
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  const send=vi.fn(async(_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
   const signal=init.signal as AbortSignal
   signal.addEventListener('abort',()=>reject(signal.reason),{once:true})
  }))
  vi.stubGlobal('fetch',send)
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
  const prompt={interests:'A timed-out generation must not repeat'}
  const first=await post(config,prompt)
  expect(await first.json()).toMatchObject({fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code:'provider_timeout'},inference:{reservedUnits:4}})
  expect(sqlite.prepare('SELECT state FROM article_edition_jobs').get()).toMatchObject({state:'failed'})
  const again=await post(config,prompt)
  expect(await again.json()).toMatchObject({fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code:'provider_timeout'}})
  expect(send).toHaveBeenCalledOnce()
 }finally{sqlite.close()}
})
it('stores distinct source-linked perspectives for different curiosity prompts and reuses identical evidence',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  const queries:string[]=[]
  const prepare=db.prepare
  db.prepare=(sql:string)=>{queries.push(sql);return prepare(sql)}
  const pool=prepared(9,[])
  const a=await articleEvidenceForPrompt({CATALOG_DB:db} as never,{...preferences,interests:'Daily rituals around seating'} as never,pool)
  const b=await articleEvidenceForPrompt({CATALOG_DB:db} as never,{...preferences,interests:'Material culture around seating'} as never,pool)
  const beforeReuse=queries.length
  const again=await articleEvidenceForPrompt({CATALOG_DB:db} as never,{...preferences,interests:'Everyday ritual of seating'} as never,pool)
  expect(queries.slice(beforeReuse)).toHaveLength(1)
  expect(queries.slice(beforeReuse).every(sql=>sql.startsWith('SELECT'))).toBe(true)
  expect(a.interpretations).toHaveLength(9)
  expect(b.interpretations).toHaveLength(9)
  expect(a.interpretations[0].id).not.toBe(b.interpretations[0].id)
  expect(again).toEqual(a)
  expect((sqlite.prepare('SELECT COUNT(*) AS n FROM article_interpretations').get() as {n:number}).n).toBe(18)
  expect(a.interpretations[0]).toMatchObject({origin:'deterministic',status:'editorial_perspective',assetVersionId:items[0].image.id,sourceIds:[sources[0].id,sources[1].id,sources[2].id]})
 }finally{sqlite.close()}
})
it('stages a full 9-draft prompt within the D1 bound-variable limit',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  const inner=db as unknown as {prepare:(sql:string)=>{bind:(...params:unknown[])=>unknown}}
  const d1={prepare:(sql:string)=>({bind:(...params:unknown[])=>{if(params.length>100)throw Error('D1_ERROR: too many SQL variables');return inner.prepare(sql).bind(...params)}})}
  const pack=await articleEvidenceForPrompt({CATALOG_DB:d1} as never,{...preferences,interests:'Daily rituals around seating and craft'} as never,prepared(9,[]))
  expect(pack.interpretations).toHaveLength(9)
  expect((sqlite.prepare('SELECT COUNT(*) AS n FROM article_interpretations').get() as {n:number}).n).toBe(9)
 }finally{sqlite.close()}
})
it('re-serves the stored generation failure for a failed job instead of reporting insufficient content',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  const interests='A failed evidence investigation with a stored reason'
  vi.mocked(editorialArticlePool).mockResolvedValueOnce(prepared(5,[]))
  expect((await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests})).status).toBe(409)
  sqlite.prepare('UPDATE article_edition_jobs SET result_json=?').run(JSON.stringify({failure:{status:503,body:{format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'unavailable',fallbackReason:'evidence_unavailable'}}}))
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(7,[]))
  const second=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests})
  expect(second.status).toBe(503)
  expect(await second.json()).toMatchObject({status:'unavailable',fallbackReason:'evidence_unavailable'})
 }finally{sqlite.close()}
})
it('generates exactly one reviewed story from a three-image pool in single-article mode',async()=>{
  mockPool(3)
  const send=singleProvider();vi.stubGlobal('fetch',send)
  const result=await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})).json() as Record<string,unknown>
  expect(result).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta',retrieval:'d1',inference:{reservedUnits:4,attempted:true}})
  expect((result.articleEdition as {articles:unknown[]}).articles).toHaveLength(1)
  expect(send).toHaveBeenCalledTimes(2)
  const chiefInput=JSON.parse(JSON.parse(String(send.mock.calls[0][1].body)).messages[1].content)
  expect(chiefInput.articleCount).toBe(1)
  expect(chiefInput.catalog).toHaveLength(3)
  expect(String(send.mock.calls[0][1].body)).toContain('exactly one distinct article')
})
it('requires three eligible images for a single story without inference',async()=>{
  mockPool(2)
  const send=singleProvider();vi.stubGlobal('fetch',send)
  const result=await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
  expect(result.status).toBe(409)
  expect(await result.json()).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,status:'insufficient_content',requiredImages:3,eligibleImages:2})
  expect(send).not.toHaveBeenCalled()
})
it('validates a single story with the same structural safeguards',()=>{
  const one={...edition(1,3),version:ARTICLE_SINGLE_CONTRACT_VERSION}
  expect(validateArticleEdition(one,items,sources,contexts,1).articles).toHaveLength(1)
  expect(()=>validateArticleEdition(one,items,sources,contexts,3)).toThrow()
  expect(()=>validateArticleEdition(edition(3,3),items,sources,contexts,1)).toThrow()
  const duplicate=structuredClone(one);duplicate.articles[0].images[1]=duplicate.articles[0].images[0]
  expect(()=>validateArticleEdition(duplicate,items,sources,contexts,1)).toThrow()
})
it('keeps single-story and three-story jobs for the same prompt separate',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(5,[]))
    const send=singleProvider();vi.stubGlobal('fetch',send)
    const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
    const interests='A same-prompt study in one and three stories'
    const three=await post(config,{interests})
    expect(three.status).toBe(409)
    expect(await three.json()).toMatchObject({format:ARTICLE_CONTRACT_VERSION,requiredImages:6,eligibleImages:5})
    const one=await post(config,{interests,editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
    expect(one.status).toBe(200)
    const body=await one.json() as Record<string,unknown>
    expect(body).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta'})
    expect((body.articleEdition as {articles:unknown[]}).articles).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(2)
    const rows=sqlite.prepare('SELECT id,state FROM article_edition_jobs').all() as {id:string;state:string}[]
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(row=>row.id)).size).toBe(2)
    expect(rows.map(row=>row.state).sort()).toEqual(['completed','failed'])
  }finally{sqlite.close()}
})
it('reports chief and reviewer stage entries through the progress hook',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const seen:string[]=[]
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),preferences,'lite',undefined,3,stage=>{seen.push(stage)})
  expect(response.status).toBe(200)
  expect(seen).toEqual(['chief_editor','reviewer'])
})
it('reports revision and confirmation entries when review requests changes',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider(3,5))
  const seen:string[]=[]
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),{...preferences,interests:'A revision-forcing study in quiet interiors'},'lite',undefined,3,stage=>{seen.push(stage)})
  expect(response.status).toBe(200)
  expect(seen).toEqual(['chief_editor','reviewer','revision','confirmation'])
})
it('reports a null evidence summary when the direct path builds no pack',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const body=await (await post({})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'meta'})
  expect(body.evidence).toBeNull()
})
it('reports the built evidence count on prepared generations',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(9,[]))
    vi.stubGlobal('fetch',provider())
    const body=await (await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db})).json() as Record<string,unknown>
    expect(body).toMatchObject({source:'meta'})
    expect(body.evidence).toEqual({interpretations:9})
  }finally{sqlite.close()}
})
it('includes the reported generation stage on in-flight polls',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(5,[version(6)]))
    const first=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db})
    expect(first.status).toBe(202)
    sqlite.prepare(`UPDATE article_edition_jobs SET state='generating',lease_token='held',lease_until=?,result_json=?`)
      .run(Date.now()+60000,JSON.stringify({progress:{eligibleImages:5,remainingCandidates:1,processing:0},stage:'reviewer'}))
    const second=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db})
    expect(second.status).toBe(202)
    expect(await second.json()).toMatchObject({preparation:{outcome:'reviewing'},generationStage:'reviewer',eligibleImages:5})
  }finally{sqlite.close()}
})
