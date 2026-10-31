import {describe,expect,it,vi} from 'vitest'
import {defaultPreferences,editorialDemoCatalog,fallbackPlan} from '../shared/editorial'
import {readerDemoCatalog} from '../src/editorial-demo-media'
import {fetchEdition} from '../src/spatial/edition'

const pool=[...readerDemoCatalog,...editorialDemoCatalog]
const prefs={...defaultPreferences,interests:'quiet rooms'}

describe('spatial edition fetch',()=>{
 it('falls back to the authored edition when the Worker is unreachable',async()=>{
  const failing=vi.fn(async()=>{throw Error('offline')})
  const {edition,honest}=await fetchEdition('quiet rooms',failing as unknown as typeof fetch)
  expect(honest).toBe('authored-fallback')
  expect(edition.plan.features.length).toBeGreaterThan(0)
  expect(edition.source).toBe('deterministic')
 })
 it('passes through a grounded meta edition unchanged',async()=>{
  const plan=fallbackPlan(prefs,pool)
  const ok=vi.fn(async()=>new Response(JSON.stringify({plan,items:pool,source:'meta',retrieval:'d1',cached:false}),{status:200}))
  const {edition,honest}=await fetchEdition('quiet rooms',ok as unknown as typeof fetch)
  expect(honest).toBe('meta')
  expect(edition.plan.features).toHaveLength(plan.features.length)
 })
 it('replaces Worker-authored fiction with the local fallback like the 2D reader',async()=>{
  const plan=fallbackPlan(prefs,pool)
  const fiction=vi.fn(async()=>new Response(JSON.stringify({plan,items:pool,source:'deterministic',retrieval:'fictional',cached:false}),{status:200}))
  const {honest}=await fetchEdition('quiet rooms',fiction as unknown as typeof fetch)
  expect(honest).toBe('authored-fallback')
 })
 it('falls back on invalid source claims',async()=>{
  const bad=vi.fn(async()=>new Response(JSON.stringify({plan:fallbackPlan(prefs,pool),items:pool,source:'studio',retrieval:'d1'}),{status:200}))
  const {honest}=await fetchEdition('quiet rooms',bad as unknown as typeof fetch)
  expect(honest).toBe('authored-fallback')
 })
})
