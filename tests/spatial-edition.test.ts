import {describe,expect,it,vi} from 'vitest'
import {defaultPreferences,editorialDemoCatalog,fallbackPlan} from '../shared/editorial'
import {readerDemoCatalog} from '../src/editorial-demo-media'
import {fetchEdition} from '../src/spatial/edition'

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
})
