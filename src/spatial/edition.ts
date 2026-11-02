import {z} from 'zod'
import {
  defaultPreferences,editorialDemoCatalog,editorialPlan,fallbackPlan,
  type EditorialEdition,type EditorialPlan,type EditorialPreferences,
} from '../../shared/editorial'
import {catalogItem} from '../../shared/catalog'
import {readerDemoCatalog} from '../editorial-demo-media'
import {parseGenerationMetadata,type EditorialMode,type GenerationMetadata} from './editorial-mode'

// Implements docs/SILVER_FIELD_BACKEND_INTEGRATION on the client: consume the
// Worker's validated plan plus its returned items, joined by both IDs, and
// classify the result honestly. Publication eligibility and AI authorization
// stay server-authoritative: the client verifies response shape and the ID
// join, and never substitutes local pool records for returned items.
export type HonestState='meta'|'meta-cached'|'deterministic-d1'|'deterministic-fictional'|'authored-fallback'

// Cultural Intelligence V3 fields ride opaquely beside the strict contract:
// every known plan field still validates exactly as before, while the V3
// version marker and per-feature claim bindings pass through untouched so the
// Sources lookup can POST the validated plan back unchanged. The client never
// interprets claim contents; only the reviewed citations response is rendered.
export type StagedPlanFeature=EditorialPlan['features'][number]&{culturalClaims?:unknown;planIndex?:number}
export type StagedPlan=Omit<EditorialPlan,'features'>&{culturalEvidenceVersion?:unknown;features:StagedPlanFeature[]}
// plan stays the stageable-feature subset exactly as before; fullPlan is the
// complete validated plan for the read-only citations lookup, which must POST
// the plan already returned by /api/editorial. planIndex on filtered features
// preserves each feature's true plan position for citation matching.
export type StagedEdition=Omit<EditorialEdition,'plan'>&{plan:StagedPlan;fullPlan:StagedPlan}
// modeError means nothing was staged and honest/edition must not render:
// a Hybrid request the server refused is never silently swapped for Lite.
// generation confirms the routed mode on reviewed Meta responses only.
export type EditionFetch={edition:StagedEdition|null;honest:HonestState;fallbackReason?:string;timedOut:boolean;modeError?:'hybrid_unavailable';generation:GenerationMetadata|null}

export function parseStagedPlan(raw:unknown):StagedPlan{
  if(typeof raw!=='object'||raw===null)throw new Error('Invalid plan')
  const {culturalEvidenceVersion,features,...core}=raw as Record<string,unknown>
  if(!Array.isArray(features))throw new Error('Invalid plan')
  const stripped=features.map(feature=>{
    if(typeof feature!=='object'||feature===null)throw new Error('Invalid plan')
    const {culturalClaims:_,...rest}=feature as Record<string,unknown>
    return rest
  })
  const plan=editorialPlan.parse({...core,features:stripped})
  const out:StagedPlan={...plan,features:plan.features.map(feature=>({...feature}))}
  if(culturalEvidenceVersion!==undefined)out.culturalEvidenceVersion=culturalEvidenceVersion
  features.forEach((feature,index)=>{
    const claims=(feature as Record<string,unknown>).culturalClaims
    if(claims!==undefined)out.features[index].culturalClaims=claims
  })
  return out
}

// Bounded wait for the full Editor → Reviewer → Revision → Confirmation
// workflow: up to four sequential provider calls against the backend's 15s
// single-call budget, plus validation and proxy margin. Expiry fails closed
// to the disclosed authored fallback (timedOut), never to a hang.
export const EDITORIAL_TIMEOUT_MS=90000

export function editionStatusCopy(timedOut:boolean,skipped:number):string{
  if(timedOut)return `The full review was still running after ${EDITORIAL_TIMEOUT_MS/1000} seconds, so this visit uses the authored edition.`
  if(skipped)return `${skipped} feature${skipped===1?'':'s'} referenced unavailable imagery and ${skipped===1?'was':'were'} left out.`
  return ''
}

// Non-strict: the Worker also sends inference usage and source records the
// spatial client does not render; attribution travels on the items.
const envelope=z.object({
  plan:z.unknown(),
  items:z.array(catalogItem),
  source:z.enum(['meta','deterministic']),
  retrieval:z.enum(['d1','fictional']),
  cached:z.boolean(),
  fallbackReason:z.string().max(80).optional(),
  generation:z.unknown().optional(),
})

const pool=()=>[...readerDemoCatalog,...editorialDemoCatalog]

export async function fetchEdition(prompt:string,consent:boolean,fetchImpl:typeof fetch=fetch,events:{onResponse?:()=>void;signal?:AbortSignal;timeoutMs?:number;editorialMode?:EditorialMode}={}):Promise<EditionFetch>{
  const prefs:EditorialPreferences={...defaultPreferences,interests:prompt}
  const fallback=(timedOut=false):EditionFetch=>{
    const plan=fallbackPlan(prefs,pool())
    return {
      edition:{plan,fullPlan:plan,items:pool(),source:'deterministic',retrieval:'fictional',cached:false},
      honest:'authored-fallback',timedOut,generation:null,
    }
  }
  // The bound always applies; a caller signal (new submit, Clear) can only
  // shorten the wait, and only the bound itself reports a timeout.
  const bound=AbortSignal.timeout(events.timeoutMs??EDITORIAL_TIMEOUT_MS)
  const signal=events.signal?AbortSignal.any([bound,events.signal]):bound
  try{
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(events.editorialMode?{prompt,consent,editorialMode:events.editorialMode}:{prompt,consent}),signal,
    })
    events.onResponse?.()
    if(!response.ok){
      // A refused Hybrid request stages nothing: falling back here would
      // silently swap the visitor's explicit mode choice for Lite.
      if(response.status===503){
        try{
          const failure=(await response.json()) as {code?:unknown}
          if(failure&&failure.code==='hybrid_unavailable'){
            return {edition:null,honest:'authored-fallback',timedOut:false,modeError:'hybrid_unavailable',generation:null}
          }
        }catch{/* fall through to the disclosed fallback */}
      }
      return fallback()
    }
    const data=envelope.parse(await response.json())
    const plan=parseStagedPlan(data.plan)
    const staged=plan.features.flatMap((feature,planIndex)=>data.items.some(item=>item.id===feature.catalogId&&item.image.id===feature.assetId)?[{...feature,planIndex}]:[])
    if(!staged.length)return fallback()
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {
      edition:{plan:{...plan,features:staged},fullPlan:plan,items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached},
      honest,fallbackReason:data.fallbackReason,timedOut:false,generation:parseGenerationMetadata(data.generation),
    }
  }catch{
    return fallback(bound.aborted)
  }
}
