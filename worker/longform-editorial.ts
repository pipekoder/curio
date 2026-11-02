import {z} from 'zod'

const source=z.strictObject({id:z.string().min(1).max(180),kind:z.enum(['brand_product','cultural_research','visual_object']),assetVersionId:z.string().regex(/^version-[a-f0-9]{64}$/).nullable(),text:z.string().min(1).max(2000),verified:z.literal(true),rightsApproved:z.literal(true),digest:z.string().regex(/^[a-f0-9]{64}$/)})
export const longformInput=z.strictObject({prompt:z.string().trim().min(3).max(500),voice:z.string().trim().min(1).max(40),knowledgeVersion:z.string().min(1).max(100),sources:z.array(source).min(4).max(24)})
export type LongformInput=z.infer<typeof longformInput>
const section=z.strictObject({id:z.string().regex(/^section-[1-4]$/),heading:z.string().min(4).max(100),purpose:z.string().min(20).max(300),sourceIds:z.array(z.string()).min(1).max(8)})
export const outline=z.strictObject({title:z.string().min(8).max(140),thesis:z.string().min(30).max(500),sections:z.tuple([section,section,section,section])})
export type LongformOutline=z.infer<typeof outline>
export const draft=z.strictObject({text:z.string().min(1200).max(9000),sourceIds:z.array(z.string()).min(1).max(8)})
export const review=z.strictObject({decision:z.enum(['PASS','REVISE','REJECT']),hardFailure:z.boolean(),findings:z.array(z.string().min(5).max(260)).max(8)})
export type LongformReview=z.infer<typeof review>
type SectionState={id:string;text:string|null;sourceIds:string[];approved:boolean;reviewed:boolean;revisionCount:number;findings:string[]}
export type LongformState={phase:'outline'|'sections'|'whole_review'|'complete'|'failed';outline:LongformOutline|null;sections:SectionState[];cursor:number;modelCalls:number;failure:string|null;wordCount:number|null;lastTransientError?:string|null}
export type LongformJob={id:string;cacheKey:string;input:LongformInput;state:LongformState;revision:number}
export type LongformModel={outline(input:LongformInput):Promise<unknown>;draft(input:LongformInput,outline:LongformOutline,section:LongformOutline['sections'][number]):Promise<unknown>;reviewSection(input:LongformInput,outline:LongformOutline,section:SectionState):Promise<unknown>;revise(input:LongformInput,outline:LongformOutline,section:SectionState):Promise<unknown>;reviewWhole(input:LongformInput,outline:LongformOutline,sections:SectionState[]):Promise<unknown>}
const words=(text:string)=>text.trim().split(/\s+/).filter(Boolean).length
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('')
const sourceSet=(input:LongformInput)=>new Set(input.sources.map(item=>item.id))
const cites=(ids:string[],allowed:Set<string>)=>ids.every(id=>allowed.has(id))&&new Set(ids).size===ids.length
const freshState=():LongformState=>({phase:'outline',outline:null,sections:[],cursor:0,modelCalls:0,failure:null,wordCount:null})

// A job can advance by at most one bounded model call per invocation. A later
// adapter must route those calls through the existing budget/consent controls.
export class LongformJobStore {
 constructor(private db:D1Database){}
 async create(raw:unknown){
  const input=longformInput.parse(raw),ids=sourceSet(input)
  if(ids.size!==input.sources.length)throw Error('Duplicate source IDs')
  const cacheKey=await hash(JSON.stringify(input)),id=`article-${cacheKey}`,stamp=new Date().toISOString()
  await this.db.prepare('INSERT OR IGNORE INTO longform_editorial_jobs(id,cache_key,input_json,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,cacheKey,JSON.stringify(input),JSON.stringify(freshState()),stamp,stamp).run()
  const job=await this.load(id);if(!job)throw Error('Article job could not be loaded')
  return job
 }
 async load(id:string):Promise<LongformJob|null>{
  if(!/^article-[a-f0-9]{64}$/.test(id))return null
  const row=await this.db.prepare('SELECT * FROM longform_editorial_jobs WHERE id=?').bind(id).first<{id:string;cache_key:string;input_json:string;state_json:string;revision:number}>()
  return row?{id:row.id,cacheKey:row.cache_key,input:longformInput.parse(JSON.parse(row.input_json)),state:JSON.parse(row.state_json) as LongformState,revision:row.revision}:null
 }
 async claim(job:LongformJob){
  const lease=crypto.randomUUID(),until=new Date(Date.now()+30_000).toISOString()
  const result=await this.db.prepare(`UPDATE longform_editorial_jobs SET lease_owner=?,lease_until=? WHERE id=? AND revision=? AND (lease_owner IS NULL OR lease_until<?)`).bind(lease,until,job.id,job.revision,new Date().toISOString()).run()
  if(result.meta.changes!==1)throw Error('Article job is already advancing')
  return lease
 }
 async save(job:LongformJob,lease:string,state:LongformState){
  const result=await this.db.prepare(`UPDATE longform_editorial_jobs SET state_json=?,revision=revision+1,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND revision=? AND lease_owner=?`).bind(JSON.stringify(state),new Date().toISOString(),job.id,job.revision,lease).run()
  if(result.meta.changes!==1)throw Error('Article job lease changed; no automatic model retry')
  return {...job,state,revision:job.revision+1}
 }
}

export async function advanceLongform(store:LongformJobStore,id:string,model:LongformModel,reserve:()=>Promise<boolean>){
 const job=await store.load(id);if(!job)throw Error('Unknown article job')
 if(job.state.phase==='complete'||job.state.phase==='failed')return job
 const lease=await store.claim(job),state=structuredClone(job.state),allowed=sourceSet(job.input)
 try{
  if(state.modelCalls>=18)throw Error('Article call ceiling reached')
  if(!await reserve())throw new LongformTransientError('Article budget unavailable')
  state.modelCalls++
  if(state.phase==='outline'){
   const value=outline.parse(await model.outline(job.input))
   if(value.sections.some((item,index)=>item.id!==`section-${index+1}`||!cites(item.sourceIds,allowed)))throw Error('Invalid outline source identity')
   state.outline=value;state.sections=value.sections.map(item=>({id:item.id,text:null,sourceIds:item.sourceIds,approved:false,reviewed:false,revisionCount:0,findings:[]}));state.phase='sections'
  }else if(state.phase==='sections'){
   const current=state.sections[state.cursor],spec=state.outline!.sections[state.cursor]
   if(!current.text){
    const value=draft.parse(await model.draft(job.input,state.outline!,spec))
    if(!cites(value.sourceIds,new Set(spec.sourceIds))||words(value.text)<375||words(value.text)>1000)throw Error('Section length or source identity invalid')
    current.text=value.text;current.sourceIds=value.sourceIds
   }else if(!current.reviewed){
    const value=review.parse(await model.reviewSection(job.input,state.outline!,current))
    current.findings=value.findings;current.reviewed=true
    if(value.decision==='PASS'&&!value.hardFailure){current.approved=true;state.cursor++;if(state.cursor===4)state.phase='whole_review'}
    else if(value.decision==='REJECT'||current.revisionCount>0)throw Error('Section review rejected')
   }else{
    const value=draft.parse(await model.revise(job.input,state.outline!,current))
    if(!cites(value.sourceIds,new Set(spec.sourceIds))||words(value.text)<375||words(value.text)>1000)throw Error('Revision length or source identity invalid')
    current.text=value.text;current.sourceIds=value.sourceIds;current.reviewed=false;current.revisionCount++
   }
  }else{
   const total=state.sections.reduce((count,item)=>count+words(item.text??''),0)
   if(total<1500||total>4000||!state.sections.every(item=>item.approved))throw Error('Article length or section approval invalid')
   const value=review.parse(await model.reviewWhole(job.input,state.outline!,state.sections))
   if(value.decision!=='PASS'||value.hardFailure)throw Error('Whole-article review rejected')
   state.phase='complete';state.wordCount=total
  }
  state.lastTransientError=null
  return await store.save(job,lease,state)
 }catch(error){
  if(error instanceof LongformTransientError){state.lastTransientError=error.message;return store.save(job,lease,state)}
  state.phase='failed';state.failure=error instanceof Error?error.message:'Article processing failed'
  return store.save(job,lease,state)
 }
}
export class LongformTransientError extends Error{}
