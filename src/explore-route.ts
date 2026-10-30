import {z} from 'zod'
import {editorialPlan,editorialPreferences,type EditorialEdition,type EditorialPreferences} from '../shared/editorial'

const KEY='curio.explore.edition.v1'
const MAX_AGE=6*60*60*1000
const snapshot=z.strictObject({version:z.literal(1),savedAt:z.number(),plan:editorialPlan,prefs:editorialPreferences,source:z.enum(['meta','deterministic']),retrieval:z.enum(['d1','fictional']),cached:z.boolean()})
export type ExploreSnapshot=z.infer<typeof snapshot>

export function isExplorePath(path:string){return path==='/explore'||path==='/explore/'}
export function storeExploreEdition(edition:EditorialEdition,prefs:EditorialPreferences){
 // Only the validated edition and non-text ranking settings need revalidation.
 // Do not retain the reader's original prompt or consent choice in browser storage.
 const safePrefs={...prefs,interests:'',consent:false}
 try {sessionStorage.setItem(KEY,JSON.stringify(snapshot.parse({version:1,savedAt:Date.now(),plan:edition.plan,prefs:safePrefs,source:edition.source,retrieval:edition.retrieval,cached:edition.cached})))} catch {/* Storage may be blocked; the in-memory edition remains usable. */}
}
export function readExploreEdition():ExploreSnapshot|null {
 try {
  const raw=sessionStorage.getItem(KEY);if(!raw||raw.length>20000)return null
  const parsed=snapshot.safeParse(JSON.parse(raw));if(!parsed.success||Date.now()-parsed.data.savedAt>MAX_AGE||parsed.data.savedAt>Date.now()+60000)return null
  return parsed.data
 }catch{return null}
}
export function navigateExplore(path:'/'|'/explore'){
 if(window.location.pathname!==path)window.history.pushState({curio:true},'',path)
 window.dispatchEvent(new Event('curio:route'))
}
