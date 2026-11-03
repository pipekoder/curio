import {describe,expect,it,vi} from 'vitest'
import {defaultPreferences,editorialDemoCatalog,fallbackPlan} from '../shared/editorial'
import {readerDemoCatalog} from '../src/editorial-demo-media'
import {fetchEdition} from '../src/spatial/edition'
import {fetchCapabilities,parseGenerationMetadata} from '../src/spatial/editorial-mode'

const pool=[...readerDemoCatalog,...editorialDemoCatalog]
const plan=()=>fallbackPlan({...defaultPreferences,interests:'quiet rooms'},pool)
const ok=(body:unknown)=>vi.fn(async()=>new Response(JSON.stringify(body),{status:200}))

describe('editorial model routing',()=>{
  it('omits editorialMode unless the caller proves a contract backend',async()=>{
    const seen:string[]=[]
    const spy=vi.fn(async(_url:unknown,init:{body:string})=>{
      seen.push(init.body)
      return new Response(JSON.stringify({plan:plan(),items:pool,source:'meta',retrieval:'d1',cached:false}),{status:200})
    })
    await fetchEdition('quiet rooms',false,spy as unknown as typeof fetch)
    expect(JSON.parse(seen[0])).toEqual({prompt:'quiet rooms',consent:false})
    await fetchEdition('quiet rooms',true,spy as unknown as typeof fetch,{editorialMode:'hybrid'})
    expect(JSON.parse(seen[1])).toEqual({prompt:'quiet rooms',consent:true,editorialMode:'hybrid'})
  })
  it('reports hybrid_unavailable without staging instead of silent Lite',async()=>{
    const refused=vi.fn(async()=>new Response(JSON.stringify({code:'hybrid_unavailable',error:'Hybrid editorial mode is currently unavailable.'}),{status:503}))
    const result=await fetchEdition('quiet rooms',false,refused as unknown as typeof fetch,{editorialMode:'hybrid'})
    expect(result.modeError).toBe('hybrid_unavailable')
    expect(result.edition).toBeNull()
    expect(result.timedOut).toBe(false)
  })
  it('keeps the disclosed fallback for generic failures',async()=>{
    const down=vi.fn(async()=>new Response(JSON.stringify({error:'AI disabled'}),{status:503}))
    const result=await fetchEdition('quiet rooms',false,down as unknown as typeof fetch,{editorialMode:'hybrid'})
    expect(result.modeError).toBeUndefined()
    expect(result.honest).toBe('authored-fallback')
    expect(result.edition!.plan.features.length).toBeGreaterThan(0)
  })
  it('retains confirmed generation metadata on reviewed responses',async()=>{
    const generation={version:'curio-editorial-model-routing-v1',editorialMode:'hybrid',chiefEditorModel:'muse-wonder-1.0',reviewerModel:'muse-spark-1.3',revisionModel:null,confirmationModel:null}
    const body={plan:plan(),items:pool,source:'meta',retrieval:'d1',cached:false,generation}
    const result=await fetchEdition('quiet rooms',false,ok(body) as unknown as typeof fetch,{editorialMode:'hybrid'})
    expect(result.generation?.editorialMode).toBe('hybrid')
    const plain=await fetchEdition('quiet rooms',false,ok({...body,generation:undefined}) as unknown as typeof fetch)
    expect(plain.generation).toBeNull()
  })
})

describe('capabilities lookup',()=>{
  const caps={version:'curio-editorial-model-routing-v1',defaultMode:'lite',liteAvailable:true,hybridAvailable:true,modes:[]}
  it('reads hybrid availability from a contract backend',async()=>{
    expect(await fetchCapabilities(ok(caps) as unknown as typeof fetch)).toEqual({hybridAvailable:true})
    expect(await fetchCapabilities(ok({...caps,hybridAvailable:false}) as unknown as typeof fetch)).toEqual({hybridAvailable:false})
  })
  it('fails closed on missing endpoints, versions, and Lite',async()=>{
    const missing=vi.fn(async()=>new Response('nope',{status:404}))
    expect(await fetchCapabilities(missing as unknown as typeof fetch)).toBeNull()
    expect(await fetchCapabilities(ok({...caps,version:'wrong'}) as unknown as typeof fetch)).toBeNull()
    expect(await fetchCapabilities(ok({...caps,liteAvailable:false}) as unknown as typeof fetch)).toBeNull()
    const offline=vi.fn(async()=>{throw Error('offline')})
    expect(await fetchCapabilities(offline as unknown as typeof fetch)).toBeNull()
  })
})

describe('generation metadata',()=>{
  it('accepts pinned routing records and rejects the rest',()=>{
    expect(parseGenerationMetadata({version:'curio-editorial-model-routing-v1',editorialMode:'lite'}))
      .toEqual({version:'curio-editorial-model-routing-v1',editorialMode:'lite'})
    expect(parseGenerationMetadata({version:'curio-editorial-model-routing-v1',editorialMode:'ultra'})).toBeNull()
    expect(parseGenerationMetadata({version:'old',editorialMode:'lite'})).toBeNull()
    expect(parseGenerationMetadata(null)).toBeNull()
  })
  it('retains revision and confirmation models when the workflow revised',()=>{
    expect(parseGenerationMetadata({version:'curio-editorial-model-routing-v1',editorialMode:'lite',revisionModel:'muse-spark-1.3',confirmationModel:'muse-spark-1.3'}))
      .toEqual({version:'curio-editorial-model-routing-v1',editorialMode:'lite',revisionModel:'muse-spark-1.3',confirmationModel:'muse-spark-1.3'})
    expect(parseGenerationMetadata({version:'curio-editorial-model-routing-v1',editorialMode:'lite',revisionModel:null,confirmationModel:null}))
      .toEqual({version:'curio-editorial-model-routing-v1',editorialMode:'lite',revisionModel:null,confirmationModel:null})
  })
})
