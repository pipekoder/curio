import {describe,expect,it,vi} from 'vitest'
import {defaultPreferences,editorialDemoCatalog,fallbackPlan} from '../shared/editorial'
import {readerDemoCatalog} from '../src/editorial-demo-media'
import {EDITORIAL_TIMEOUT_MS,editionStatusCopy,fetchEdition} from '../src/spatial/edition'

const pool=[...readerDemoCatalog,...editorialDemoCatalog]
const prefs={...defaultPreferences,interests:'quiet rooms'}
const plan=()=>fallbackPlan(prefs,pool)
const ok=(body:unknown)=>vi.fn(async()=>new Response(JSON.stringify(body),{status:200}))

describe('spatial edition fetch',()=>{
 it('falls back to the authored edition when the Worker is unreachable',async()=>{
  const failing=vi.fn(async()=>{throw Error('offline')})
  const {edition,honest}=await fetchEdition('quiet rooms',false,failing as unknown as typeof fetch)
  expect(honest).toBe('authored-fallback')
  expect(edition.plan.features.length).toBeGreaterThan(0)
  expect(edition.source).toBe('deterministic')
 })
 it('sends the actual consent value, defaulting to the caller choice',async()=>{
  const seen:string[]=[]
  const spy=vi.fn(async(_url:unknown,init:{body:string})=>{seen.push(init.body);return new Response('x',{status:503})})
  await fetchEdition('quiet rooms',false,spy as unknown as typeof fetch)
  await fetchEdition('quiet rooms',true,spy as unknown as typeof fetch)
  expect(seen.map(body=>(JSON.parse(body) as {consent:boolean}).consent)).toEqual([false,true])
 })
 it('classifies meta, cached meta, and deterministic states',async()=>{
  const base={plan:plan(),items:pool}
  for(const [body,honest] of [
    [{...base,source:'meta',retrieval:'d1',cached:false},'meta'],
    [{...base,source:'meta',retrieval:'d1',cached:true},'meta-cached'],
    [{...base,source:'deterministic',retrieval:'d1',cached:false,fallbackReason:'pilot_not_ready'},'deterministic-d1'],
    [{...base,source:'deterministic',retrieval:'fictional',cached:false,fallbackReason:'disabled'},'deterministic-fictional'],
  ] as const){
    const {edition,honest:got,fallbackReason}=await fetchEdition('quiet rooms',false,ok(body) as unknown as typeof fetch)
    expect(got).toBe(honest)
    expect(edition.items).toStrictEqual(body.items)
    if('fallbackReason' in body)expect(fallbackReason).toBe(body.fallbackReason)
  }
 })
 it('stages only features joining returned items on both IDs',async()=>{
  const joined={...plan(),features:[plan().features[0]]}
  const body={plan:joined,items:pool,source:'meta',retrieval:'d1',cached:false}
  const {edition,honest}=await fetchEdition('quiet rooms',false,ok(body) as unknown as typeof fetch)
  expect(honest).toBe('meta')
  expect(edition.plan.features).toHaveLength(1)
  const stray={...plan(),features:[{...plan().features[0],catalogId:'no-such-id'}]}
  const missed=await fetchEdition('quiet rooms',false,ok({...body,plan:stray}) as unknown as typeof fetch)
  expect(missed.honest).toBe('authored-fallback')
 })
 it('falls back on invalid envelopes and source claims',async()=>{
  const bad=ok({plan:plan(),items:pool,source:'studio',retrieval:'d1'})
  expect((await fetchEdition('quiet rooms',false,bad as unknown as typeof fetch)).honest).toBe('authored-fallback')
  const shapeless=ok({plan:{title:'x'},items:[{id:'?'}],source:'meta',retrieval:'d1',cached:false})
  expect((await fetchEdition('quiet rooms',false,shapeless as unknown as typeof fetch)).honest).toBe('authored-fallback')
 })
 it('reports first response for assembly timing, but not on network failure',async()=>{
  const seen: string[]=[]
  const response=ok({plan:plan(),items:pool,source:'meta',retrieval:'d1',cached:false})
  await fetchEdition('quiet rooms',false,response as unknown as typeof fetch,{onResponse:()=>seen.push('response')})
  expect(seen).toEqual(['response'])
  const failing=vi.fn(async()=>{throw Error('offline')})
  await fetchEdition('quiet rooms',false,failing as unknown as typeof fetch,{onResponse:()=>seen.push('response')})
  expect(seen).toEqual(['response'])
 })
 it('waits out the full-review bound for a slow meta workflow',async()=>{
  expect(EDITORIAL_TIMEOUT_MS).toBe(90000)
  const body={plan:plan(),items:pool,source:'meta',retrieval:'d1',cached:false}
  const slow=vi.fn(async()=>{
    await new Promise(resolve=>setTimeout(resolve,25))
    return new Response(JSON.stringify(body),{status:200})
  })
  const {honest,timedOut}=await fetchEdition('quiet rooms',true,slow as unknown as typeof fetch,{timeoutMs:1000})
  expect(honest).toBe('meta')
  expect(timedOut).toBe(false)
 })
 it('fails closed with a timeout flag when the bound expires',async()=>{
  const hanging=vi.fn(async(_url:unknown,init:{signal?:AbortSignal})=>new Promise<never>((_,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(Error('aborted')))
  }))
  const {edition,honest,timedOut}=await fetchEdition('quiet rooms',true,hanging as unknown as typeof fetch,{timeoutMs:30})
  expect(honest).toBe('authored-fallback')
  expect(timedOut).toBe(true)
  expect(edition.plan.features.length).toBeGreaterThan(0)
 })
 it('treats caller cancellation as stale, not as a timeout',async()=>{
  const hanging=vi.fn(async(_url:unknown,init:{signal?:AbortSignal})=>new Promise<never>((_,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(Error('aborted')))
  }))
  const controller=new AbortController()
  const pending=fetchEdition('quiet rooms',true,hanging as unknown as typeof fetch,{signal:controller.signal,timeoutMs:5000})
  controller.abort()
  const {honest,timedOut}=await pending
  expect(honest).toBe('authored-fallback')
  expect(timedOut).toBe(false)
 })
 it('stages reviewed v3 features with grounding fields and varied text length',async()=>{
  // Mirrors the worker's own reviewed-plan shape (tests/editorial-public):
  // qualityVersion 3, observation keys, discovery questions, source IDs.
  // Forward-compatibility constraint: the client parses features with
  // strictObject and fails closed to the authored fallback on unknown keys.
  // The Editorial Feature response schema must stay frozen during V2
  // activation unless a coordinated frontend parser update is approved.
  const first=pool[0],second=pool[1]
  const long='Imagine the visible arrangement inviting a closer look at the space around each form. '.repeat(4).trim().slice(0,395)
  const reviewed={
    qualityVersion:3,title:'The Architecture of Attention',deck:'Two visual studies invite a closer look.',
    features:[
      {catalogId:first.id,assetId:first.image.id,headline:'Where Attention Begins',narrative:long,
        observationKeys:['subjects.seating'],discoveryQuestion:'How does this arrangement change the surrounding space?',
        sourceIds:['src:demo-1'],layout:'hero',motion:'still',theme:first.lifestyleTags[0]},
      {catalogId:second.id,assetId:second.image.id,headline:'A Second View',narrative:'Consider a second composition.',
        sourceIds:['src:demo-2'],layout:'split',motion:'still',theme:second.lifestyleTags[0]},
    ],
  }
  const body={plan:reviewed,items:pool,source:'meta',retrieval:'d1',cached:false,
    imageContextAssetIds:[first.image.id],inference:{attempted:true,reservedUnits:4,latencyMs:12000,usage:null}}
  const {edition,honest,timedOut}=await fetchEdition('quiet rooms',true,ok(body) as unknown as typeof fetch)
  expect(honest).toBe('meta')
  expect(timedOut).toBe(false)
  expect(edition.plan.features).toHaveLength(2)
  expect(edition.plan.features[0].narrative).toHaveLength(long.length)
 })
 it('discloses timeouts and skipped features in edition status',()=>{
  expect(editionStatusCopy(true,0)).toContain('90 seconds')
  expect(editionStatusCopy(true,0)).toContain('authored edition')
  expect(editionStatusCopy(true,2)).toContain('90 seconds')
  expect(editionStatusCopy(false,2)).toBe('2 features referenced unavailable imagery and were left out.')
  expect(editionStatusCopy(false,0)).toBe('')
 })
})
