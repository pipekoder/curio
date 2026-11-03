// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {articleEvidenceForPrompt} from '../worker/article-evidence'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import {ARTICLE_CONTRACT_VERSION,type EditorialArticleEdition} from '../shared/editorial-articles'
import {editorialDimensions,EDITORIAL_STANDARD_VERSION} from '../shared/editorial-standard'
import {validateArticleEdition} from '../worker/editorial-articles'
import {editorialApi} from '../worker/editorial'
import {editorialArticlePool,ArticlePoolError,reportArticlePoolFailure} from '../worker/editorial-article-pool'
import {runClassification,AssetAnalysisError} from '../worker/asset-classifier'

vi.mock('../worker/editorial-article-pool',async importOriginal=>({...await importOriginal<typeof import('../worker/editorial-article-pool')>(),editorialArticlePool:vi.fn()}))
vi.mock('../worker/asset-classifier',async importOriginal=>({...await importOriginal<typeof import('../worker/asset-classifier')>(),runClassification:vi.fn()}))
const origin='https://curio.example'
const version=(n:number)=>`version-${n.toString(16).padStart(64,'0')}`
const data=Array.from({length:24},(_,i)=>{
  const assetId=version(i+1),brandName=i%2?'Second Studio':'First Studio'
  return {item:{id:`catalog-${i}`,image:{id:assetId},category:'home',lifestyleTags:['Scandinavian']} as CatalogItem,
    context:{assetId,versionId:assetId,imageSha256:'a'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',observations:{subjects:['seating'],materialAppearance:[],environments:[],relationships:[]},uncertainty:'appearance_not_verified_fact'} as VisualContext,
    sources:[{id:`${assetId}:brand_name`,assetId,kind:'brand_name',label:'Brand name',value:brandName,authority:'owner_supplied_mockup',source:'content_studio'},{id:`${assetId}:product_description`,assetId,kind:'product_description',label:'Product description',value:'An owner described seating study.',authority:'owner_supplied_mockup',source:'content_studio'}] as EditorialSource[]}
})
const items=data.map(row=>row.item),contexts=data.map(row=>row.context),sources=data.flatMap(row=>row.sources)
function edition(size=3,per=3):EditorialArticleEdition{
  return {version:ARTICLE_CONTRACT_VERSION,title:'The Practice of Attention',deck:'How distinct rooms invite different ways of living.',articles:Array.from({length:size},(_,i)=>{
    const selected=data.slice(i*per,(i+1)*per)
    return {id:`article-${selected[0].item.image.id}`,heroAssetId:selected[0].item.image.id,headline:`A Room for ${i+1}`,deck:'A distinct editorial angle.',narrative:'These owner described objects invite a different way to read the room.',images:selected.map(row=>({catalogId:row.item.id,assetId:row.item.image.id,brandName:row.sources[0].value,brandSourceId:row.sources[0].id,productSourceIds:[row.sources[1].id]})),sourceIds:selected.flatMap(row=>row.sources.map(source=>source.id))}
  })}
}
const preferences={interests:'Explore seating and everyday interiors',allocations:{home:100,fashion:0,travel:0},aesthetics:['Scandinavian'],mode:'Focused',consent:true}
function environment(overrides:Record<string,unknown>={}){
 const budget={idFromName:()=>({}),get:()=>({fetch:async(url:string)=>Response.json(url.endsWith('/reserve')?{allowed:true,reservationId:'r1'}:{ok:true})})}
 return {PUBLIC_APP_ORIGIN:origin,EDITORIAL_ARTICLES_ENABLED:'true',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',CATALOG_PUBLIC_ENABLED:'true',META_API_KEY:'fixture-only',META_SPARK_MODEL:'muse-spark-1.3',RATE_LIMIT_SALT:'fixture-salt-'.repeat(4),INFERENCE_BUDGET:budget,CATALOG_DB:{},MEDIA_BUCKET:{},...overrides} as never
}
const post=(overrides:Record<string,unknown>={},extra:Record<string,unknown>={})=>editorialApi.request(`${origin}/`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.9'},body:JSON.stringify({...preferences,editionFormat:ARTICLE_CONTRACT_VERSION,...extra})},environment(overrides))
const mockPool=(length=24)=>vi.mocked(editorialArticlePool).mockResolvedValue({items:items.slice(0,length),visualContexts:contexts.slice(0,length),sources:sources.filter(s=>items.slice(0,length).some(item=>item.image.id===s.assetId)),eligibleCount:length})
function review(value:EditorialArticleEdition,score=5,high=false){return {rubricVersion:EDITORIAL_STANDARD_VERSION,dimensions:Object.fromEntries(editorialDimensions.map(key=>[key,{score,reason:'Independent assessment against supplied evidence.',evidenceRefs:[`feature:${value.articles[0].heroAssetId}`]}])),magazineFeedback:'The edition is assessed.',featureFeedback:value.articles.map((article,i)=>({assetId:article.heroAssetId,strengths:[],issues:high&&i===0?[{severity:'high',code:'fact_integrity',evidenceRefs:[article.images[0].brandSourceId],instruction:'Remove the unsupported claim.'}]:[]})),revisionInstructions:high?['Remove the unsupported claim.']:[]}}
function provider(firstScore=5,finalScore=5,high=false){let calls=0;return vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++;const value=calls===1?edition(input.articleCount,input.catalog.length>=9?3:2):calls===2?review(input.edition,firstScore,high):calls===3?input.edition:review(input.edition,finalScore);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})})}
afterEach(()=>{vi.unstubAllGlobals();vi.mocked(editorialArticlePool).mockReset();vi.mocked(runClassification).mockReset()})

it('validates exactly three articles with two or three unique exact-version images',()=>{
 const three=edition();expect(validateArticleEdition(three,items,sources,contexts,3)).toEqual(three)
 const two=structuredClone(three);two.articles.forEach(article=>{article.images.pop();article.sourceIds.splice(-2)})
 expect(validateArticleEdition(two,items,sources,contexts,3).articles.every(article=>article.images.length===2)).toBe(true)
 const tooMany=structuredClone(three);tooMany.articles[0].images.push({catalogId:items[9].id,assetId:items[9].image.id,brandName:sources[18].value,brandSourceId:sources[18].id,productSourceIds:[sources[19].id]})
 expect(()=>validateArticleEdition(tooMany,items,sources,contexts,3)).toThrow()
 expect(()=>validateArticleEdition({...three,articles:three.articles.slice(0,2)},items,sources,contexts,2)).toThrow()
 expect(new Set(three.articles[0].images.map(image=>image.brandName)).size).toBe(2)
})
it('rejects wrong catalog joins, unsupported brand attribution, missing product evidence and reused images',()=>{
 for(const mutate of [(e:EditorialArticleEdition)=>{e.articles[0].images[0].catalogId='wrong'},(e:EditorialArticleEdition)=>{e.articles[0].images[0].brandName='Invented'},(e:EditorialArticleEdition)=>{e.articles[0].images[0].productSourceIds=[]},(e:EditorialArticleEdition)=>{e.articles[1].images[1]=e.articles[0].images[1]}]){
  const candidate=structuredClone(edition());mutate(candidate);expect(()=>validateArticleEdition(candidate,items,sources,contexts,8)).toThrow()
 }
 expect(()=>validateArticleEdition(edition(),items,sources,contexts.filter(context=>context.assetId!==items[0].image.id),8)).toThrow()
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
const prepared=(length:number,pendingVersionIds:string[])=>({items:items.slice(0,length),visualContexts:contexts.slice(0,length),sources:sources.slice(0,length*2),eligibleCount:length,
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
  vi.mocked(runClassification).mockRejectedValue(new AssetAnalysisError('inference_limit_reached',429))
  const response=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'A separate budget-limited preparation study'})
  expect(response.status).toBe(429)
  expect(await response.json()).toMatchObject({status:'unavailable',fallbackReason:'budget'})
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
  expect(a.interpretations[0]).toMatchObject({origin:'deterministic',status:'editorial_perspective',assetVersionId:items[0].image.id,sourceIds:[sources[0].id,sources[1].id]})
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
