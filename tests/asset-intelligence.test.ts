// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AssetStore } from '../worker/asset-store'
import { candidateIds, D1Catalog } from '../worker/catalog-store'
import { D1AssetRetriever } from '../worker/asset-retrieval'
import { assetDatabase, fixtureItem, fixtureSource } from './asset-fixtures'
import { runClassification, mockUnderstanding } from '../worker/asset-classifier'
import type { Bindings } from '../worker/index'

vi.setConfig({ testTimeout: 30000, hookTimeout: 20000 })
let context: Awaited<ReturnType<typeof assetDatabase>>, store: AssetStore
beforeEach(async()=>{ context=await assetDatabase(); store=new AssetStore(context.db) })
afterEach(async()=>{ vi.unstubAllGlobals(); await context?.mf.dispose() })
const preferences = { allocations: { home: 100, fashion: 0, travel: 0 }, aesthetics: ['Scandinavian'], tags: ['wood'], brandDiversity: false, scope: 'review', limit: 20 }
const review = (purpose='ai_analysis', status='approved', expectedRevision=0) => ({ purpose,status,evidence:'docs/FIXTURE_ONLY.md',rightsHolder:'Test fixture',reviewer:'Test operator',expectedRevision })
async function imported(item=fixtureItem()) {
  await store.import({ sources: [fixtureSource(item.candidate.sourceId)], items: [item] })
  return candidateIds(item.candidate.imageUrl,item.candidate.versionKey)
}
it('imports all 33 genuine URL candidates without promoting rights or inventing availability',async()=>{
  const seed=JSON.parse(readFileSync('seeds/asset-intelligence-v1.json','utf8'))
  expect(new Set(seed.items.map((i: ReturnType<typeof fixtureItem>)=>i.candidate.imageUrl)).size).toBe(33)
  for(let i=0;i<seed.sources.length;i+=10) await store.import({sources:seed.sources.slice(i,i+10),items:[]})
  for(let i=0;i<seed.items.length;i+=5) await store.import({sources:[],items:seed.items.slice(i,i+5)})
  const before=await store.stages()
  expect(before.counts).toEqual({discovered:33,imported:33,display_approved:0,ai_enriched:0,mock_enriched:0,reader_eligible:0})
  await store.import({sources:[],items:seed.items.slice(0,5)})
  expect((await store.stages()).counts?.imported).toBe(33)
  expect((await new D1AssetRetriever(context.db).retrieve({...preferences,scope:'reader'})).items).toHaveLength(0)
})
it('stores independent access, publisher metadata and explicitly reviewed brand identity',async()=>{
  const {versionId}=await imported()
  expect((await store.access(versionId))?.status).toBe('unverified')
  await store.checkAccess(versionId,vi.fn(async()=>new Response(null,{status:200,headers:{'Content-Type':'image/jpeg'}})) as typeof fetch)
  expect((await store.access(versionId))?.status).toBe('reachable')
  expect((await store.version(versionId))?.analysis_status).toBe('pending')
  const ranked=await new D1AssetRetriever(context.db).retrieve(preferences)
  expect(ranked.items[0].classification_source).toBe('editorial_hints')
  expect(ranked.items[0].verified_brand).toBeNull()
  await store.reviewIdentity({sourceId:'fixture-brand-a',canonicalBrandId:'fixture-brand',brandName:'Verified test fixture',evidence:'https://example.com/test-evidence',reviewer:'Test'})
  expect((await new D1AssetRetriever(context.db).retrieve(preferences)).items[0].verified_brand).toBe('Verified test fixture')
})
it('requires each independent review for readiness and excludes archived or revoked images',async()=>{
  const {versionId,assetId}=await imported(), catalog=new D1Catalog(context.db)
  await store.reviewIdentity({sourceId:'fixture-brand-a',canonicalBrandId:'fixture-brand',brandName:'Test only',evidence:'https://example.com/test',reviewer:'Test'})
  await store.reviewReader({versionId,sourceId:'fixture-brand-a',alt:'Test fixture image',attribution:'Test attribution',sourcePage:fixtureSource().entryUrl,licensingEvidence:'https://example.com/test-license',reviewer:'Test'})
  expect((await store.stages()).counts?.reader_eligible).toBe(0)
  await catalog.review(versionId,review('display'))
  expect((await store.stages()).counts?.reader_eligible).toBe(0)
  await store.checkAccess(versionId,vi.fn(async()=>new Response(null,{status:200,headers:{'Content-Type':'image/jpeg'}})) as typeof fetch)
  expect((await store.stages()).counts?.reader_eligible).toBe(1)
  expect((await new D1AssetRetriever(context.db).retrieve({...preferences,scope:'reader'})).items).toHaveLength(1)
  await catalog.review(versionId,review('display','blocked',1))
  expect((await store.stages()).counts?.reader_eligible).toBe(0)
  await catalog.archive(assetId,true)
  expect((await new D1AssetRetriever(context.db).retrieve(preferences)).items).toHaveLength(0)
})
it('ranks the full pool beyond 24/50 images and gives stable preference explanations',async()=>{
  await store.import({sources:[fixtureSource()],items:[]})
  for(let start=0;start<60;start+=5) await store.import({sources:[],items:Array.from({length:5},(_,j)=>{
    const item=fixtureItem(start+j); item.publisher.hints={categories:['fashion'],aesthetics:[],tags:[]};return item
  })})
  const last=fixtureItem(99); await store.import({sources:[],items:[last]})
  const r=await new D1AssetRetriever(context.db).retrieve(preferences)
  expect(r.items).toHaveLength(1);expect(r.items[0].asset_id).toBe((await candidateIds(last.candidate.imageUrl,last.candidate.versionKey)).assetId)
  expect(r.items[0].category_score).toBe(1);expect(r.items[0].aesthetic_score).toBe(1);expect(r.items[0].tag_score).toBe(1)
  expect((await new D1AssetRetriever(context.db).retrieve({...preferences,allocations:{home:0,fashion:100,travel:0},aesthetics:[],tags:[],limit:50})).items).toHaveLength(50)
})
it('supports category/aesthetic filters, source diversity and bounded deterministic serendipity',async()=>{
  const items=[fixtureItem(1),fixtureItem(2),fixtureItem(3,'fixture-brand-b')]
  await store.import({sources:[fixtureSource(),fixtureSource('fixture-brand-b')],items})
  const retriever=new D1AssetRetriever(context.db), varied=await retriever.retrieve({...preferences,brandDiversity:true})
  expect(varied.items.slice(0,2).map(i=>i.publisher_name)).toHaveLength(2)
  expect(new Set(varied.items.slice(0,2).map(i=>items.find(x=>x.candidate.imageUrl===i.image_url)?.candidate.sourceId)).size).toBe(2)
  const surprise={...preferences,serendipity:0.25,seed:'reader-selected'}
  expect(await retriever.retrieve(surprise)).toEqual(await retriever.retrieve(surprise))
  expect((await retriever.retrieve({...preferences,categoryFilter:'travel'})).items).toHaveLength(0)
  expect((await retriever.retrieve({...preferences,aestheticFilter:'Scandinavian'})).items).toHaveLength(3)
  await expect(retriever.retrieve({...preferences,serendipity:0.5})).rejects.toThrow()
})
it('mocks never fetch pixels/reserve inference, cache separately and do not become real enrichment',async()=>{
  const {versionId}=await imported(), env={CATALOG_DB:context.db} as Bindings
  const media=vi.fn(),reserve=vi.fn(),classify=vi.fn()
  const input={versionId,mode:'mock',consent:true}
  const a=await runClassification(input,env,'192.0.2.1',{media,reserve,classify})
  expect(a.cached).toBe(false);expect(a.result.imageSha256).toBeNull()
  expect((await runClassification(input,env,'192.0.2.1',{media,reserve,classify})).cached).toBe(true)
  expect(media).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled();expect(classify).not.toHaveBeenCalled()
  expect((await store.stages()).counts?.mock_enriched).toBe(1);expect((await store.stages()).counts?.ai_enriched).toBe(0)
  expect((await new D1AssetRetriever(context.db).retrieve({...preferences,includeMock:true})).items[0].classification_source).toBe('mock')
})
it('fails closed for disabled Meta, missing grants and an empty reviewed media registry',async()=>{
  const {versionId}=await imported(),media=vi.fn(),reserve=vi.fn()
  await expect(runClassification({versionId,mode:'meta',consent:true},{CATALOG_DB:context.db},'ip',{media,reserve})).rejects.toMatchObject({status:503})
  const env={CATALOG_DB:context.db,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'}
  await expect(runClassification({versionId,mode:'meta',consent:true},env,'ip',{media,reserve})).rejects.toMatchObject({status:403})
  await new D1Catalog(context.db).review(versionId,review())
  await expect(runClassification({versionId,mode:'meta',consent:true},env,'ip',{media,reserve})).rejects.toMatchObject({status:403})
  expect(media).not.toHaveBeenCalled();expect(reserve).not.toHaveBeenCalled()
})
it('serializes concurrent mocked Meta jobs, reserves once and invalidates cached interpretations on grant revision',async()=>{
  const item=fixtureItem();item.candidate.sha256='a'.repeat(64);item.candidate.width=1000;item.candidate.height=750
  const {versionId}=await imported(item);const catalog=new D1Catalog(context.db);await catalog.review(versionId,review())
  const env={CATALOG_DB:context.db,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'}
  let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r})
  const reserve=vi.fn(async()=>({allowed:true,retryAfter:60})),media=vi.fn(async()=>{await gate;return 'data:image/jpeg;base64,VEVTVA=='})
  const classify=vi.fn(async()=>({...mockUnderstanding(versionId),imageSha256:item.candidate.sha256}))
  const overrides={permits:{[versionId]:{imageUrl:item.candidate.imageUrl,sha256:item.candidate.sha256,width:1000,height:750,mime:'image/jpeg' as const,analysisEvidence:'docs/FIXTURE_ONLY.md'}},media,reserve,classify}
  const input={versionId,mode:'meta',consent:true}
  const first=runClassification(input,env,'ip',overrides)
  await vi.waitFor(()=>expect(media).toHaveBeenCalledOnce())
  await expect(runClassification(input,env,'ip',overrides)).rejects.toMatchObject({status:409})
  finish();await first
  expect((await runClassification(input,env,'ip',overrides)).cached).toBe(true);expect(reserve).toHaveBeenCalledOnce()
  expect((await store.stages()).counts?.ai_enriched).toBe(1)
  await catalog.review(versionId,review('ai_analysis','blocked',1))
  await expect(runClassification(input,env,'ip',overrides)).rejects.toMatchObject({status:403})
  expect((await store.stages()).counts?.ai_enriched).toBe(0)
})
it('rejects stale versions, unexpected model keys and ungrounded reader reviews',async()=>{
  const {versionId}=await imported(),item=fixtureItem();item.candidate.versionKey='fixture-v2'
  await store.import({sources:[],items:[item]})
  await expect(runClassification({versionId,mode:'mock',consent:true},{CATALOG_DB:context.db},'ip')).rejects.toThrow(/stale/)
  await expect(store.reviewReader({versionId,sourceId:'other',alt:'Test',attribution:'Test',sourcePage:'https://example.com/test',licensingEvidence:'https://example.com/license',reviewer:'Test'})).rejects.toThrow()
})
it('does not call Meta when the shared budget rejects and requires explicit retry after failure',async()=>{
  const item=fixtureItem();item.candidate.sha256='a'.repeat(64);item.candidate.width=100;item.candidate.height=100
  const {versionId}=await imported(item);await new D1Catalog(context.db).review(versionId,review())
  const env={CATALOG_DB:context.db,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'}
  const classify=vi.fn(),reserve=vi.fn(async()=>({allowed:false,retryAfter:60}))
  const overrides={permits:{[versionId]:{imageUrl:item.candidate.imageUrl,sha256:item.candidate.sha256,width:100,height:100,mime:'image/jpeg' as const,analysisEvidence:'docs/FIXTURE_ONLY.md'}},media:vi.fn(async()=> 'data:image/jpeg;base64,TEST'),reserve,classify}
  const input={versionId,mode:'meta',consent:true}
  await expect(runClassification(input,env,'ip',overrides)).rejects.toMatchObject({status:429})
  await expect(runClassification(input,env,'ip',overrides)).rejects.toMatchObject({status:409})
  expect(reserve).toHaveBeenCalledOnce();expect(classify).not.toHaveBeenCalled()
  expect((await store.analysisJobs(versionId))[0].state).toBe('failed')
})
it('does not publish a model result after an AI grant is revoked during inference',async()=>{
  const item=fixtureItem();item.candidate.sha256='a'.repeat(64);item.candidate.width=100;item.candidate.height=100
  const {versionId}=await imported(item),catalog=new D1Catalog(context.db);await catalog.review(versionId,review())
  const env={CATALOG_DB:context.db,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'FAKE'}
  const overrides={permits:{[versionId]:{imageUrl:item.candidate.imageUrl,sha256:item.candidate.sha256,width:100,height:100,mime:'image/jpeg' as const,analysisEvidence:'docs/FIXTURE_ONLY.md'}},media:vi.fn(async()=> 'data:image/jpeg;base64,TEST'),reserve:vi.fn(async()=>({allowed:true,retryAfter:60})),classify:vi.fn(async()=>{await catalog.review(versionId,review('ai_analysis','blocked',1));return {...mockUnderstanding(versionId),imageSha256:item.candidate.sha256}})}
  await expect(runClassification({versionId,mode:'meta',consent:true},env,'ip',overrides)).rejects.toMatchObject({status:403})
  expect((await store.stages()).counts?.ai_enriched).toBe(0)
  expect((await context.db.prepare('SELECT COUNT(*) AS n FROM asset_intelligence').first())?.n).toBe(0)
})
