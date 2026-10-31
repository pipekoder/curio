import {z} from 'zod'
import {
  defaultPreferences,editorialDemoCatalog,editorialPlan,fallbackPlan,
  type EditorialEdition,type EditorialPreferences,
} from '../../shared/editorial'
import {catalogItem} from '../../shared/catalog'
import {readerDemoCatalog} from '../editorial-demo-media'

// Implements docs/SILVER_FIELD_BACKEND_INTEGRATION on the client: consume the
// Worker's validated plan plus its returned items, joined by both IDs, and
// classify the result honestly. Publication eligibility and AI authorization
// stay server-authoritative: the client verifies response shape and the ID
// join, and never substitutes local pool records for returned items.
export type HonestState='meta'|'meta-cached'|'deterministic-d1'|'deterministic-fictional'|'authored-fallback'
export type EditionFetch={edition:EditorialEdition;honest:HonestState;fallbackReason?:string}

// Non-strict: the Worker also sends inference usage and source records the
// spatial client does not render; attribution travels on the items.
const envelope=z.object({
  plan:editorialPlan,
  items:z.array(catalogItem),
  source:z.enum(['meta','deterministic']),
  retrieval:z.enum(['d1','fictional']),
  cached:z.boolean(),
  fallbackReason:z.string().max(80).optional(),
})

const pool=()=>[...readerDemoCatalog,...editorialDemoCatalog]

export async function fetchEdition(prompt:string,consent:boolean,fetchImpl:typeof fetch=fetch,events:{onResponse?:()=>void}={}):Promise<EditionFetch>{
  const prefs:EditorialPreferences={...defaultPreferences,interests:prompt}
  const fallback=():EditionFetch=>({
    edition:{plan:fallbackPlan(prefs,pool()),items:pool(),source:'deterministic',retrieval:'fictional',cached:false},
    honest:'authored-fallback',
  })
  try{
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,consent}),signal:AbortSignal.timeout(20000),
    })
    events.onResponse?.()
    if(!response.ok)return fallback()
    const data=envelope.parse(await response.json())
    const staged=data.plan.features.filter(feature=>data.items.some(item=>item.id===feature.catalogId&&item.image.id===feature.assetId))
    if(!staged.length)return fallback()
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {
      edition:{plan:{...data.plan,features:staged},items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached},
      honest,fallbackReason:data.fallbackReason,
    }
  }catch{
    return fallback()
  }
}
