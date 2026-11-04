// One in-flight article exploration, persisted across a tab reload so a
// refresh resumes the same D1 job instead of starting a duplicate one.
// sessionStorage scopes the record to its tab: closing the tab ends the
// exploration, reloading it continues polling with the same explorationId.
import {SPATIAL_SESSION_KEY} from './clear'

export type ExplorationFormat='articles'|'story'|'standard'
export type ExplorationSession={version:1;prompt:string;startedAt:number;explorationId?:string;consent?:boolean;mode?:string;format?:ExplorationFormat;outcome?:'completed'|'failed'}
type Store=Pick<Storage,'getItem'|'setItem'>

export function saveExplorationSession(store:Store,session:ExplorationSession){
  try{store.setItem(SPATIAL_SESSION_KEY,JSON.stringify(session))}catch{/* Private browsing keeps the visit in memory only. */}
}

const uuidLike=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function loadExplorationSession(store:Pick<Storage,'getItem'>):ExplorationSession|null{
  let raw:string|null=null
  try{raw=store.getItem(SPATIAL_SESSION_KEY)}catch{return null}
  if(!raw)return null
  try{
    const value=JSON.parse(raw) as Partial<ExplorationSession>
    if(value?.version!==1||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>1000||typeof value.startedAt!=='number')return null
    if(value.explorationId!==undefined&&!uuidLike.test(value.explorationId))return null
    if(value.outcome!==undefined&&value.outcome!=='completed'&&value.outcome!=='failed')return null
    return {version:1,prompt:value.prompt,startedAt:value.startedAt,
      ...(value.explorationId?{explorationId:value.explorationId}:{}),
      ...(typeof value.consent==='boolean'?{consent:value.consent}:{}),
      ...(typeof value.mode==='string'?{mode:value.mode}:{}),
      ...(value.format==='articles'||value.format==='story'||value.format==='standard'?{format:value.format}:{}),
      ...(value.outcome?{outcome:value.outcome}:{})}
  }catch{return null}
}

// Marks the terminal outcome only when the stored record still belongs to
// this exploration: a superseded submission must never close a newer one.
export function markExplorationOutcome(store:Store,explorationId:string,outcome:'completed'|'failed'){
  const current=loadExplorationSession(store)
  if(current?.explorationId!==explorationId)return
  saveExplorationSession(store,{...current,outcome})
}
