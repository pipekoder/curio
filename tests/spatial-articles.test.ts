import {describe,expect,it,vi} from 'vitest'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_SINGLE_CONTRACT_VERSION} from '../shared/editorial-articles'
import {articleStatusCopy,fetchArticleEdition,hasStageableArticles,type ArticlePoll} from '../src/spatial/articles'
import {stageArticleEdition} from '../src/spatial/staging'
import {articleEditionFixture,articleResponseFixture} from './article-fixtures'

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), {status: 200}))
const err = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), {status}))
const call = (fetchImpl: unknown) => fetchArticleEdition('quiet rooms', true, fetchImpl as unknown as typeof fetch)

describe('spatial article edition fetch', () => {
  it('uses generous 3-story polling bounds while single story keeps the 180/300-second bounds',async()=>{
    const original=AbortSignal.timeout
    const durations:number[]=[]
    const spy=vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{durations.push(ms);return original(ms)})
    try{
      await call(ok(articleResponseFixture()))
      expect(durations).toContain(800000)
      expect(durations).toContain(900000)
      expect(durations).not.toContain(90000)
      durations.length=0
      await fetchArticleEdition('quiet rooms',true,ok(articleResponseFixture()) as unknown as typeof fetch,{articleCount:1})
      expect(durations).toContain(180000)
      expect(durations).toContain(300000)
      expect(durations).not.toContain(800000)
    }finally{spy.mockRestore()}
  })
  it('sends the article format with consent and the selected mode', async () => {
    const seen: string[] = []
    const spy = vi.fn(async (_url: unknown, init: {body: string}) => {seen.push(init.body); return new Response('x', {status: 503})})
    await fetchArticleEdition('quiet rooms', true, spy as unknown as typeof fetch, {editorialMode: 'hybrid'})
    expect(JSON.parse(seen[0])).toEqual({prompt: 'quiet rooms', consent: true, editionFormat: ARTICLE_CONTRACT_VERSION, editorialMode: 'hybrid'})
  })
  it('parses a valid article edition without inventing content', async () => {
    const {edition, honest, status} = await call(ok(articleResponseFixture()))
    expect(honest).toBe('meta')
    expect(status).toBeNull()
    expect(edition!.articleEdition.articles).toHaveLength(3)
    expect(edition!.articleEdition.articles[0].images).toHaveLength(3)
  })
  it('parses the public editorial tier without numeric scores', async () => {
    const tier={label:'Wild Perspectives',description:'An unexpected angle, a curious connection, or a different way of seeing familiar things.'}
    const {edition} = await call(ok(articleResponseFixture({editorialTier:tier})))
    expect(edition!.editorialTier).toEqual(tier)
    const legacy = await call(ok(articleResponseFixture()))
    expect(legacy.edition!.editorialTier).toBeUndefined()
  })
  it('continues one Generate action through truthful preparation to a reviewed edition', async () => {
    const responses = [
      new Response(JSON.stringify({status:'preparing',preparation:{retryAfterMs:0},eligibleImages:4,requiredImages:6}),{status:202}),
      new Response(JSON.stringify({status:'preparing',preparation:{retryAfterMs:0},eligibleImages:6,requiredImages:6}),{status:202}),
      new Response(JSON.stringify(articleResponseFixture()),{status:200}),
    ]
    const fetcher=vi.fn(async()=>responses.shift()!)
    const onResponse=vi.fn()
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{onResponse,pollGapMs:5})
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(onResponse).toHaveBeenCalledOnce()
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.honest).toBe('meta')
  })
  it('stages one dock per article with hero-first joined imagery', async () => {
    const {articleEdition, items} = articleEditionFixture()
    const {exhibits, skipped} = stageArticleEdition({articleEdition, items})
    expect(skipped).toBe(0)
    expect(exhibits).toHaveLength(3)
    for (const exhibit of exhibits) {
      expect(exhibit.article!.storyImages).toHaveLength(3)
      expect(exhibit.image).toBe(exhibit.article!.storyImages[0].image)
      expect(exhibit.assetId).toBe(exhibit.article!.storyImages[0].assetId)
      // Mixed brands within one article, captions from the article record.
      const brands = new Set(exhibit.article!.storyImages.map(image => image.brandName))
      expect(brands.size).toBeGreaterThan(1)
      // URLs resolve only from joined items; never constructed from IDs.
      for (const story of exhibit.article!.storyImages) {
        const item = items.find(candidate => candidate.id === story.catalogId && candidate.image.id === story.assetId)!
        expect(story.image).toBe(item.image.path)
        expect(story.alt).toBe(item.image.alt)
      }
    }
  })
  it('stages the two-image Demo minimum without a third-image placeholder', () => {
    const {articleEdition, items} = articleEditionFixture()
    const twoImageEdition = structuredClone(articleEdition)
    twoImageEdition.articles.forEach(article => { article.images.pop() })
    const result = stageArticleEdition({articleEdition: twoImageEdition, items})
    expect(result.exhibits).toHaveLength(3)
    expect(result.exhibits.every(exhibit => exhibit.article?.storyImages.length === 2)).toBe(true)
  })
  it('keeps cited research attached only to its article and preserves disclosure',()=>{
    const {articleEdition,items}=articleEditionFixture()
    const article=articleEdition.articles[0]
    const sourceId=`${article.heroAssetId}:cultural_claim:research:${'a'.repeat(32)}`
    article.culturalClaims=[{sourceId,narrativeText:'A documented cultural fact'}]
    const source={id:sourceId,assetId:article.heroAssetId,kind:'cultural_claim',label:'Retrieved cultural context',value:'A documented cultural fact appears in the retrieved passage.',authority:'retrieved_public_source',source:'cultural_research',retrievedAt:new Date().toISOString(),citations:[{sourceId:'research:'+ 'a'.repeat(32),passageId:'passage:'+ 'a'.repeat(32),url:'https://en.wikipedia.org/wiki/Design',publication:'Wikipedia',title:'Design'}]}
    const staged=stageArticleEdition({articleEdition,items,researchReferences:[source] as never,aiDisclosure:'AI disclosure'})
    expect(staged.exhibits[0].article?.researchReferences).toHaveLength(1)
    expect(staged.exhibits[0].article?.aiDisclosure).toBe('AI disclosure')
    expect(staged.exhibits[1].article?.researchReferences).toEqual([])
  })
  it('parses a partial edition with requested and published counts', async () => {
    const {articleEdition} = articleEditionFixture()
    const partial = {...articleEdition, articles: articleEdition.articles.slice(0, 2)}
    const {edition, status} = await call(ok(articleResponseFixture({articleEdition: partial, requestedCount: 3, publishedCount: 2, partial: true})))
    expect(status).toBeNull()
    expect(edition!.articleEdition.articles).toHaveLength(2)
    expect(edition!.requestedCount).toBe(3)
    expect(edition!.publishedCount).toBe(2)
    expect(edition!.partial).toBe(true)
  })
  it('stages a partial edition article by article', () => {
    const {articleEdition, items} = articleEditionFixture()
    const {exhibits, skipped} = stageArticleEdition({articleEdition: {...articleEdition, articles: articleEdition.articles.slice(0, 2)}, items})
    expect(skipped).toBe(0)
    expect(exhibits).toHaveLength(2)
  })
  it('treats only zero stageable articles as incomplete', () => {
    expect(hasStageableArticles(0)).toBe(false)
    expect(hasStageableArticles(1)).toBe(true)
    expect(hasStageableArticles(3)).toBe(true)
  })
  it('skips articles with unresolvable images instead of patching them', async () => {
    const {articleEdition, items} = articleEditionFixture()
    const broken = structuredClone(articleEdition)
    broken.articles[0].images[1] = {...broken.articles[0].images[1], catalogId: 'no-such-record'}
    const {exhibits, skipped} = stageArticleEdition({articleEdition: broken, items})
    expect(skipped).toBe(1)
    expect(exhibits).toHaveLength(2)
    expect(exhibits.some(exhibit => exhibit.article!.id === broken.articles[0].id)).toBe(false)
  })
  it('keeps server non-AI states machine-readable', async () => {
    const disabled = await call(err(503, {status: 'disabled', fallbackReason: 'disabled'}))
    expect(disabled.edition).toBeNull()
    expect(disabled.status).toBe('disabled')
    const consent = await call(err(403, {status: 'consent_required', fallbackReason: 'consent_missing'}))
    expect(consent.status).toBe('consent_required')
    const short = await call(err(409, {status: 'insufficient_content', eligibleImages: 9, requiredImages: 15, fallbackReason: 'insufficient_content'}))
    expect(short.status).toBe('insufficient_content')
    expect(short.eligibleImages).toBe(9)
    expect(short.requiredImages).toBe(15)
    const fallback = await call(ok({format: ARTICLE_CONTRACT_VERSION, source: 'deterministic', retrieval: 'd1', cached: false, articleEdition: null, status: 'fallback', fallbackReason: 'editorial_rejected'}))
    expect(fallback.edition).toBeNull()
    expect(fallback.status).toBe('fallback')
    expect(fallback.fallbackReason).toBe('editorial_rejected')
    const budget = await call(ok({format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'budget',budget:{limitType:'global_lifetime',remaining:0,requestedUnits:4,measure:'units'}}))
    expect(budget.budget).toMatchObject({limitType:'global_lifetime',remaining:0})
    expect(articleStatusCopy(budget).detail).toContain('shared lifetime inference budget')
    const offline = await call(vi.fn(async () => {throw Error('offline')}))
    expect(offline.edition).toBeNull()
    expect(offline.status).toBe('request_failed')
  })
  it('fails closed on invalid article payloads', async () => {
    const response = articleResponseFixture()
    response.articleEdition.articles[0] = {...response.articleEdition.articles[0], heroAssetId: response.articleEdition.articles[1].heroAssetId}
    const {edition, status} = await call(ok(response))
    expect(edition).toBeNull()
    expect(status).toBe('request_failed')
  })
  it('discloses every article state with a baseline way out', () => {
    expect(articleStatusCopy({status: 'disabled'} as never).title).toContain('disabled')
    expect(articleStatusCopy({status: 'consent_required'} as never).title).toContain('consent')
    expect(articleStatusCopy({status: 'insufficient_content', eligibleImages: 9, requiredImages: 6} as never).detail).toContain('9 of 6')
    expect(articleStatusCopy({status:'fallback',fallbackReason:'budget',budget:{limitType:'per_ip_hourly',limit:4,used:4,remaining:0,requestedUnits:4,measure:'units',retryAfterSeconds:3600}} as never).detail).toContain('hourly inference allowance')
    expect(articleStatusCopy({timedOut: true} as never).title).toContain('still being reviewed')
    for (const status of ['disabled', 'consent_required', 'unavailable', 'insufficient_content', 'fallback', 'request_failed', null] as const) {
      expect(articleStatusCopy({status, timedOut: false} as never).detail).toContain('standard edition')
    }
  })
  it('sends the single-article format and parses exactly one story with one request', async () => {
    const full = articleResponseFixture()
    const single = {...full, format: ARTICLE_SINGLE_CONTRACT_VERSION, articleEdition: {...full.articleEdition, version: ARTICLE_SINGLE_CONTRACT_VERSION, articles: full.articleEdition.articles.slice(0, 1)}}
    const seen: string[] = []
    const fetcher = vi.fn(async (_url: unknown, init: {body: string}) => {seen.push(init.body); return new Response(JSON.stringify(single), {status: 200})})
    const result = await fetchArticleEdition('quiet rooms', true, fetcher as unknown as typeof fetch, {articleCount: 1})
    expect(JSON.parse(seen[0])).toEqual({prompt: 'quiet rooms', consent: true, editionFormat: ARTICLE_SINGLE_CONTRACT_VERSION})
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.articleCount).toBe(1)
    expect(result.honest).toBe('meta')
    expect(result.edition?.articleEdition.articles).toHaveLength(1)
  })
  it('reports the two-image requirement for a single story', async () => {
    const result = await fetchArticleEdition('quiet rooms', true, err(409, {status: 'insufficient_content', fallbackReason: 'insufficient_content', eligibleImages: 1, requiredImages: 2}) as unknown as typeof fetch, {articleCount: 1})
    expect(result.status).toBe('insufficient_content')
    expect(articleStatusCopy(result).detail).toContain('1 of 2 required images')
  })
  it('reports each preparation poll to the progress callback', async () => {
    const seen: ArticlePoll[] = []
    const responses = [
      new Response(JSON.stringify({status: 'preparing', fallbackReason: 'analysis_pending', eligibleImages: 2, requiredImages: 6, preparation: {outcome: 'processing', remainingCandidates: 4, processing: 1, retryAfterMs: 0}}), {status: 202}),
      new Response(JSON.stringify({status: 'preparing', fallbackReason: 'analysis_pending', eligibleImages: 6, requiredImages: 6, preparation: {outcome: 'reviewing', remainingCandidates: 0, processing: 0, retryAfterMs: 0}, generationStage: 'chief_editor'}), {status: 202}),
      new Response(JSON.stringify(articleResponseFixture()), {status: 200}),
    ]
    const fetcher = vi.fn(async () => responses.shift()!)
    const result = await fetchArticleEdition('quiet rooms', true, fetcher as unknown as typeof fetch, {onPoll: poll => seen.push(poll), pollGapMs: 5})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(seen).toEqual([
      {outcome: 'processing', eligibleImages: 2, requiredImages: 6, remainingCandidates: 4, processing: 1, generationStage: null, modelCalls: null, notices: null},
      {outcome: 'reviewing', eligibleImages: 6, requiredImages: 6, remainingCandidates: 0, processing: 0, generationStage: 'chief_editor', modelCalls: null, notices: null},
    ])
  })
  it('sends the same explorationId on the initial request and every poll', async () => {
    const id='123e4567-e89b-42d3-a456-426614174000'
    const bodies:string[]=[]
    const responses=[
      new Response(JSON.stringify({status:'preparing',fallbackReason:'analysis_pending',eligibleImages:2,requiredImages:6,preparation:{outcome:'processing',remainingCandidates:4,processing:1,retryAfterMs:0}}),{status:202}),
      new Response(JSON.stringify(articleResponseFixture()),{status:200}),
    ]
    const fetcher=vi.fn(async (_url:unknown,init:{body:string})=>{bodies.push(init.body);return responses.shift()!})
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{explorationId:id,pollGapMs:5})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(bodies).toHaveLength(2)
    for(const body of bodies)expect(JSON.parse(body)).toMatchObject({prompt:'quiet rooms',consent:true,explorationId:id})
  })
  it('observes a running call through a concurrent poll while the owner still generates', async () => {
    const calling={id:'call-1',model:'muse-wonder-1.0',stage:'chief_editor',attempt:1,startedAt:Date.now(),endedAt:null,status:'calling'}
    let releaseOwner!: (value: Response) => void
    const ownerGate=new Promise<Response>(resolve=>{releaseOwner=resolve})
    let calls=0
    const fetcher=vi.fn(async ()=>{
      if(++calls===1)return ownerGate
      return new Response(JSON.stringify({status:'preparing',fallbackReason:'analysis_pending',eligibleImages:6,requiredImages:6,generationStage:'chief_editor',modelCalls:[calling],preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:15000}}),{status:202})
    })
    const polls: ArticlePoll[]=[]
    let pollSeen!: ()=>void
    const firstPoll=new Promise<void>(resolve=>{pollSeen=resolve})
    const pending=fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:20,onPoll:poll=>{polls.push(poll);pollSeen()}})
    await firstPoll
    expect(polls[0].modelCalls).toMatchObject([{id:'call-1',model:'muse-wonder-1.0',status:'calling',endedAt:null}])
    releaseOwner(new Response(JSON.stringify(articleResponseFixture()),{status:200}))
    const result=await pending
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('adopts the first terminal response and aborts the stragglers', async () => {
    const signals: (AbortSignal|null)[]=[]
    let calls=0
    const fetcher=vi.fn(async (_url:unknown,init:{signal?:AbortSignal|null})=>{
      signals.push(init.signal??null)
      if(++calls===1)return new Promise<Response>(()=>{})
      return new Response(JSON.stringify(articleResponseFixture()),{status:200})
    })
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:10})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(signals[0]?.aborted).toBe(true)
  })
  it('ignores one poll transport failure while the owner still runs', async () => {
    let releaseOwner!: (value: Response) => void
    const ownerGate=new Promise<Response>(resolve=>{releaseOwner=resolve})
    let calls=0
    const fetcher=vi.fn(async ()=>{
      if(++calls===1)return ownerGate
      if(calls===2)throw new Error('socket hang up')
      return new Response(JSON.stringify({status:'preparing',preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:0},eligibleImages:6,requiredImages:6}),{status:202})
    })
    const polls: ArticlePoll[]=[]
    let pollSeen!: ()=>void
    const firstPoll=new Promise<void>(resolve=>{pollSeen=resolve})
    const pending=fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:10,onPoll:poll=>{polls.push(poll);pollSeen()}})
    await firstPoll
    releaseOwner(new Response(JSON.stringify(articleResponseFixture()),{status:200}))
    const result=await pending
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.status).toBeNull()
  })
  it('reads a clean sweep of failures as a request failure without waiting out the bound', async () => {
    const fetcher=vi.fn(async ()=>{throw new Error('socket hang up')})
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{articleCount:1,timeoutMs:60000})
    expect(result.edition).toBeNull()
    expect(result.status).toBe('request_failed')
    expect(result.timedOut).toBe(false)
    // Transport-error spirals relaunch at once and still terminate at the
    // derived launch bound: floor(60000/5000)+2, far short of the 60s bound.
    expect(fetcher).toHaveBeenCalledTimes(14)
  })
  it('omits explorationId for legacy callers that provide none', async () => {
    let body=''
    const fetcher=vi.fn(async (_url:unknown,init:{body:string})=>{body=init.body;return new Response(JSON.stringify(articleResponseFixture()),{status:200})})
    await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch)
    expect(JSON.parse(body)).not.toHaveProperty('explorationId')
  })
  it('passes backend-observed model invocations from polls to the progress callback', async () => {
    const seen: ArticlePoll[] = []
    const calls = [
      {id: 'call-1', model: 'muse-spark-1.3', stage: 'chief_editor', attempt: 1, startedAt: 1760000000000, endedAt: 1760000018400, status: 'completed', summary: 'Drafted: A Room for 1.'},
      {id: 'call-2', model: 'muse-spark-1.3', stage: 'reviewer', attempt: 1, startedAt: 1760000019000, endedAt: null, status: 'calling'},
    ]
    const responses = [
      new Response(JSON.stringify({status: 'preparing', fallbackReason: 'analysis_pending', eligibleImages: 6, requiredImages: 6, preparation: {outcome: 'reviewing', remainingCandidates: 0, processing: 0, retryAfterMs: 0}, generationStage: 'reviewer', modelCalls: calls}), {status: 202}),
      new Response(JSON.stringify(articleResponseFixture({modelCalls: calls.map(call => ({...call, endedAt: 1760000020000, status: 'completed'}))})), {status: 200}),
    ]
    const fetcher = vi.fn(async () => responses.shift()!)
    const result = await fetchArticleEdition('quiet rooms', true, fetcher as unknown as typeof fetch, {onPoll: poll => seen.push(poll), pollGapMs: 5})
    expect(seen).toHaveLength(1)
    expect(seen[0].modelCalls).toHaveLength(2)
    expect(seen[0].modelCalls![0]).toMatchObject({model: 'muse-spark-1.3', stage: 'chief_editor', status: 'completed'})
    expect(seen[0].modelCalls![1]).toMatchObject({stage: 'reviewer', status: 'calling'})
    expect(result.modelCalls).toHaveLength(2)
    expect(result.modelCalls![1]).toMatchObject({status: 'completed'})
  })
  it('carries the invocation log on failure responses without inventing entries', async () => {
    const calls = [{id: 'call-1', model: 'muse-spark-1.3', stage: 'chief_editor', attempt: 1, startedAt: 1760000000000, endedAt: 1760000005000, status: 'failed', summary: 'Failed: provider_timeout.'}]
    const failed = await fetchArticleEdition('quiet rooms', true, err(503, {format: ARTICLE_CONTRACT_VERSION, source: 'deterministic', retrieval: 'd1', cached: false, articleEdition: null, status: 'fallback', fallbackReason: 'provider_or_validation', modelCalls: calls}) as unknown as typeof fetch)
    expect(failed.modelCalls).toHaveLength(1)
    expect(failed.modelCalls![0]).toMatchObject({status: 'failed'})
    const empty = await fetchArticleEdition('quiet rooms', true, err(503, {status: 'fallback', fallbackReason: 'provider_or_validation'}) as unknown as typeof fetch)
    expect(empty.modelCalls).toBeNull()
  })
  it('stages a single dock for the one-story edition', () => {
    const {articleEdition, items} = articleEditionFixture()
    const single = {...articleEdition, version: ARTICLE_SINGLE_CONTRACT_VERSION, articles: articleEdition.articles.slice(0, 1)}
    const {exhibits, skipped} = stageArticleEdition({articleEdition: single, items}, 1)
    expect(skipped).toBe(0)
    expect(exhibits).toHaveLength(1)
    expect(exhibits[0].article!.storyImages).toHaveLength(3)
    expect(exhibits[0].image).toBe(exhibits[0].article!.storyImages[0].image)
  })
  it('keeps polling a slow multi-stage job past the old 64-poll allowance', async () => {
    // A healthy 3-story workflow can run for minutes: 100 fast 202s with a
    // growing invocation log, then the completed edition. The driver must
    // not stop at a fixed poll count while the job is still active.
    let n=0
    const fetcher=vi.fn(async ()=>{
      if(++n<=100){
        const stage=n<=40?'chief_editor':n<=70?'reviewer':'confirmation'
        const done=n>40
        return new Response(JSON.stringify({status:'preparing',fallbackReason:'analysis_pending',eligibleImages:6,requiredImages:6,generationStage:stage,
          modelCalls:[{id:'call-1',model:'muse-spark-1.3',stage:'chief_editor',attempt:1,startedAt:1760000000000,endedAt:done?1760000010000:null,status:done?'completed':'calling'}],
          preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:0}}),{status:202})
      }
      return new Response(JSON.stringify(articleResponseFixture()),{status:200})
    })
    const polls:ArticlePoll[]=[]
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:5,timeoutMs:120000,onPoll:poll=>polls.push(poll)})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.status).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(101)
    expect(polls.length).toBeGreaterThan(64)
    expect(polls[0].generationStage).toBe('chief_editor')
    expect(polls[polls.length-1].generationStage).toBe('confirmation')
    expect(polls[0].modelCalls![0].status).toBe('calling')
    expect(polls[polls.length-1].modelCalls![0].status).toBe('completed')
  })
  it('paces settled polls across the full overall window instead of burning the launch budget', async () => {
    // No owner in flight (all fast 202s, e.g. after a reload while the
    // previous lease is still valid): launches must pace one per gap for
    // the whole window, terminating at the overall bound — not seconds in.
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({status:'preparing',fallbackReason:'analysis_pending',eligibleImages:6,requiredImages:6,generationStage:'chief_editor',preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:0}}),{status:202}))
    const started=Date.now()
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:50,timeoutMs:1000})
    const elapsed=Date.now()-started
    expect(result.timedOut).toBe(true)
    expect(elapsed).toBeGreaterThan(500)
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(Math.floor(1000/50)+2)
  })
  it('continues polling through a resumable owner failure instead of stopping the generation', async () => {
    // The lease owner's request can fail recoverably (provider timeout)
    // after checkpoints were saved. The backend marks the failure
    // resumable; the driver must keep polling so a later request resumes
    // the same job instead of reporting Generation stopped.
    const calls=[{id:'call-1',model:'muse-spark-1.3',stage:'chief_editor',attempt:1,startedAt:1760000000000,endedAt:1760000010000,status:'completed'}]
    const responses=[
      new Response(JSON.stringify({format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'provider_or_validation',modelCalls:calls,resume:{recoverable:true,failedStage:'reviewer',attemptsUsed:1,chargedUnits:4}}),{status:503}),
      new Response(JSON.stringify({status:'preparing',fallbackReason:'analysis_pending',eligibleImages:6,requiredImages:6,generationStage:'reviewer',modelCalls:calls,preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:0}}),{status:202}),
      new Response(JSON.stringify(articleResponseFixture()),{status:200}),
    ]
    const fetcher=vi.fn(async()=>responses.shift()!)
    const polls:ArticlePoll[]=[]
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:5,onPoll:poll=>polls.push(poll)})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.status).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)
    // The failed attempt's carried calls still reach the live log.
    expect(polls[0].modelCalls).toHaveLength(1)
    expect(polls[0].modelCalls![0]).toMatchObject({status:'completed'})
  })
  it('treats a lapsed-lease 503 as transitional while the job still generates', async () => {
    // generation_interrupted means the lease lapsed, not that the job
    // reached a verdict: the previous owner may still complete it, or a
    // later poll resumes it. Keep polling for the real outcome.
    const responses=[
      new Response(JSON.stringify({format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'generation_interrupted'}),{status:503}),
      new Response(JSON.stringify(articleResponseFixture()),{status:200}),
    ]
    const fetcher=vi.fn(async()=>responses.shift()!)
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{pollGapMs:5})
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.status).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('tolerates a few unparseable edge responses but fails fast on a sustained outage', async () => {
    // Edge 502/524 pages carry no job verdict: isolated blips must not
    // stop a live generation, while a sustained outage still fails fast
    // instead of polling to the overall bound.
    let n=0
    const flaky=vi.fn(async()=>++n<=2?new Response('<html>edge error</html>',{status:502}):new Response(JSON.stringify(articleResponseFixture()),{status:200}))
    const recovered=await fetchArticleEdition('quiet rooms',true,flaky as unknown as typeof fetch,{pollGapMs:5})
    expect(recovered.edition?.articleEdition.articles).toHaveLength(3)
    expect(flaky).toHaveBeenCalledTimes(3)
    const outage=vi.fn(async()=>new Response('<html>edge error</html>',{status:502}))
    const result=await fetchArticleEdition('quiet rooms',true,outage as unknown as typeof fetch,{pollGapMs:5})
    expect(result.edition).toBeNull()
    expect(result.status).toBe('request_failed')
    expect(result.timedOut).toBe(false)
    expect(outage).toHaveBeenCalledTimes(3)
  })
  it('still reports a budget denial terminally instead of polling through it', async () => {
    // A resumable-for-later budget denial is not active generation: the
    // real reason must reach the UI at once, not after the overall bound.
    const denied=await fetchArticleEdition('quiet rooms',true,err(503,{format:ARTICLE_CONTRACT_VERSION,source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'budget',budget:{limitType:'per_ip_hourly',limit:200,used:200,remaining:0,requestedUnits:4,measure:'units',retryAfterSeconds:60},resume:{recoverable:true,failedStage:null,attemptsUsed:1,chargedUnits:4}}) as unknown as typeof fetch,{pollGapMs:5})
    expect(denied.edition).toBeNull()
    expect(denied.status).toBe('fallback')
    expect(denied.fallbackReason).toBe('budget')
  })
})
