import type {ArticlePoll} from './articles'

// Editorial progress model. Every transition below is driven by an observed
// backend response: poll outcomes, reported generation stages, measured
// eligible-image counts, or terminal results. Nothing here simulates,
// interpolates, or predicts workflow state.
export type StageStatus='QUEUED'|'RUNNING'|'COMPLETE'|'FAILED'|'SKIPPED'
export type ProgressStage={id:string;label:string;status:StageStatus;fraction:number|null;meta:string|null}
export type ProgressEvent={key:string;text:string}
export type ProgressSnapshot={stages:ProgressStage[];events:ProgressEvent[];done:number;total:number}
export type StageTone='waiting'|'running'|'advancing'|'complete'|'failed'

export function stageTone(stage:ProgressStage):StageTone{
  if(stage.status==='FAILED')return 'failed'
  if(stage.status==='COMPLETE')return 'complete'
  if(stage.status!=='RUNNING')return 'waiting'
  if(stage.fraction===null)return 'running'
  return stage.fraction>=0.5?'advancing':'running'
}

const GEN_ORDER:Record<string,number>={evidence:0,chief_editor:1,reviewer:2,revision:3,confirmation:4}
const GEN_ROWS:Record<string,string>={evidence:'evidence',chief_editor:'chief',reviewer:'review',revision:'revision',confirmation:'confirmation'}
const GEN_START:Record<string,string>={
  evidence:'Gathering editorial evidence.',
  chief_editor:'Chief Editor is composing your story…',
  reviewer:'Independent Reviewer is evaluating the draft.',
  revision:'Revision Editor is refining the narrative.',
  confirmation:'Running final confirmation.',
}
const GEN_DONE:Record<string,string>={
  evidence:'Editorial evidence ready.',
  chief_editor:'Chief Editor finished the draft.',
  reviewer:'Independent Reviewer finished the assessment.',
  revision:'Revision complete.',
  confirmation:'Final editorial review passed.',
}

export type ArticleFinish={ok:boolean;staged?:boolean;evidence?:{interpretations:number}|null;revised:boolean;failureStage?:string|null;fallbackReason?:string|null;frozen?:boolean}

export function createArticleTracker(){
  const stages:ProgressStage[]=[
    {id:'verify',label:'Image & Catalog Verification',status:'RUNNING',fraction:null,meta:null},
    {id:'analyze',label:'Visual Analysis',status:'QUEUED',fraction:null,meta:null},
    {id:'evidence',label:'Editorial Evidence Preparation',status:'QUEUED',fraction:null,meta:null},
    {id:'chief',label:'Chief Editor — Story Composition',status:'QUEUED',fraction:null,meta:null},
    {id:'review',label:'Independent Reviewer — Editorial Assessment',status:'QUEUED',fraction:null,meta:null},
    {id:'revision',label:'Revision Editor',status:'QUEUED',fraction:null,meta:null},
    {id:'confirm',label:'Final Confirmation',status:'QUEUED',fraction:null,meta:null},
    {id:'story',label:'Story Ready',status:'RUNNING',fraction:null,meta:null},
  ]
  const hidden=new Set(['revision','confirm'])
  const seen=new Set<string>()
  const events:ProgressEvent[]=[]
  let genIndex=-1,finished=false
  const byId=(id:string)=>stages.find(stage=>stage.id===id)!
  const emit=(key:string,text:string)=>{if(seen.has(key))return;seen.add(key);events.push({key,text});while(events.length>9)events.shift()}
  const complete=(id:string,doneKey:string,doneText:string)=>{const row=byId(id);if(row.status==='COMPLETE')return;row.status='COMPLETE';row.fraction=1;emit(doneKey,doneText)}
  const snapshot=():ProgressSnapshot=>{
    const visible=stages.filter(stage=>!hidden.has(stage.id))
    return {stages:visible.map(stage=>({...stage})),events:events.map(event=>({...event})),done:visible.filter(stage=>stage.status==='COMPLETE').length,total:visible.length}
  }
  emit('start','Contacting the editorial team…')
  return {
    snapshot,
    poll(input:ArticlePoll):ProgressSnapshot{
      if(finished)return snapshot()
      complete('verify','verify-done','Approved imagery verified.')
      if(input.eligibleImages!==null&&input.requiredImages!==null&&input.requiredImages>0){
        const analyze=byId('analyze')
        if(input.eligibleImages>=input.requiredImages){
          analyze.meta=`${input.eligibleImages} of ${input.requiredImages} images`
          complete('analyze','analyze-done','Visual observations ready.')
        }else if(analyze.status!=='COMPLETE'){
          analyze.status='RUNNING'
          analyze.fraction=Math.min(1,input.eligibleImages/input.requiredImages)
          analyze.meta=`${input.eligibleImages} of ${input.requiredImages} images${input.processing?' · '+input.processing+' in progress':''}`
          emit('analyze-run','Preparing visual observations…')
        }
      }
      if(input.outcome==='evidence_ready'){
        const analyze=byId('analyze')
        if(input.eligibleImages!==null&&input.requiredImages!==null)analyze.meta=`${input.eligibleImages} of ${input.requiredImages} images`
        complete('analyze','analyze-done','Visual observations ready.')
      }
      if(input.outcome==='waiting_for_capacity')emit('capacity','Waiting for review capacity…')
      if(input.outcome==='reviewing'||input.generationStage){
        const analyze=byId('analyze')
        complete('analyze','analyze-done','Visual observations ready.')
        if(analyze.meta===null&&input.eligibleImages!==null&&input.requiredImages!==null)analyze.meta=`${input.eligibleImages} of ${input.requiredImages} images`
      }
      const order=input.generationStage?GEN_ORDER[input.generationStage]:undefined
      if(order!==undefined&&order>genIndex){
        genIndex=order
        for(const [stage,index] of Object.entries(GEN_ORDER)){
          if(index>=order)break
          complete(GEN_ROWS[stage],`${stage}-done`,GEN_DONE[stage])
        }
        const row=byId(GEN_ROWS[input.generationStage!])
        hidden.delete(row.id)
        if(row.status!=='COMPLETE'){
          row.status='RUNNING'
          if(input.generationStage==='revision')emit('revision-asked','Reviewer requested revisions.')
          emit(`${input.generationStage}-run`,GEN_START[input.generationStage!])
        }
      }else if(input.outcome==='reviewing'&&byId('evidence').status==='QUEUED'){
        byId('evidence').status='RUNNING'
        emit('evidence-run',GEN_START.evidence)
      }
      return snapshot()
    },
    finish(input:ArticleFinish):ProgressSnapshot{
      if(finished)return snapshot()
      finished=true
      if(input.frozen){
        emit('frozen','Stopped waiting for the editorial team.')
        return snapshot()
      }
      const rowFor=(stage:string|null|undefined)=>stage==='chief_editor'?'chief':stage==='reviewer'?'review':stage==='revision'?'revision':stage==='confirmation'?'confirmation':null
      if(input.ok){
        complete('verify','verify-done','Approved imagery verified.')
        complete('analyze','analyze-done','Visual observations ready.')
        const evidence=byId('evidence')
        if(input.evidence===null){evidence.status='SKIPPED'}
        else{
          evidence.status='COMPLETE';evidence.fraction=1
          if(input.evidence!==undefined)evidence.meta=input.evidence.interpretations===1?'1 observation':`${input.evidence.interpretations} observations`
          emit('evidence-done',GEN_DONE.evidence)
        }
        complete('chief','chief-done',GEN_DONE.chief_editor)
        complete('review','review-done',GEN_DONE.reviewer)
        if(input.revised){
          hidden.delete('revision');hidden.delete('confirm')
          emit('revision-asked','Reviewer requested revisions.')
          complete('revision','revision-done',GEN_DONE.revision)
          complete('confirm','confirm-done',GEN_DONE.confirmation)
        }
        if(input.staged===false){
          const story=byId('story');story.status='FAILED'
          emit('staging-failed','Story staging failed.')
        }else complete('story','story-done','Your story is ready.')
        return snapshot()
      }
      const fail=(id:string)=>{hidden.delete(id);const row=byId(id);if(row.status!=='COMPLETE'){row.status='FAILED'}}
      const skipRest=(after:string)=>{
        const order=['verify','analyze','evidence','chief','review','revision','confirm']
        for(const id of order.slice(order.indexOf(after)+1))if(byId(id).status==='QUEUED')byId(id).status='SKIPPED'
      }
      if(input.fallbackReason==='insufficient_content'){
        complete('verify','verify-done','Approved imagery verified.')
        fail('analyze');skipRest('analyze')
      }else if(input.fallbackReason==='evidence_unavailable'){
        complete('verify','verify-done','Approved imagery verified.')
        complete('analyze','analyze-done','Visual observations ready.')
        fail('evidence');skipRest('evidence')
      }else if(input.fallbackReason==='catalog_unavailable'){
        fail('verify');skipRest('verify')
      }else if(rowFor(input.failureStage)){
        const failed=rowFor(input.failureStage)!
        complete('verify','verify-done','Approved imagery verified.')
        complete('analyze','analyze-done','Visual observations ready.')
        complete('evidence','evidence-done',GEN_DONE.evidence)
        for(const id of ['chief','review','revision','confirm']){
          if(id===failed)break
          complete(id,`${id}-done`,id==='chief'?GEN_DONE.chief_editor:id==='review'?GEN_DONE.reviewer:GEN_DONE.revision)
        }
        fail(failed);skipRest(failed)
      }else if(input.fallbackReason==='budget'){
        emit('budget','Stopped: inference budget reached.')
      }else{
        for(const row of stages)if(row.status==='QUEUED')row.status='SKIPPED'
      }
      fail('story')
      emit('failed','Generation stopped.')
      return snapshot()
    },
  }
}

export function createStandardTracker(){
  const stages:ProgressStage[]=[
    {id:'curation',label:'Editorial Curation',status:'RUNNING',fraction:null,meta:null},
    {id:'story',label:'Story Ready',status:'RUNNING',fraction:null,meta:null},
  ]
  const events:ProgressEvent[]=[{key:'start',text:'Curating your exhibition…'}]
  let finished=false
  const snapshot=():ProgressSnapshot=>({stages:stages.map(stage=>({...stage})),events:events.map(event=>({...event})),done:stages.filter(stage=>stage.status==='COMPLETE').length,total:stages.length})
  return {
    snapshot,
    finish(source:'meta'|'deterministic'):ProgressSnapshot{
      if(finished)return snapshot()
      finished=true
      for(const row of stages){row.status='COMPLETE';row.fraction=1}
      if(source==='meta')events.push({key:'ai-done',text:'AI curation complete.'})
      events.push({key:'story-done',text:'Your exhibition is ready.'})
      return snapshot()
    },
  }
}
