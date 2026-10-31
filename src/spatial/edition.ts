import {
  defaultPreferences,editorialDemoCatalog,fallbackPlan,validatePlan,
  type EditorialEdition,type EditorialPreferences,
} from '../../shared/editorial'
import {editorialSources} from '../../shared/editorial-sources'
import {approvedExternalAssets} from '../../shared/url-policy'
import {readerDemoCatalog} from '../editorial-demo-media'

// Mirrors the 2D reader's honesty rules: try the Worker edition, validate it,
// join features to the approved local catalogs, and otherwise serve the
// authored local fallback with an explicit label. Nothing is ever simulated.
export type EditionFetch={edition:EditorialEdition;honest:'meta'|'authored-fallback'}

const pool=()=>[...readerDemoCatalog,...editorialDemoCatalog]

export async function fetchEdition(prompt:string,fetchImpl:typeof fetch=fetch):Promise<EditionFetch>{
  const prefs:EditorialPreferences={...defaultPreferences,interests:prompt}
  const fallback=():EditionFetch=>({
    edition:{plan:fallbackPlan(prefs,pool()),items:pool(),source:'deterministic',retrieval:'fictional',cached:false},
    honest:'authored-fallback',
  })
  try{
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,consent:false}),signal:AbortSignal.timeout(20000),
    })
    if(!response.ok)return fallback()
    const data=await response.json() as EditorialEdition&{editorialSources?:unknown}
    if(!['meta','deterministic'].includes(data.source)||!['d1','fictional'].includes(data.retrieval))return fallback()
    // A disabled public model returns Worker-authored fiction; like the 2D
    // reader, the spatial demo stages the approved local catalog instead.
    if(data.source==='deterministic'&&data.retrieval==='fictional')return fallback()
    const sources=editorialSources.parse(data.editorialSources??[])
    const plan=validatePlan(data.plan,pool(),approvedExternalAssets,sources)
    const staged=plan.features.filter(feature=>pool().some(item=>item.id===feature.catalogId&&item.image.id===feature.assetId))
    if(!staged.length)return fallback()
    return {edition:{plan:{...plan,features:staged},items:pool(),source:data.source,retrieval:data.retrieval,cached:!!data.cached},honest:'meta'}
  }catch{
    return fallback()
  }
}
