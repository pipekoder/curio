// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {articleEvidenceForPrompt} from '../worker/article-evidence'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialPreferences} from '../shared/editorial'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_SINGLE_CONTRACT_VERSION,type EditorialArticleEdition} from '../shared/editorial-articles'
import {editorialDimensions,EDITORIAL_STANDARD_VERSION} from '../shared/editorial-standard'
import {articleEditorialResponse,mergeRevisionProse,validateArticleEdition} from '../worker/editorial-articles'
import {hydrateChiefDraft} from '../worker/chief-draft'
import {editorialApi} from '../worker/editorial'
import {editorialArticlePool,ArticlePoolError,reportArticlePoolFailure} from '../worker/editorial-article-pool'
import {runClassification,AssetAnalysisError} from '../worker/asset-classifier'
import {ARTICLE_REVIEW_STEP_TIMEOUT_MS,articleChiefTimeoutMs,articleReviewTimeoutMs} from '../worker/article-provider-timeout'

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
const refOf=(assetId:string)=>'ABCDEFGHI'[items.findIndex(item=>item.image.id===assetId)]!
function toDraft(edition:EditorialArticleEdition){return {title:edition.title,deck:edition.deck,articles:edition.articles.map(article=>({headline:article.headline,deck:article.deck,narrative:article.narrative,culturalClaims:[] as {ref:string;narrativeText:string}[],images:article.images.map(image=>({ref:refOf(image.assetId),products:image.productSourceIds.map(id=>id.split(':').pop()!)}))}))}}
function toRevisionDraft(edition:EditorialArticleEdition){return {title:edition.title,deck:edition.deck,articles:edition.articles.map(article=>({id:article.id,headline:article.headline,deck:article.deck,narrative:article.narrative}))}}
function provider(firstScore=5,finalScore=5,high=false){let calls=0;return vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++;const value=calls===1?toDraft(edition(input.articleCount,input.catalog.length>=9?3:2)):calls===2?review(input.edition,firstScore,high):calls===3?toRevisionDraft(input.edition):review(input.edition,finalScore);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})})}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(editorialArticlePool).mockReset();vi.mocked(runClassification).mockReset()})

it('runs one V3 Chief plan, skips unrequested research, and retains the reviewed Single Story contract',async()=>{
 mockPool(3)
 const calls:string[]=[]
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
  calls.push(body.response_format.json_schema.name)
  const value=calls.length===1?{topic:'The everyday chair',angle:'How seating shapes daily rituals',argument:'Seating gives ordinary reflection a physical place.',selectedAssetIds:[version(1),version(2)],researchQuestions:[]}
   :calls.length===2?toDraft(edition(1,2))
   :calls.length===3?review(input.edition)
   :calls.length===4?toRevisionDraft(input.edition)
   :review(input.edition)
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
 })
 vi.stubGlobal('fetch',send)
 const result=await post({EDITORIAL_WORKFLOW_V3_ENABLED:'true'},{interests:'A V3 chair story without external history',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
 expect(result.status).toBe(200)
 expect(await result.json()).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta',researchReferences:[],inference:{attempted:true,reservedUnits:5}})
 expect(calls).toEqual(['curio_article_plan_v3','curio_article_v1','curio_articles_review_v1','curio_article_v1_revision','curio_articles_confirmation_v1'])
})

it('binds retrieved cultural evidence to a reviewed article and returns only its cited source',async()=>{
 mockPool(3)
 let museCalls=0
 const send=vi.fn(async(url:string,init:RequestInit)=>{
  if(url.includes('w/api.php'))return url.includes('list=search')
   ?Response.json({query:{search:[{title:'Bauhaus'}]}})
   :Response.json({query:{pages:{'1':{title:'Bauhaus',fullurl:'https://en.wikipedia.org/wiki/Bauhaus',extract:'Bauhaus was a German art school that combined crafts and the fine arts.'}}}})
  if(!url.includes('api.meta.ai'))return Response.json({objectIDs:[]})
  museCalls++
  const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
  let value:unknown
  if(museCalls===1)value={topic:'The everyday chair',angle:'Craft and domestic attention',argument:'A chair can connect everyday utility with design education.',selectedAssetIds:[version(1),version(2)],researchQuestions:[{question:'How did Bauhaus combine crafts and fine arts?',why:'A direct historical comparison deepens the angle.',query:'Bauhaus crafts fine arts',complex:false}]}
  else if(museCalls===2){
   const cited=(input.sources as (EditorialSource&{claimRef:string})[]).find(source=>source.source==='cultural_research')!
   const draftValue=toDraft(edition(1,2))
   draftValue.articles[0].narrative+=' Bauhaus was a German art school that combined crafts and the fine arts.'
   draftValue.articles[0].culturalClaims=[{ref:cited.claimRef,narrativeText:'Bauhaus was a German art school that combined crafts and the fine arts.'}]
   value=draftValue
  }else if(museCalls===4)value=toRevisionDraft(input.edition)
  else value=review(input.edition)
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
 })
 vi.stubGlobal('fetch',send)
 const result=await post({EDITORIAL_WORKFLOW_V3_ENABLED:'true',RESEARCH_SOURCE_ORIGINS:'https://en.wikipedia.org'},{interests:'Connect a chair to verified design education',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
 expect(result.status).toBe(200)
 const body=await result.json() as {researchReferences:EditorialSource[];articleEdition:EditorialArticleEdition;aiDisclosure:string}
 expect(body.researchReferences).toMatchObject([{source:'cultural_research',citations:[{url:'https://en.wikipedia.org/wiki/Bauhaus',publication:'Wikipedia'}]}])
 expect(body.articleEdition.articles[0].narrative).toContain('[1]')
 expect(body.aiDisclosure).toContain('AI assistance')
 expect(body).toMatchObject({editorialTier:{label:"Editor's Pick"}})
 expect(museCalls).toBe(5)
})

it('validates exactly three articles with two or three unique exact-version images',()=>{
 const three=edition();expect(validateArticleEdition(three,items,sources,contexts,3)).toEqual(three)
 const two=structuredClone(three);two.articles.forEach(article=>{article.images.pop();article.sourceIds.splice(-3)})
 expect(validateArticleEdition(two,items,sources,contexts,3).articles.every(article=>article.images.length===2)).toBe(true)
 const tooMany=structuredClone(three);tooMany.articles[0].images.push({catalogId:items[9].id,assetId:items[9].image.id,brandName:sources[27].value,brandSourceId:sources[27].id,productSourceIds:[sources[29].id]})
 expect(()=>validateArticleEdition(tooMany,items,sources,contexts,3)).toThrow()
 expect(validateArticleEdition({...three,articles:three.articles.slice(0,2)},items,sources,contexts,2).articles).toHaveLength(2)
 expect(()=>validateArticleEdition({...three,articles:three.articles.slice(0,2)},items,sources,contexts,3)).toThrow()
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
it('resolves redundant catalog metadata from exact asset references without weakening identity',()=>{
 const cased=structuredClone(edition())
 cased.articles[0].images[0].catalogId=cased.articles[0].images[0].catalogId.toUpperCase()
 expect(validateArticleEdition(cased,items,sources,contexts,3).articles[0].images[0].catalogId).toBe(items[0].id)
 const unknown=structuredClone(edition())
 unknown.articles[1].images[1].assetId=version(99)
 expect(()=>validateArticleEdition(unknown,items,sources,contexts,3)).toThrow()
 const swapped=structuredClone(edition())
 swapped.articles[2].images[0].catalogId=items[0].id
 expect(()=>validateArticleEdition(swapped,items,sources,contexts,3)).toThrow()
})
it('reports whether a mismatched catalog id belongs to another candidate',()=>{
 const swapped=structuredClone(edition())
 swapped.articles[2].images[0].catalogId=items[0].id
 try{validateArticleEdition(swapped,items,sources,contexts,3);expect.unreachable()}
 catch(error){expect((error as {detail?:unknown}).detail).toMatchObject({article:2,image:0,assetKnown:true,catalogKnown:true})}
 const fabricated=structuredClone(edition())
 fabricated.articles[0].images[1].catalogId='wrong'
 try{validateArticleEdition(fabricated,items,sources,contexts,3);expect.unreachable()}
 catch(error){expect((error as {detail?:unknown}).detail).toMatchObject({article:0,image:1,assetKnown:true,catalogKnown:false})}
})
it('reports which brand requirement failed without exposing values',()=>{
 const reused=structuredClone(edition())
 reused.articles[0].images[0].brandSourceId=data[1].sources[0].id
 try{validateArticleEdition(reused,items,sources,contexts,3);expect.unreachable()}
 catch(error){expect((error as {detail?:unknown}).detail).toMatchObject({article:0,image:0,sourceFound:false,nameMatches:false})}
 const renamed=structuredClone(edition())
 renamed.articles[1].images[1].brandName='Invented Brand'
 try{validateArticleEdition(renamed,items,sources,contexts,3);expect.unreachable()}
 catch(error){expect((error as {detail?:unknown}).detail).toMatchObject({article:1,image:1,sourceFound:true,nameMatches:false})}
})
it('instructs the chief that brand attribution resolves from selected refs',async()=>{
 for(const count of [1,3] as const){
  mockPool(count===1?3:24)
  const send=provider();vi.stubGlobal('fetch',send)
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),{...preferences,interests:'A brand-attribution study in quiet interiors'},'lite',undefined,count)
  expect(response.status).toBe(200)
  const instruction=(JSON.parse(String(send.mock.calls[0][1].body)) as {messages:{content:string}[]}).messages[0].content
  expect(instruction).toContain('Brand attribution is resolved automatically from your selected refs')
 }
})
it('instructs the chief to select images by ref for single and triple editions',async()=>{
 for(const count of [1,3] as const){
  mockPool(count===1?3:24)
  const send=provider();vi.stubGlobal('fetch',send)
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),{...preferences,interests:'A pairing-integrity study in quiet interiors'},'lite',undefined,count)
  expect(response.status).toBe(200)
  const instruction=(JSON.parse(String(send.mock.calls[0][1].body)) as {messages:{content:string}[]}).messages[0].content
  expect(instruction).toContain('Select images by ref ONLY')
 }
})
it('hydrates candidate refs to exact identities and derives hero, article and source IDs',()=>{
 const hydrated=hydrateChiefDraft(toDraft(edition(3,3)),3,items,sources)
 expect(hydrated.articles).toHaveLength(3)
 expect(hydrated.articles[0].id).toBe(`article-${items[0].image.id}`)
 expect(hydrated.articles[0].heroAssetId).toBe(items[0].image.id)
 expect(hydrated.articles[0].images[0]).toMatchObject({catalogId:items[0].id,assetId:items[0].image.id,brandName:data[0].sources[0].value,brandSourceId:data[0].sources[0].id})
 expect(hydrated.articles[0].images[0].productSourceIds).toEqual([data[0].sources[2].id])
 expect(hydrated.articles[0].sourceIds).toEqual(expect.arrayContaining([data[0].sources[0].id]))
 expect(()=>validateArticleEdition(hydrated,items,sources,contexts,3)).not.toThrow()
 const one=hydrateChiefDraft(toDraft(edition(1,2)),1,items,sources)
 expect(one.version).toBe(ARTICLE_SINGLE_CONTRACT_VERSION)
 expect(one.articles).toHaveLength(1)
 const lenient=toDraft(edition(1,2))
 lenient.articles[0].images[0].products=['product_missing_kind']
 expect(hydrateChiefDraft(lenient,1,items,sources).articles[0].images[0].productSourceIds).toEqual([])
})
it('rejects unknown refs, duplicate refs and unresolvable brands without guessing',()=>{
 const unknown=toDraft(edition(1,2))
 unknown.articles[0].images[1].ref='Z'
 try{hydrateChiefDraft(unknown,1,items,sources);expect.unreachable()}
 catch(error){expect((error as {code?:unknown;detail?:unknown}).code).toBe('image_identity');expect((error as {detail?:unknown}).detail).toMatchObject({article:0,image:1,refKnown:false})}
 const dup=toDraft(edition(1,2))
 dup.articles[0].images[1].ref=dup.articles[0].images[0].ref
 try{hydrateChiefDraft(dup,1,items,sources);expect.unreachable()}
 catch(error){expect((error as {code?:unknown}).code).toBe('duplicate_image')}
 expect(()=>hydrateChiefDraft(toDraft(edition(1,2)),1,items,sources.filter(source=>source.kind!=='brand_name'))).toThrow()
})
it('fails closed when two refs resolve to the same asset',()=>{
 const dupItems=[items[0],{...items[0],id:'catalog-duplicate'}]
 const draft=toDraft(edition(1,2))
 const hydrated=hydrateChiefDraft(draft,1,dupItems,sources)
 expect(hydrated.articles[0].images[0].assetId).toBe(hydrated.articles[0].images[1].assetId)
 expect(()=>validateArticleEdition(hydrated,dupItems,sources,contexts,1)).toThrow()
})
it('resolves cultural claim refs and rejects unknown claims',()=>{
 const claimSource={id:`${items[0].image.id}:cultural_claim:claim-1`,assetId:items[0].image.id,kind:'cultural_claim',label:'Reviewed cultural fact',value:'Bauhaus combined crafts.',authority:'operator_reviewed_cultural',source:'cultural_evidence_pack'} as EditorialSource
 const withClaims=[...sources,claimSource]
 const draft=toDraft(edition(1,2))
 draft.articles[0].culturalClaims=[{ref:'S1',narrativeText:'Bauhaus combined crafts.'}]
 const hydrated=hydrateChiefDraft(draft,1,items,withClaims)
 expect(hydrated.articles[0].culturalClaims).toEqual([{sourceId:claimSource.id,narrativeText:'Bauhaus combined crafts.'}])
 expect(hydrated.articles[0].sourceIds).toContain(claimSource.id)
 const bad=toDraft(edition(1,2))
 bad.articles[0].culturalClaims=[{ref:'S9',narrativeText:'Bauhaus combined crafts.'}]
 try{hydrateChiefDraft(bad,1,items,withClaims);expect.unreachable()}
 catch(error){expect((error as {code?:unknown}).code).toBe('cultural_claim')}
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
 expect(send).toHaveBeenCalledTimes(4)
 expect((await post({EDITORIAL_HYBRID_ENABLED:'true',EDITORIAL_WONDER_PROVIDER_VERIFIED:'true',META_WONDER_MODEL:'muse-wonder-1.0'},{editorialMode:'hybrid'})).status).toBe(200)
 expect(JSON.parse(String(send.mock.calls[4][1].body)).model).toBe('muse-wonder-1.0')
})
it('uses a bounded 60-second Chief timeout and 30-second Reviewer timeout for both one- and three-story editions',async()=>{
 mockPool(9)
 const originalTimeout=AbortSignal.timeout
 const limits:number[]=[]
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{limits.push(ms);return originalTimeout(ms===60000?80:ms===30000?30:ms)})
 for(const count of [1,3] as const){
  const base=provider()
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
  expect(send).toHaveBeenCalledTimes(4)
 }
 expect(limits.filter(ms=>ms===60000)).toHaveLength(2)
 expect(limits.filter(ms=>ms===30000)).toHaveLength(2)
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
it('rejects unsafe Reviewer timeout settings before reserving or calling Meta',async()=>{
 expect(articleReviewTimeoutMs({} as never)).toBe(30000)
 expect(articleReviewTimeoutMs({ARTICLE_REVIEW_TIMEOUT_MS:'25000'} as never)).toBe(25000)
 for(const value of ['0','19999','40001','abc','20.5'])expect(()=>articleReviewTimeoutMs({ARTICLE_REVIEW_TIMEOUT_MS:value} as never)).toThrow()
 expect(ARTICLE_REVIEW_STEP_TIMEOUT_MS).toBe(20000)
 mockPool(6)
 const send=provider();vi.stubGlobal('fetch',send)
 const response=await post({ARTICLE_REVIEW_TIMEOUT_MS:'90000'})
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({fallbackReason:'configuration'})
 expect(send).not.toHaveBeenCalled()
})
it('reports a bounded Reviewer provider timeout after Chief hydration succeeds',async()=>{
 mockPool(6)
 const originalTimeout=AbortSignal.timeout,seen:number[]=[]
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{seen.push(ms);return originalTimeout(ms===30000?25:ms)})
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  if(send.mock.calls.length===1){const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(toDraft(edition(input.articleCount,input.catalog.length>=9?3:2)))}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})}
  return new Promise<Response>((_resolve,reject)=>{const signal=init.signal as AbortSignal;signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})
 })
 vi.stubGlobal('fetch',send)
 const original=console.error,records:string[]=[]
 console.error=(message:unknown)=>{records.push(String(message))}
 let body:Record<string,unknown>
 try{
  const response=await post({},{interests:'Bounded delayed Reviewer timeout test'})
  body=await response.json() as Record<string,unknown>
 }finally{console.error=original}
 expect(body).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'reviewer',code:'provider_timeout'},inference:{attempted:true,reservedUnits:4}})
 expect(send).toHaveBeenCalledTimes(2)
 expect(seen).toContain(30000)
 const event=JSON.parse(records.find(record=>record.includes('article_editorial_failure'))!) as Record<string,unknown>
 expect(event).toMatchObject({stage:'reviewer',code:'provider_timeout'})
 expect(event.elapsedMs).toEqual(expect.any(Number))
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
  ['structure',async()=>{const draft=toDraft(edition(3,2));draft.articles[0].images[0].ref='Z';return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]})},'chief_editor','image_identity'],
  ['identitySchema',async()=>{const draft=toDraft(edition(3,2));draft.articles[0].images=draft.articles[0].images.slice(0,1);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]})},'chief_editor','image_identity_schema'],
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
it('reports precise identity-mismatch diagnostics with chief model and mode',async()=>{
 mockPool(6)
 const logged:unknown[][]=[]
 const sink=console.error
 console.error=(...args:unknown[])=>{logged.push(args)}
 try{
  const bad=toDraft(edition(3,2))
  bad.articles[0].images[0].ref='Z'
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}]})))
  const body=await (await post({},{interests:'Identity mismatch diagnostic study'})).json() as Record<string,unknown>
  expect(body).toMatchObject({fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code:'image_identity',detail:{article:0,image:0,refKnown:false},chiefModel:'muse-spark-1.3',editorialMode:'lite'}})
  expect(JSON.stringify(body)).not.toContain('version-0000')
  const record=JSON.parse(String(logged[0][0]))
  expect(record).toMatchObject({event:'article_editorial_failure',stage:'chief_editor',code:'image_identity',detail:{article:0,image:0,refKnown:false},chiefModel:'muse-spark-1.3',editorialMode:'lite'})
 }finally{console.error=sink}
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
it('publishes the confirmed edition with its tier even when the final score is low',async()=>{
 mockPool();const send=provider(3,1);vi.stubGlobal('fetch',send)
 const result=await (await post({}, {interests:'A separate confirmation-failure investigation of living spaces'})).json() as Record<string,unknown>
 expect(result).toMatchObject({source:'meta',editorialTier:{label:'Curious Findings'},inference:{reservedUnits:4,attempted:true}})
 expect((result.articleEdition as {articles:unknown[]}).articles).toHaveLength(3)
 expect(send).toHaveBeenCalledTimes(4)
})
it('merges revision prose onto validated identities without changing references',()=>{
 const ed=edition(3,2)
 const before=JSON.stringify(ed.articles.map(article=>({id:article.id,hero:article.heroAssetId,images:article.images,sourceIds:article.sourceIds})))
 const draft=toRevisionDraft(ed)
 draft.title='Revised Edition Title';draft.deck='A revised edition deck.'
 draft.articles[0].headline='A Revised Headline';draft.articles[0].narrative='A revised narrative addressing the review.'
 const next=mergeRevisionProse(ed,draft)
 expect(next.title).toBe('Revised Edition Title')
 expect(next.articles[0].headline).toBe('A Revised Headline')
 expect(JSON.stringify(next.articles.map(article=>({id:article.id,hero:article.heroAssetId,images:article.images,sourceIds:article.sourceIds})))).toBe(before)
 validateArticleEdition(next,items,sources,contexts,3)
})
it('rejects revision drafts with unknown, missing or duplicated article IDs',()=>{
 const ed=edition(3,2)
 const unknown=toRevisionDraft(ed);unknown.articles[0].id=`article-${version(99)}`
 expect(()=>mergeRevisionProse(ed,unknown)).toThrow('structural_validation')
 const missing=toRevisionDraft(ed);missing.articles.pop()
 expect(()=>mergeRevisionProse(ed,missing)).toThrow('structural_validation')
 const duplicated=toRevisionDraft(ed);duplicated.articles[2].id=duplicated.articles[0].id
 expect(()=>mergeRevisionProse(ed,duplicated)).toThrow('structural_validation')
})
it('fails closed when revised prose drops a cultural-claim passage',()=>{
 const ed=edition(3,2)
 const assetId=ed.articles[0].images[0].assetId,claimId=`${assetId}:cultural_claim_1`
 const claimed=[...sources,{id:claimId,assetId,kind:'cultural_claim',label:'Cultural claim',value:'A shared harvest ritual.',authority:'owner_supplied_mockup',source:'content_studio'} as EditorialSource]
 ed.articles[0].culturalClaims=[{sourceId:claimId,narrativeText:'a shared harvest ritual'}]
 ed.articles[0].narrative+=' It recalls a shared harvest ritual.'
 ed.articles[0].sourceIds.push(claimId)
 validateArticleEdition(ed,items,claimed,contexts,3)
 const draft=toRevisionDraft(ed)
 draft.articles[0].narrative='Revised prose without the quoted passage.'
 expect(()=>validateArticleEdition(mergeRevisionProse(ed,draft),items,claimed,contexts,3)).toThrow('cultural_claim')
})
it('publishes all articles when image-grounding findings are advisory',async()=>{
 mockPool(6)
 const grounding=(ed:EditorialArticleEdition)=>({...review(ed,3),featureFeedback:review(ed,3).featureFeedback.map((row,i)=>i?row:{...row,issues:[{severity:'high',code:'visual_grounding',evidenceRefs:[`feature:${ed.articles[0].heroAssetId}`],instruction:'The credited image cannot support this claim.'}]})})
 let calls=0
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++
  const revised=()=>{const draft=toRevisionDraft(input.edition);return {...draft,articles:draft.articles.map(article=>({...article,narrative:`${article.narrative} Revised for the review.`}))}}
  const value=calls===1?toDraft(edition(input.articleCount,2)):calls===2?grounding(input.edition):calls===3?revised():grounding(input.edition)
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
 })
 vi.stubGlobal('fetch',send)
 const body=await (await post({},{interests:'An advisory image-grounding study'})).json() as {source:string;articleEdition:{articles:{heroAssetId:string}[]};requestedCount:number;publishedCount:number;partial:boolean}
 expect(body.source).toBe('meta')
 expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
 expect(body.articleEdition.articles).toHaveLength(3)
 expect(send).toHaveBeenCalledTimes(4)
 const revisionCall=JSON.parse(String(send.mock.calls[2][1].body))
 expect(revisionCall.response_format.json_schema.name).toBe('curio_articles_v1_revision')
 expect(revisionCall.messages[0].content).toContain('prose draft')
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
  expect(send).toHaveBeenCalledTimes(4)
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
  expect(send).toHaveBeenCalledTimes(4)
  const revoked=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'Prepare an interior article with ritual in mind'})
  expect(revoked.status).toBe(409)
  expect(await revoked.json()).toMatchObject({source:'deterministic',fallbackReason:'evidence_changed'})
  expect(send).toHaveBeenCalledTimes(4)
 }finally{sqlite.close()}
})
it('runs a fresh generation job per explorationId even for an identical prompt',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
  const prompt={interests:'Japanese ceramic and Nordic interiors'}
  const first=randomUUID(),second=randomUUID()
  const sendA=provider();vi.stubGlobal('fetch',sendA)
  const one=await post(config,{...prompt,explorationId:first})
  expect(one.status).toBe(200)
  expect(await one.json()).toMatchObject({source:'meta',cached:false})
  expect(sendA).toHaveBeenCalledTimes(4)
  const sendB=provider();vi.stubGlobal('fetch',sendB)
  const two=await post(config,{...prompt,explorationId:second})
  expect(two.status).toBe(200)
  expect(await two.json()).toMatchObject({source:'meta',cached:false})
  expect(sendB).toHaveBeenCalledTimes(4)
  const rows=sqlite.prepare('SELECT id,state FROM article_edition_jobs').all() as {id:string;state:string}[]
  expect(rows).toHaveLength(2)
  expect(new Set(rows.map(row=>row.id)).size).toBe(2)
  expect(rows.every(row=>row.state==='completed')).toBe(true)
 }finally{sqlite.close()}
})
it('resolves repeated requests with the same explorationId to the same completed job',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
  const prompt={interests:'A refresh-resilient Nordic interior study',explorationId:randomUUID()}
  const send=provider();vi.stubGlobal('fetch',send)
  const one=await post(config,prompt)
  expect(one.status).toBe(200)
  expect(await one.json()).toMatchObject({source:'meta',cached:false})
  expect(send).toHaveBeenCalledTimes(4)
  const two=await post(config,prompt)
  expect(await two.json()).toMatchObject({source:'meta',cached:true,inference:{attempted:false}})
  expect(send).toHaveBeenCalledTimes(4)
  const rows=sqlite.prepare('SELECT id FROM article_edition_jobs').all() as {id:string}[]
  expect(rows).toHaveLength(1)
 }finally{sqlite.close()}
})
it('rejects a malformed explorationId without creating a job or calling models',async()=>{
 const {sqlite,db}=preparationDb()
 try{
  vi.mocked(editorialArticlePool).mockResolvedValue(prepared(6,[]))
  const send=provider();vi.stubGlobal('fetch',send)
  const response=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db},{interests:'A malformed exploration study',explorationId:'not-a-uuid'})
  expect(response.status).toBe(400)
  expect(send).not.toHaveBeenCalled()
  expect((sqlite.prepare('SELECT COUNT(*) AS n FROM article_edition_jobs').get() as {n:number}).n).toBe(0)
 }finally{sqlite.close()}
})
it('reuses approved images across explorations but rejects repeats within one edition',()=>{
 // The same approved assets validate in two independent editions: nothing
 // marks an image unavailable after publication.
 validateArticleEdition(structuredClone(edition(3,2)),items,sources,contexts,3)
 validateArticleEdition(structuredClone(edition(3,2)),items,sources,contexts,3)
 const dupe=structuredClone(edition(3,2))
 dupe.articles[1].images[1]={...dupe.articles[0].images[1]}
 expect(()=>validateArticleEdition(dupe,items,sources,contexts,3)).toThrow(/duplicate_image/)
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
  expect(send).toHaveBeenCalledTimes(4)
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
  expect(send).toHaveBeenCalledTimes(4)
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
  const send=provider();vi.stubGlobal('fetch',send)
  const result=await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})).json() as Record<string,unknown>
  expect(result).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta',retrieval:'d1',inference:{reservedUnits:4,attempted:true}})
  expect((result.articleEdition as {articles:unknown[]}).articles).toHaveLength(1)
  expect(send).toHaveBeenCalledTimes(4)
  const chiefInput=JSON.parse(JSON.parse(String(send.mock.calls[0][1].body)).messages[1].content)
  expect(chiefInput.articleCount).toBe(1)
  expect(chiefInput.catalog).toHaveLength(3)
  expect(String(send.mock.calls[0][1].body)).toContain('exactly one distinct article')
})
it('requires two eligible images for a single story without inference',async()=>{
  mockPool(1)
  const send=provider();vi.stubGlobal('fetch',send)
  const result=await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
  expect(result.status).toBe(409)
  expect(await result.json()).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,status:'insufficient_content',requiredImages:2,eligibleImages:1})
  expect(send).not.toHaveBeenCalled()
})
it('publishes a single story from two distinct eligible images',async()=>{
  mockPool(2)
  const send=provider();vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A two-image single story of morning rooms',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})).json() as Record<string,unknown>
  expect(body).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta'})
  expect((body.articleEdition as {articles:{images:unknown[]}[]}).articles).toHaveLength(1)
  expect((body.articleEdition as {articles:{images:unknown[]}[]}).articles[0].images).toHaveLength(2)
  expect(send).toHaveBeenCalledTimes(4)
})
it('publishes a single story from two images of the same brand',async()=>{
  const rows=[data[0],data[2]]
  expect(rows[0].sources[0].value).toBe(rows[1].sources[0].value)
  vi.mocked(editorialArticlePool).mockResolvedValue({items:rows.map(row=>row.item),visualContexts:rows.map(row=>row.context),sources:rows.flatMap(row=>row.sources),eligibleCount:2})
  const draftImage=(ref:string)=>({ref,products:['product_description']})
  const draft={title:'One Studio, Two Expressions',deck:'A single-brand editorial study.',articles:[{headline:'Two Rooms, One Hand',deck:'A distinct editorial angle.',narrative:'These owner described objects invite a different way to read the room.',culturalClaims:[],images:[draftImage('A'),draftImage('B')]}]}
  let calls=0
  const send=vi.fn(async(_url:string,init:RequestInit)=>{
    const input=JSON.parse(JSON.parse(String(init.body)).messages[1].content);calls++
    const value=calls===1?draft:calls===2?review(input.edition,5):calls===3?toRevisionDraft(input.edition):review(input.edition,5)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A same-brand single story of paired seating',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})).json() as {articleEdition:{articles:{images:{brandName:string}[]}[]};source:string}
  expect(body.source).toBe('meta')
  expect(body.articleEdition.articles).toHaveLength(1)
  expect(body.articleEdition.articles[0].images.map(image=>image.brandName)).toEqual([rows[0].sources[0].value,rows[0].sources[0].value])
  expect(send).toHaveBeenCalledTimes(4)
})
it('guides the chief editor with a Nordic lens and sparse-material strategies',async()=>{
  mockPool(3)
  const send=provider();vi.stubGlobal('fetch',send)
  await post({},{interests:'A guided single story of quiet corners',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
  const instruction=String(send.mock.calls[0][1].body)
  for(const phrase of ['Nordic perspective on a world of ideas','never a compulsory comparison','Cultural comparisons and contrasts','Cross-cultural connections','Design and material history','Everyday rituals','shorter, more focused story','single brand','cultural stereotypes'])expect(instruction).toContain(phrase)
})
it('validates a single story with the same structural safeguards',()=>{
  const one={...edition(1,3),version:ARTICLE_SINGLE_CONTRACT_VERSION}
  expect(validateArticleEdition(one,items,sources,contexts,1).articles).toHaveLength(1)
  expect(()=>validateArticleEdition(one,items,sources,contexts,3)).toThrow()
  expect(validateArticleEdition({...edition(3,3),articles:edition(3,3).articles.slice(0,2)},items,sources,contexts,2).articles).toHaveLength(2)
  expect(()=>validateArticleEdition({...edition(3,3),articles:edition(3,3).articles.slice(0,2)},items,sources,contexts,3)).toThrow()
  expect(()=>validateArticleEdition(edition(3,3),items,sources,contexts,1)).toThrow()
  const duplicate=structuredClone(one);duplicate.articles[0].images[1]=duplicate.articles[0].images[0]
  expect(()=>validateArticleEdition(duplicate,items,sources,contexts,1)).toThrow()
})
it('keeps single-story and three-story jobs for the same prompt separate',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(5,[]))
    const send=provider();vi.stubGlobal('fetch',send)
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
    expect(send).toHaveBeenCalledTimes(4)
    const rows=sqlite.prepare('SELECT id,state FROM article_edition_jobs').all() as {id:string;state:string}[]
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(row=>row.id)).size).toBe(2)
    expect(rows.map(row=>row.state).sort()).toEqual(['completed','failed'])
  }finally{sqlite.close()}
})
it('reports chief, reviewer, revision and confirmation entries through the progress hook',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const seen:string[]=[]
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),preferences,'lite',undefined,3,stage=>{seen.push(stage)})
  expect(response.status).toBe(200)
  expect(seen).toEqual(['chief_editor','reviewer','revision','confirmation'])
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
it('schedules hotspot processing only after validated editions lock images',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const tasks:Promise<unknown>[]=[]
  const request=new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
  const response=await articleEditorialResponse(request,environment(),{...preferences,interests:'A hotspot-scheduling study in quiet interiors'},'lite',undefined,3,undefined,task=>{tasks.push(task)})
  expect(response.status).toBe(200)
  expect(tasks).toHaveLength(1)
  await expect(tasks[0]).resolves.toBeUndefined()
  mockPool()
  const bad=toDraft(edition(3,2))
  bad.articles[0].images[0].ref='Z'
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}]})))
  const failed=await articleEditorialResponse(new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}}),environment(),{...preferences,interests:'An identity-breaking study in quiet interiors'},'lite',undefined,3,undefined,task=>{tasks.push(task)})
  expect(await failed.json()).toMatchObject({fallbackReason:'provider_or_validation'})
  expect(tasks).toHaveLength(1)
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
// PR1: graded publication replaces quality rejection. Low scores publish
// with a public tier; only hard integrity failures block publication.
const dimScores=(editorialQuality:number,discoveryValue:number,originality:number,narrativeCoherence:number,readability:number)=>({editorialQuality,discoveryValue,originality,narrativeCoherence,readability})
const uniform=(score:number)=>dimScores(score,score,score,score,score)
function scoredReview(value:EditorialArticleEdition,dims:Record<string,number>,issues:{severity:'low'|'medium'|'high';code:string}[]=[]){
  return {rubricVersion:EDITORIAL_STANDARD_VERSION,
    dimensions:Object.fromEntries(Object.entries(dims).map(([key,score])=>[key,{score,reason:'Independent assessment against supplied evidence.',evidenceRefs:[`feature:${value.articles[0].heroAssetId}`]}])),
    magazineFeedback:'The edition is assessed.',
    featureFeedback:value.articles.map((article,i)=>({assetId:article.heroAssetId,strengths:[],issues:i===0?issues.map(issue=>({...issue,evidenceRefs:[article.images[0].brandSourceId],instruction:'Address the flagged concern.'})):[]})),
    revisionInstructions:issues.length?['Address the flagged concern.']:[]}
}
function stagedProvider(first:(ed:EditorialArticleEdition)=>unknown,confirm:(ed:EditorialArticleEdition)=>unknown){
  let calls=0
  return vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++
    const value=calls===1?toDraft(edition(input.articleCount,input.catalog.length>=9?3:2)):calls===2?first(input.edition):calls===3?toRevisionDraft(input.edition):confirm(input.edition)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
}
it('publishes a low-score edition with its tier after exactly one revision',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,1),ed=>scoredReview(ed,uniform(2)))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A low-score graded study of seating nooks'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'meta',retrieval:'d1',editorialTier:{label:'Curious Findings',description:'Small discoveries, interesting details and ideas that invite a closer look.'},generation:{revisionModel:'muse-spark-1.3',confirmationModel:'muse-spark-1.3'}})
  expect((body.articleEdition as {articles:unknown[]}).articles).toHaveLength(3)
  expect(send).toHaveBeenCalledTimes(4)
})
it('assigns Wild Perspectives and Editor\'s Pick tiers from confirmation scores',async()=>{
  mockPool()
  const mid=stagedProvider(ed=>review(ed,5),ed=>scoredReview(ed,uniform(3)))
  vi.stubGlobal('fetch',mid)
  expect(await (await post({},{interests:'A mid-score graded study of reading corners'})).json()).toMatchObject({source:'meta',editorialTier:{label:'Wild Perspectives'}})
  expect(mid).toHaveBeenCalledTimes(4)
  const top=stagedProvider(ed=>review(ed,5),ed=>scoredReview(ed,uniform(5)))
  vi.stubGlobal('fetch',top)
  expect(await (await post({},{interests:'A top-score graded study of morning light'})).json()).toMatchObject({source:'meta',editorialTier:{label:"Editor's Pick"}})
  expect(top).toHaveBeenCalledTimes(4)
})
it('publishes boundary confirmation scores with the correct tier',async()=>{
  mockPool()
  const cases:[Record<string,number>,string][]=[
    [dimScores(5,5,5,5,5),"Editor's Pick"],[dimScores(5,3,3,3,2),"Editor's Pick"],
    [dimScores(4,4,3,3,2),'Wild Perspectives'],[dimScores(3,2,3,2,2),'Wild Perspectives'],
    [dimScores(2,3,3,2,2),'Curious Findings'],
  ]
  let n=0
  for(const [dims,label] of cases){
    const send=stagedProvider(ed=>review(ed,5),ed=>scoredReview(ed,dims))
    vi.stubGlobal('fetch',send)
    const body=await (await post({},{interests:`A boundary tier study number ${++n} for quiet rooms`})).json() as Record<string,unknown>
    expect(body).toMatchObject({source:'meta',editorialTier:{label}})
    expect(send).toHaveBeenCalledTimes(4)
  }
})
it('publishes despite high-severity findings on any review code',async()=>{
  mockPool()
  for(const code of ['fact_integrity','visual_grounding','brand_integrity','safety','generic_copy','weak_discovery','repetition','coherence','readability']){
    const send=stagedProvider(ed=>review(ed,5),ed=>multiReview(ed,uniform(5),{0:[{severity:'high',code}],1:[{severity:'high',code}],2:[{severity:'high',code}]}))
    vi.stubGlobal('fetch',send)
    const body=await (await post({},{interests:`A publish-despite study of ${code} in sitting rooms`})).json() as {source:string;requestedCount:number;publishedCount:number;partial:boolean}
    expect(body.source).toBe('meta')
    expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
    expect(send).toHaveBeenCalledTimes(4)
  }
})
it('treats high-severity quality criticism as tier input, not a block',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>scoredReview(ed,uniform(4),[{severity:'high',code:'generic_copy'}]))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A quality-criticism study of window seats'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'meta',editorialTier:{label:"Editor's Pick"}})
  expect(send).toHaveBeenCalledTimes(4)
})
it('fails closed on unrecognized confirmation issue codes',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>scoredReview(ed,uniform(5),[{severity:'high',code:'invented_code'}]))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'An unknown-code study of hallway nooks'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'confirmation'}})
  expect(send).toHaveBeenCalledTimes(4)
})
it('keeps numeric scores out of the public graded response',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,1),ed=>scoredReview(ed,uniform(2)))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A score-privacy study of attic corners'})).json() as Record<string,unknown>
  const keys:string[]=[]
  const walk=(value:unknown)=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const [key,entry] of Object.entries(value)){keys.push(key);walk(entry)}}
  walk(body)
  expect(keys.filter(key=>/score/i.test(key))).toEqual([])
  expect(JSON.stringify(body)).not.toMatch(/REJECT|REVISE|[^_]PASS/)
  expect(body.editorialTier).toEqual({label:'Curious Findings',description:'Small discoveries, interesting details and ideas that invite a closer look.'})
})
it('reports graded publication scores to the operator log only',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,1),ed=>scoredReview(ed,uniform(2)))
  vi.stubGlobal('fetch',send)
  const errors:string[]=[]
  const spy=vi.spyOn(console,'error').mockImplementation((...args:unknown[])=>{errors.push(args.map(String).join(' '))})
  try{
    await (await post({},{interests:'A log-privacy study of cellar stairs'})).json()
    const graded=errors.map(line=>{try{return JSON.parse(line)}catch{return null}}).find(row=>row?.event==='article_editorial_graded')
    expect(graded).toMatchObject({finalScore:40,tier:'curious_findings',editorialMode:'lite',articleCount:3})
    expect(graded.dimensionScores).toEqual({editorialQuality:2,discoveryValue:2,originality:2,narrativeCoherence:2,readability:2})
    expect(JSON.stringify(graded)).not.toContain('invite a different way')
  }finally{spy.mockRestore()}
})
it('persists the public tier on completed jobs while withholding internal scores',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(9,[]))
    vi.stubGlobal('fetch',provider())
    const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
    const first=await (await post(config,{interests:'A tier-persistence study of garden rooms'})).json() as Record<string,unknown>
    expect(first).toMatchObject({source:'meta',editorialTier:{label:"Editor's Pick"},requestedCount:3,publishedCount:3,partial:false})
    expect(first).not.toHaveProperty('assessment')
    const row=sqlite.prepare('SELECT result_json FROM article_edition_jobs').get() as {result_json:string}
    expect(JSON.parse(row.result_json).assessment).toMatchObject({finalScore:100,tier:'editors_pick'})
    const second=await (await post(config,{interests:'A tier-persistence study of garden rooms'})).json() as Record<string,unknown>
    expect(second).toMatchObject({source:'meta',cached:true,editorialTier:{label:"Editor's Pick"},requestedCount:3,publishedCount:3,partial:false})
    expect(second).not.toHaveProperty('assessment')
  }finally{sqlite.close()}
})
// PR3: partial 3-Story publication. Independently valid articles publish with
// requested/published counts; only zero survivors fail explicitly.
function customProvider(chief:(input:{articleCount:number;catalog:unknown[]})=>unknown,first:(ed:EditorialArticleEdition)=>unknown,confirm:(ed:EditorialArticleEdition)=>unknown,revision:(ed:EditorialArticleEdition)=>unknown=(ed:EditorialArticleEdition)=>toRevisionDraft(ed)){
  let calls=0
  return vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++
    const value=calls===1?chief(input):calls===2?first(input.edition):calls===3?revision(input.edition):confirm(input.edition)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
}
function multiReview(value:EditorialArticleEdition,dims:Record<string,number>,byArticle:Record<number,{severity:'low'|'medium'|'high';code:string}[]>){
  return {rubricVersion:EDITORIAL_STANDARD_VERSION,
    dimensions:Object.fromEntries(Object.entries(dims).map(([key,score])=>[key,{score,reason:'Independent assessment against supplied evidence.',evidenceRefs:[`feature:${value.articles[0].heroAssetId}`]}])),
    magazineFeedback:'The edition is assessed.',
    featureFeedback:value.articles.map((article,i)=>({assetId:article.heroAssetId,strengths:[],issues:(byArticle[i]??[]).map(issue=>({...issue,evidenceRefs:[article.images[0].brandSourceId],instruction:'Address the flagged concern.'}))})),
    revisionInstructions:['Address the flagged concern.']}
}
const claimSource=(assetId:string,id:string)=>({id,assetId,kind:'cultural_claim',label:'Cultural claim',value:'A shared harvest ritual.',authority:'operator_reviewed_cultural',source:'cultural_evidence_pack'} as EditorialSource)
it('publishes two of three articles when one chief article is invalid',async()=>{
  const assetId=data[6].item.image.id,claimId=`${assetId}:cultural_claim_1`
  vi.mocked(editorialArticlePool).mockResolvedValue({items,visualContexts:contexts,sources:[...sources,claimSource(assetId,claimId)],eligibleCount:24})
  const send=customProvider(input=>{const draft=toDraft(edition(input.articleCount,3));draft.articles[2].culturalClaims=[{ref:'S1',narrativeText:'An unquoted ceremonial passage.'}];return draft},ed=>review(ed,5),ed=>review(ed,5))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A partial chief-validation study of potting sheds'})).json() as {source:string;articleEdition:{articles:{heroAssetId:string}[]};requestedCount:number;publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect(body.requestedCount).toBe(3)
  expect(body.publishedCount).toBe(2)
  expect(body.partial).toBe(true)
  expect(body.articleEdition.articles.map(article=>article.heroAssetId)).toEqual([data[0].item.image.id,data[3].item.image.id])
  expect(send).toHaveBeenCalledTimes(4)
})
it('drops a revised article that loses its cultural-claim passage',async()=>{
  const assetId=data[0].item.image.id,claimId=`${assetId}:cultural_claim_1`
  vi.mocked(editorialArticlePool).mockResolvedValue({items,visualContexts:contexts,sources:[...sources,claimSource(assetId,claimId)],eligibleCount:24})
  let calls=0
  const send=vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++
    let value:unknown
    if(calls===1){const draft=toDraft(edition(input.articleCount,3));draft.articles[0].narrative+=' It recalls a shared harvest ritual.';draft.articles[0].culturalClaims=[{ref:'S1',narrativeText:'a shared harvest ritual'}];value=draft}
    else if(calls===2)value=review(input.edition,5)
    else if(calls===3){const draft=toRevisionDraft(input.edition);draft.articles[0].narrative='Revised prose without the quoted passage.';value=draft}
    else value=review(input.edition,5)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A revision-drop study of linen cupboards'})).json() as {source:string;articleEdition:{articles:{heroAssetId:string}[]};publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect([body.publishedCount,body.partial]).toEqual([2,true])
  expect(body.articleEdition.articles.map(article=>article.heroAssetId)).toEqual([data[3].item.image.id,data[6].item.image.id])
  expect(send).toHaveBeenCalledTimes(4)
})
it('fails closed when chief produces zero valid articles',async()=>{
  const ids=[data[0].item.image.id,data[3].item.image.id,data[6].item.image.id]
  vi.mocked(editorialArticlePool).mockResolvedValue({items,visualContexts:contexts,sources:[...sources,...ids.map((assetId,n)=>claimSource(assetId,`${assetId}:cultural_claim_${n+1}`))],eligibleCount:24})
  const send=customProvider(input=>{const draft=toDraft(edition(input.articleCount,3));draft.articles.forEach((article,i)=>{article.culturalClaims=[{ref:`S${i+1}`,narrativeText:'An unquoted ceremonial passage.'}]});return draft},ed=>review(ed,5),ed=>review(ed,5))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A zero-valid study of coal cellars'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'deterministic',fallbackReason:'provider_or_validation',validationDiagnostic:{stage:'chief_editor',code:'cultural_claim'},articleEdition:null})
  expect(send).toHaveBeenCalledTimes(1)
})
it('persists partial editions on completed jobs with counts',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    const pool=prepared(9,[]),claimAsset=data[6].item.image.id
    vi.mocked(editorialArticlePool).mockResolvedValue({...pool,sources:[...pool.sources,claimSource(claimAsset,`${claimAsset}:cultural_claim_1`)]})
    vi.stubGlobal('fetch',customProvider(input=>{const draft=toDraft(edition(input.articleCount,3));draft.articles[2].culturalClaims=[{ref:'S1',narrativeText:'An unquoted ceremonial passage.'}];return draft},ed=>review(ed,5),ed=>review(ed,5)))
    const config={EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db}
    const first=await (await post(config,{interests:'A partial persistence study of garden sheds'})).json() as {source:string;articleEdition:{articles:unknown[]};requestedCount:number;publishedCount:number;partial:boolean;editorialTier:{label:string}}
    expect(first.source).toBe('meta')
    expect([first.requestedCount,first.publishedCount,first.partial]).toEqual([3,2,true])
    expect(first.articleEdition.articles).toHaveLength(2)
    expect(first.editorialTier.label).toBe("Editor's Pick")
    const row=sqlite.prepare('SELECT result_json FROM article_edition_jobs').get() as {result_json:string}
    expect(JSON.parse(row.result_json).articleEdition.articles).toHaveLength(2)
    const second=await (await post(config,{interests:'A partial persistence study of garden sheds'})).json() as {source:string;cached:boolean;articleEdition:{articles:unknown[]};requestedCount:number;publishedCount:number;partial:boolean}
    expect([second.source,second.cached,second.requestedCount,second.publishedCount,second.partial]).toEqual(['meta',true,3,2,true])
    expect(second.articleEdition.articles).toHaveLength(2)
  }finally{sqlite.close()}
})
it('schedules hotspots only for published articles',async()=>{
  const {collectHotspotTargets}=await import('../worker/sam-hotspots')
  const full=edition(3,3)
  expect(collectHotspotTargets({version:full.version,title:full.title,deck:full.deck,articles:full.articles.slice(1)})).toEqual([data[3],data[4],data[5],data[6],data[7],data[8]].map(row=>row.item.image.id))
})
it('sends imaginative-association calibration to 3-Story review and confirmation',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>review(ed,5));vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A calibration study of reading chairs'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'meta'})
  expect(send).toHaveBeenCalledTimes(4)
  for(const index of [1,3]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    expect(instruction).toContain('do not penalize a clearly framed imaginative association')
    expect(instruction).toContain('Require direct support for cultural definitions, history, causation and brand influence')
    expect(instruction).not.toContain('Research citations must refer to the actual supplied passage')
  }
})
it('publishes despite high-severity fact_integrity opinions',async()=>{
  mockPool()
  const flagged=(ed:EditorialArticleEdition)=>{const value=multiReview(ed,uniform(5),{0:[{severity:'high',code:'fact_integrity'}],1:[{severity:'high',code:'fact_integrity'}],2:[{severity:'high',code:'fact_integrity'}]});value.featureFeedback[0].issues[0].instruction='Remove the invented Bauhaus influence on this chair.';value.featureFeedback[1].issues[0].instruction='Remove the fabricated founding date of this studio.';value.featureFeedback[2].issues[0].instruction='Remove the unsupported claim that this lamp shaped a national style.';return value}
  const send=stagedProvider(ed=>review(ed,5),flagged);vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A fabrication-advisory study of armchairs'})).json() as {source:string;articleEdition:{articles:unknown[]};requestedCount:number;publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
  expect(send).toHaveBeenCalledTimes(4)
})
it('publishes when optional citations are missing',async()=>{
  mockPool()
  const flagged=(ed:EditorialArticleEdition)=>{const value=multiReview(ed,uniform(4),{0:[{severity:'high',code:'fact_integrity'}],2:[{severity:'high',code:'fact_integrity'}]});value.featureFeedback[0].issues[0].instruction='No external citation supports this cultural connection.';value.featureFeedback[2].issues[0].instruction='Missing optional research for this design claim.';return value}
  const send=stagedProvider(ed=>review(ed,5),flagged);vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A missing-citation study of footstools'})).json() as {source:string;articleEdition:{articles:unknown[]};requestedCount:number;publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
  expect(send).toHaveBeenCalledTimes(4)
})
it('publishes a single story without external research or citations',async()=>{
  mockPool(3)
  const send=provider();vi.stubGlobal('fetch',send)
  const body=await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION,interests:'A single no-research study of window seats'})).json() as Record<string,unknown>
  expect(body).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta'})
  expect(body).not.toHaveProperty('researchReferences')
  expect((body.articleEdition as {articles:unknown[]}).articles).toHaveLength(1)
  expect(send).toHaveBeenCalledTimes(4)
})
it('publishes creative interpretation without citations across three articles',async()=>{
  mockPool()
  const send=customProvider(input=>{const draft=toDraft(edition(input.articleCount,3));draft.articles.forEach(article=>{article.narrative='Perhaps the chair keeps a quiet vigil over morning rituals, and the room answers in soft timber light.'});return draft},ed=>review(ed,5),ed=>review(ed,5))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'An imaginative triptych study of reading corners'})).json() as {source:string;articleEdition:{articles:{narrative:string}[]};requestedCount:number;publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
  expect(body.articleEdition.articles.every(article=>article.narrative.includes('quiet vigil'))).toBe(true)
  expect(body).not.toHaveProperty('researchReferences')
  expect(send).toHaveBeenCalledTimes(4)
})
it('sends imaginative calibration to single-story v2 review for single/triple consistency',async()=>{
  mockPool(3)
  const send=provider();vi.stubGlobal('fetch',send)
  const result=await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})).json() as Record<string,unknown>
  expect(result).toMatchObject({format:ARTICLE_SINGLE_CONTRACT_VERSION,source:'meta'})
  expect(send).toHaveBeenCalledTimes(4)
  for(const index of [1,3]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    expect(instruction).toContain('do not penalize a clearly framed imaginative association')
  }
})
it('keeps v3 research guidance appended after Content Studio calibration',async()=>{
  mockPool(3)
  const send=vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
    const n=send.mock.calls.length
    const value=n===1?{topic:'The everyday chair',angle:'How seating shapes daily rituals',argument:'Seating gives ordinary reflection a physical place.',selectedAssetIds:[version(1),version(2)],researchQuestions:[]}:n===2?toDraft(edition(1,2)):n===3?review(input.edition):n===4?toRevisionDraft(input.edition):review(input.edition)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
  vi.stubGlobal('fetch',send)
  const result=await post({EDITORIAL_WORKFLOW_V3_ENABLED:'true'},{interests:'A v3 calibration study of footstools',editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION})
  expect(result.status).toBe(200)
  expect(send).toHaveBeenCalledTimes(5)
  for(const index of [2,4]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    expect(instruction).toContain('or misattribute external research. Research citations must refer to the actual supplied passage')
  }
})
it('treats Content Studio records as authoritative Demo facts in single-story prompts',async()=>{
  mockPool(3)
  const send=provider();vi.stubGlobal('fetch',send)
  await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION,interests:'A single studio-authority study of reading chairs'})).json()
  expect(send).toHaveBeenCalledTimes(4)
  const chief=JSON.parse(String(send.mock.calls[0][1].body)).messages[0].content as string
  expect(chief).toContain('are authoritative Demo facts')
  expect(chief).toContain('never present invented details as Content Studio facts')
  for(const index of [1,3]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    expect(instruction).toContain('never raise fact_integrity merely because a mockup')
    expect(instruction).toContain('Still flag narratives that contradict supplied sources')
  }
  const revision=JSON.parse(String(send.mock.calls[2][1].body)).messages[0].content as string
  expect(revision).toContain('are authoritative Demo facts')
})
it('treats Content Studio records as authoritative Demo facts in 3-story prompts',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>review(ed,5));vi.stubGlobal('fetch',send)
  await (await post({},{interests:'A studio-authority study of reading lamps'})).json()
  expect(send).toHaveBeenCalledTimes(4)
  const chief=JSON.parse(String(send.mock.calls[0][1].body)).messages[0].content as string
  expect(chief).toContain('are authoritative Demo facts')
  expect(chief).toContain('never present invented details as Content Studio facts')
  for(const index of [1,3]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    expect(instruction).toContain('never raise fact_integrity merely because a mockup')
    expect(instruction).toContain('Still flag narratives that contradict supplied sources')
  }
  const revision=JSON.parse(String(send.mock.calls[2][1].body)).messages[0].content as string
  expect(revision).toContain('are authoritative Demo facts')
})
it('shares one severe-deception definition across chief, reviewer, revision and confirmation',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>review(ed,5));vi.stubGlobal('fetch',send)
  await (await post({},{interests:'A shared-definition study of table lamps'})).json()
  expect(send).toHaveBeenCalledTimes(4)
  const seen=new Set<string>()
  for(const index of [0,1,2,3]){
    const instruction=JSON.parse(String(send.mock.calls[index][1].body)).messages[0].content as string
    const begin=instruction.indexOf('Severe deception means presenting invented')
    const end=instruction.indexOf('are not severe deception.',begin)
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(begin)
    seen.add(instruction.slice(begin,end))
  }
  expect(seen.size).toBe(1)
})
it('sends unsupported-claim repair guidance to the revision editor',async()=>{
  mockPool()
  const send=stagedProvider(ed=>review(ed,5),ed=>review(ed,5));vi.stubGlobal('fetch',send)
  await (await post({},{interests:'A revision-repair study of side tables'})).json()
  expect(send).toHaveBeenCalledTimes(4)
  const instruction=JSON.parse(String(send.mock.calls[2][1].body)).messages[0].content as string
  expect(instruction).toContain('remove it or rewrite it strictly within what the cited evidence supports')
  expect(instruction).toContain('Do not repeat, defend, or merely add uncertainty words')
})
it('identifies materially deceptive claims and revises them before publishing',async()=>{
  mockPool()
  const deceptive='This lamp cures insomnia and carries a lifetime safety certification.'
  const flagged=(ed:EditorialArticleEdition)=>{const value=multiReview(ed,uniform(4),{1:[{severity:'high',code:'safety'}]});value.featureFeedback[1].issues[0].instruction=`Remove the deceptive claim: ${deceptive}`;return value}
  const send=customProvider(input=>{const draft=toDraft(edition(input.articleCount,3));draft.articles[1].narrative=`A calm reading corner. ${deceptive}`;return draft},flagged,ed=>review(ed,5),(ed:EditorialArticleEdition)=>{const draft=toRevisionDraft(ed);draft.articles[1].narrative='This lamp brings a calm glow to evening reading.';return draft})
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'A deceptive-claim revision study of bedside lamps'})).json() as {source:string;articleEdition:{articles:{narrative:string}[]};requestedCount:number;publishedCount:number;partial:boolean}
  expect(body.source).toBe('meta')
  expect([body.requestedCount,body.publishedCount,body.partial]).toEqual([3,3,false])
  expect(body.articleEdition.articles[1].narrative).toContain('calm glow')
  expect(body.articleEdition.articles[1].narrative).not.toContain('cures insomnia')
  expect(body.articleEdition.articles[1].narrative).not.toContain('lifetime safety certification')
  expect(send).toHaveBeenCalledTimes(4)
})
it('allows revision to remove an unsupported non-cultural claim passage',()=>{
  const ed=edition(3,3)
  validateArticleEdition(ed,items,sources,contexts,3)
  const draft=toRevisionDraft(ed)
  draft.articles[1].narrative='These objects sit quietly in the room.'
  const merged=mergeRevisionProse(ed,draft)
  expect(()=>validateArticleEdition(merged,items,sources,contexts,3)).not.toThrow()
  expect(merged.articles[1].narrative).toBe('These objects sit quietly in the room.')
})
it('fails closed when confirmation feedback cannot be attributed',async()=>{
  mockPool()
  const unattributed=(ed:EditorialArticleEdition)=>{const value=review(ed,5);value.featureFeedback[0].assetId='unknown-hero';return value}
  const send=stagedProvider(ed=>review(ed,5),unattributed);vi.stubGlobal('fetch',send)
  const body=await (await post({},{interests:'An unattributed-feedback study of cabinets'})).json() as Record<string,unknown>
  expect(body).toMatchObject({source:'deterministic',status:'fallback',fallbackReason:'provider_or_validation',articleEdition:null,validationDiagnostic:{stage:'confirmation',code:'review_validation'}})
  expect(send).toHaveBeenCalledTimes(4)
})
it('publishes a single story despite high-severity safety findings',async()=>{
  mockPool(3)
  const send=stagedProvider(ed=>review(ed,5),ed=>multiReview(ed,uniform(5),{0:[{severity:'high',code:'safety'}]}))
  vi.stubGlobal('fetch',send)
  const body=await (await post({},{editionFormat:ARTICLE_SINGLE_CONTRACT_VERSION,interests:'A single advisory-safety study of desks'})).json() as {source:string;articleEdition:{articles:unknown[]}}
  expect(body.source).toBe('meta')
  expect(body.articleEdition.articles).toHaveLength(1)
  expect(send).toHaveBeenCalledTimes(4)
})
// Live Meta AI Logs: one entry per actual backend invocation, with the
// model really invoked, measured timestamps and a summary derived only
// from the returned structured value.
type LoggedCall={id:string;model:string;stage:string;startedAt:number;endedAt:number|null;status:string;summary?:string}
const liveLogRequest=()=>new Request(origin,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9'}})
it('records one completed entry per actual invocation on the published edition',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const body=await (await articleEditorialResponse(liveLogRequest(),environment(),{...preferences,interests:'A live-log study in quiet interiors'},'lite',undefined,3)).json() as {modelCalls?:LoggedCall[]}
  expect(body.modelCalls).toHaveLength(4)
  expect(body.modelCalls!.map(call=>call.stage)).toEqual(['chief_editor','reviewer','revision','confirmation'])
  expect(new Set(body.modelCalls!.map(call=>call.id)).size).toBe(4)
  for(const call of body.modelCalls!){
    expect(call.model).toBe('muse-spark-1.3')
    expect(call.status).toBe('completed')
    expect(call.endedAt).toBeGreaterThanOrEqual(call.startedAt)
    expect(typeof call.summary).toBe('string')
  }
  expect(body.modelCalls![0].summary).toMatch(/^Drafted: A Room for 1/)
  expect(body.modelCalls![1].summary).toBe('Review: 0 findings (0 high).')
  expect(body.modelCalls![2].summary).toBe('Revised prose for 3 articles.')
  expect(body.modelCalls![3].summary).toMatch(/^Confirmation: 0 findings \(0 high\)\.$/)
  const leaked=JSON.stringify(body.modelCalls)
  expect(leaked).not.toContain('fixture-only')
  expect(leaked).not.toContain('Explore seating')
})
it('reports the actually invoked chief model per mode',async()=>{
  for(const [mode,chief] of [['lite','muse-spark-1.3'],['hybrid','muse-wonder-1.0']] as const){
    mockPool()
    vi.stubGlobal('fetch',provider())
    const body=await (await articleEditorialResponse(liveLogRequest(),environment(),{...preferences,interests:'A chief-model study in quiet interiors'},mode,undefined,3)).json() as {modelCalls?:LoggedCall[]}
    expect(body.modelCalls![0]).toMatchObject({stage:'chief_editor',model:chief})
    expect(body.modelCalls!.slice(1).map(call=>call.model)).toEqual(['muse-spark-1.3','muse-spark-1.3','muse-spark-1.3'])
  }
})
it('derives review summaries from actual findings',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider(5,5,true))
  const body=await (await articleEditorialResponse(liveLogRequest(),environment(),{...preferences,interests:'A finding-summary study in quiet interiors'},'lite',undefined,3)).json() as {modelCalls?:LoggedCall[]}
  expect(body.modelCalls![1].summary).toBe('Review: 1 finding (1 high). Remove the unsupported claim.')
})
it('carries the accumulated calling entry on every stage report',async()=>{
  mockPool()
  vi.stubGlobal('fetch',provider())
  const seen:{stage:string;calls:LoggedCall[]}[]=[]
  const response=await articleEditorialResponse(liveLogRequest(),environment(),{...preferences,interests:'A stage-report study in quiet interiors'},'lite',undefined,3,(stage,calls)=>{seen.push({stage,calls:calls??[]})})
  expect(response.status).toBe(200)
  expect(seen.map(entry=>entry.stage)).toEqual(['chief_editor','reviewer','revision','confirmation'])
  expect(seen.map(entry=>entry.calls.length)).toEqual([1,2,3,4])
  expect(seen[3].calls.map(call=>call.status)).toEqual(['completed','completed','completed','calling'])
  expect(seen[3].calls[3]).toMatchObject({stage:'confirmation',model:'muse-spark-1.3'})
})
it('records the planning invocation for V3 single stories',async()=>{
  mockPool(3)
  const calls:string[]=[]
  const send=vi.fn(async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
    calls.push(body.response_format.json_schema.name)
    const value=calls.length===1?{topic:'The everyday chair',angle:'How seating shapes daily rituals',argument:'Seating gives ordinary reflection a physical place.',selectedAssetIds:[version(1),version(2)],researchQuestions:[]}
      :calls.length===2?toDraft(edition(1,2))
      :calls.length===3?review(input.edition)
      :calls.length===4?toRevisionDraft(input.edition)
      :review(input.edition)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
  vi.stubGlobal('fetch',send)
  const body=await (await articleEditorialResponse(liveLogRequest(),environment({EDITORIAL_WORKFLOW_V3_ENABLED:'true'}),{...preferences,interests:'A planning-log study in quiet interiors'},'lite',undefined,1)).json() as {modelCalls?:LoggedCall[]}
  expect(body.modelCalls!.map(call=>call.stage)).toEqual(['planning','chief_editor','reviewer','revision','confirmation'])
  expect(body.modelCalls![0]).toMatchObject({model:'muse-spark-1.3',status:'completed',summary:'Planned: The everyday chair.'})
})
it('records a failed entry with the public code when an invocation throws',async()=>{
  mockPool()
  let calls=0
  const send=vi.fn(async(_url:string,init:RequestInit)=>{
    calls++
    if(calls===2)throw new Error('transport down')
    const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
    const value=calls===1?toDraft(edition(input.articleCount,input.catalog.length>=9?3:2)):calls===3?toRevisionDraft(input.edition):review(input.edition)
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
  })
  vi.stubGlobal('fetch',send)
  const body=await (await articleEditorialResponse(liveLogRequest(),environment(),{...preferences,interests:'A transport-failure study in quiet interiors'},'lite',undefined,3)).json() as {fallbackReason?:string;modelCalls?:LoggedCall[]}
  expect(body).toMatchObject({fallbackReason:'provider_or_validation'})
  expect(body.modelCalls).toHaveLength(2)
  expect(body.modelCalls![0]).toMatchObject({stage:'chief_editor',status:'completed'})
  expect(body.modelCalls![1]).toMatchObject({stage:'reviewer',status:'failed'})
  expect(body.modelCalls![1].summary).toMatch(/^Failed: [a-z_]+?\.$/)
  expect(body.modelCalls![1].summary).not.toContain('transport down')
})
it('replays stored invocation entries on in-flight polls',async()=>{
  const {sqlite,db}=preparationDb()
  try{
    vi.mocked(editorialArticlePool).mockResolvedValue(prepared(5,[version(6)]))
    const first=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db})
    expect(first.status).toBe(202)
    const calls=[{id:'call-1',model:'muse-spark-1.3',stage:'chief_editor',startedAt:1760000000000,endedAt:1760000018400,status:'completed',summary:'Drafted: A Room for 1.'}]
    sqlite.prepare(`UPDATE article_edition_jobs SET state='generating',lease_token='held',lease_until=?,result_json=?`)
      .run(Date.now()+60000,JSON.stringify({progress:{eligibleImages:5,remainingCandidates:1,processing:0},stage:'reviewer',modelCalls:calls}))
    const second=await post({EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',CATALOG_DB:db})
    expect(second.status).toBe(202)
    expect(await second.json()).toMatchObject({preparation:{outcome:'reviewing'},generationStage:'reviewer',modelCalls:calls})
  }finally{sqlite.close()}
})
