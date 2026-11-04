import {z} from 'zod'
import {budgetExplanation,publicBudgetDiagnostic,type PublicBudgetDiagnostic} from '../../shared/budget-diagnostic'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_MIN_ELIGIBLE_IMAGES,ARTICLE_SINGLE_CONTRACT_VERSION,ARTICLE_SINGLE_MIN_ELIGIBLE_IMAGES,editorialPartialArticleEdition,editorialSingleArticleEdition,type ArticleEditionBody} from '../../shared/editorial-articles'
import {editorialTierLabel,type EditorialTierLabel} from '../../shared/editorial-tiers'
import {catalogItem,type CatalogItem} from '../../shared/catalog'
import {editorialSources,type EditorialSource} from '../../shared/editorial-sources'
import {modelCallEvents,jobNotices,type ModelCallEvent,type JobNotice} from '../../shared/article-model-calls'
import {parseGenerationMetadata,type EditorialMode,type GenerationMetadata} from './editorial-mode'
import type {HonestState} from './edition'

// Article Edition may make Chief, Reviewer, Revision and Confirmation calls
// under one D1 generation lease. Its request bound is distinct from the
// shorter standard Editorial API bound. 3-story generations run a longer
// success-first workflow with retries and resume, so they carry generous
// polling bounds; Single Story keeps the original bounds.
const ARTICLE_REQUEST_TIMEOUT_MS=180_000
const ARTICLE_3STORY_REQUEST_TIMEOUT_MS=800_000
const ARTICLE_3STORY_OVERALL_TIMEOUT_MS=900_000
// Edge 502/524 pages carry no job verdict: isolated blips must not stop a
// live generation, while this many consecutive unparseable responses in
// arrival order still fail fast instead of polling to the overall bound.
const ARTICLE_UNPARSEABLE_STREAK=3
// Live-log cadence: the lease owner holds one long request for the whole
// workflow, so strictly sequential polls would never observe it. A fresh
// poll launches on this cadence while earlier requests are still in
// flight; each 202 carries the latest persisted modelCalls. Polls are
// single-SELECT reads, so the server's retryAfterMs hint is deliberately
// not honored here.
const ARTICLE_POLL_GAP_MS=5000

// Opt-in client for docs/full-catalog-articles.md: POSTs the existing prompt
// shape plus editionFormat and stages only a fully validated article
// edition. Image URLs always come from joined items; nothing is constructed
// from IDs. Every non-AI state stays machine-readable so the UI can disclose
// it instead of implying a model succeeded.
export type ArticleStatus='disabled'|'consent_required'|'unavailable'|'insufficient_content'|'fallback'|'preparing'
export type StagedArticleEdition={
  articleEdition:ArticleEditionBody;items:CatalogItem[];
  source:'meta'|'deterministic';retrieval:'d1'|'fictional';cached:boolean
  researchReferences?:EditorialSource[];aiDisclosure?:string;editorialTier?:EditorialTierLabel
  requestedCount?:number;publishedCount?:number;partial?:boolean
}
// Partial editions stage whatever verified: only zero stageable articles is
// incomplete, whether one story or three was requested.
export function hasStageableArticles(stagedCount:number){return stagedCount>0}
export type ArticleFetch={
  edition:StagedArticleEdition|null;honest:HonestState;articleCount:1|3;
  status:ArticleStatus|'request_failed'|null;fallbackReason?:string;
  eligibleImages?:number;requiredImages?:number;validationStage?:string;
  timedOut:boolean;generation:GenerationMetadata|null;budget?:PublicBudgetDiagnostic;evidence?:{interpretations:number}|null
  modelCalls:ModelCallEvent[]|null;notices:JobNotice[]|null
}

const envelope=z.object({
  format:z.union([z.literal(ARTICLE_CONTRACT_VERSION),z.literal(ARTICLE_SINGLE_CONTRACT_VERSION)]),
  source:z.enum(['meta','deterministic']),
  retrieval:z.enum(['d1','fictional']),
  cached:z.boolean(),
  articleEdition:z.unknown(),
  items:z.array(catalogItem).optional(),
  generation:z.unknown().optional(),
  evidence:z.object({interpretations:z.number().int().min(0)}).nullable().optional(),
  researchReferences:editorialSources.optional(),aiDisclosure:z.string().max(300).optional(),
  editorialTier:editorialTierLabel.optional(),
  requestedCount:z.number().int().min(1).max(3).optional(),
  publishedCount:z.number().int().min(1).max(3).optional(),
  partial:z.boolean().optional(),
  modelCalls:modelCallEvents.optional(),
  notices:jobNotices.optional(),
})

const failure=z.object({
  status:z.enum(['disabled','consent_required','unavailable','insufficient_content','fallback','preparing']).optional(),
  fallbackReason:z.string().max(80).optional(),
  budget:publicBudgetDiagnostic.optional(),
  eligibleImages:z.number().int().min(0).optional(),
  requiredImages:z.number().int().min(0).optional(),
  generationStage:z.enum(['evidence','planning','research','chief_editor','reviewer','revision','confirmation']).optional(),
  modelCalls:modelCallEvents.optional(),
  notices:jobNotices.optional(),
  validationDiagnostic:z.object({stage:z.string().max(40),code:z.string().max(40)}).passthrough().optional(),
  preparation:z.object({retryAfterMs:z.number().int().min(0).max(60000),outcome:z.string().max(40).optional(),remainingCandidates:z.number().int().min(0).optional(),processing:z.number().int().min(0).optional()}).passthrough().optional(),
  // A recoverable 3-story failure carries resume metadata so a later poll
  // resumes the same job from checkpoints instead of stopping the UI.
  resume:z.object({recoverable:z.boolean()}).passthrough().optional(),
})

export type ArticlePoll={outcome:string|null;eligibleImages:number|null;requiredImages:number|null;remainingCandidates:number|null;processing:number|null;generationStage:string|null;modelCalls:ModelCallEvent[]|null;notices:JobNotice[]|null}

export function articleStatusCopy(fetch:ArticleFetch):{title:string;detail:string}{
  if(fetch.timedOut)return {title:'The article edition was still being reviewed.',detail:'Nothing was staged. The standard edition below remains available.'}
  if(fetch.fallbackReason==='budget'&&fetch.budget)return {title:'Article generation is temporarily limited.',detail:`${budgetExplanation(fetch.budget)} The standard edition below remains available.`}
  switch(fetch.status){
    case 'disabled':return {title:'Article editions are currently disabled.',detail:'The standard edition below remains available.'}
    case 'consent_required':return {title:'Article editions need AI consent.',detail:'Allow AI curation or continue with the standard edition.'}
    case 'insufficient_content':{
      const have=fetch.eligibleImages
      const required=fetch.requiredImages??(fetch.articleCount===1?ARTICLE_SINGLE_MIN_ELIGIBLE_IMAGES:ARTICLE_MIN_ELIGIBLE_IMAGES)
      return {title:'Not enough approved imagery for an article edition.',detail:have===undefined
        ?'The standard edition below remains available.'
        :`${have} of ${required} required images are currently eligible. The standard edition below remains available.`}
    }
    case 'preparing':return {title:'Preparing approved images for this edition.',detail:'Curio is checking saved visual evidence and analyzing only what is needed.'}
    case 'unavailable':return {title:'Article editions are currently unavailable.',detail:'The standard edition below remains available.'}
    default:return {title:'The article edition could not be composed.',detail:'Nothing was staged. The standard edition below remains available.'}
  }
}

export async function fetchArticleEdition(prompt:string,consent:boolean,fetchImpl:typeof fetch=fetch,events:{onResponse?:()=>void;onPoll?:(poll:ArticlePoll)=>void;signal?:AbortSignal;timeoutMs?:number;editorialMode?:EditorialMode;articleCount?:1|3;explorationId?:string;pollGapMs?:number}={}):Promise<ArticleFetch>{
  const articleCount=events.articleCount??3
  const editionFormat=articleCount===1?ARTICLE_SINGLE_CONTRACT_VERSION:ARTICLE_CONTRACT_VERSION
  const overallMs=events.timeoutMs??(articleCount===3?ARTICLE_3STORY_OVERALL_TIMEOUT_MS:300000)
  const bound=AbortSignal.timeout(overallMs)
  const failed=(status:ArticleFetch['status'],extra:Partial<ArticleFetch>&{timedOut?:boolean}={}):ArticleFetch=>({
    edition:null,honest:'authored-fallback',articleCount,status,timedOut:false,generation:null,modelCalls:null,notices:null,...extra,
  })
  const pollGapMs=events.pollGapMs??ARTICLE_POLL_GAP_MS
  // Paced launches run at most one per gap, so this many launches always
  // cover the whole overall window: healthy polling can never exhaust a
  // fixed count while the backend job is still active. Transport-error
  // spirals relaunch immediately and still terminate here, and the
  // overall timeout remains the wall-clock terminator.
  const maxAttempts=Math.floor(overallMs/pollGapMs)+2
  const stragglers=new Set<AbortController>()
  // One poll request. A 202 resolves poll (after firing onPoll); a
  // recoverable failure resolves transient (after surfacing its carried
  // calls); an unparseable edge response resolves unparseable; any other
  // HTTP response resolves terminally; transport failures throw.
  type AttemptResult={type:'terminal';fetch:ArticleFetch}|{type:'poll'}|{type:'transient'}|{type:'unparseable'}
  // A recoverable 3-story failure is transitional, not a verdict: a later
  // poll resumes the same job from checkpoints. So is a lapsed lease: the
  // previous owner may still complete the generating job. A budget denial
  // is different — no generation is active, so its real reason reports
  // terminally at once instead of polling on. Owner-run failures arrive
  // as HTTP 200 fallback bodies, so every failure branch shares this.
  type FailureDetail={budget?:unknown;resume?:{recoverable:boolean};fallbackReason?:string;eligibleImages?:number;requiredImages?:number;modelCalls?:ModelCallEvent[];notices?:JobNotice[]}
  const transitional=(detail:FailureDetail)=>articleCount===3&&!detail.budget&&(detail.resume?.recoverable===true||detail.fallbackReason==='generation_interrupted')
  const surfaceTransient=(detail:FailureDetail):AttemptResult=>{
    events.onPoll?.({outcome:null,eligibleImages:detail.eligibleImages??null,requiredImages:detail.requiredImages??null,remainingCandidates:null,processing:null,generationStage:null,modelCalls:detail.modelCalls??null,notices:detail.notices??null})
    return {type:'transient'}
  }
  const attemptOnce=async():Promise<AttemptResult>=>{
    const requestBound=AbortSignal.timeout(articleCount===3?ARTICLE_3STORY_REQUEST_TIMEOUT_MS:ARTICLE_REQUEST_TIMEOUT_MS)
    const controller=new AbortController()
    stragglers.add(controller)
    try{
    const signal=AbortSignal.any([bound,requestBound,controller.signal,...(events.signal?[events.signal]:[])])
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      // The same explorationId rides every poll attempt so all of them
      // resolve to one D1 job; a fresh ID starts a fresh job instead.
      body:JSON.stringify({prompt,consent,editionFormat,...(events.editorialMode?{editorialMode:events.editorialMode}:{}),...(events.explorationId?{explorationId:events.explorationId}:{})}),
      signal,
    })
    if(response.status===202){
      const parsed=failure.safeParse(await response.json())
      if(!parsed.success||parsed.data.status!=='preparing')return {type:'terminal',fetch:failed('fallback')}
      events.onPoll?.({outcome:parsed.data.preparation?.outcome??null,eligibleImages:parsed.data.eligibleImages??null,requiredImages:parsed.data.requiredImages??null,remainingCandidates:parsed.data.preparation?.remainingCandidates??null,processing:parsed.data.preparation?.processing??null,generationStage:parsed.data.generationStage??null,modelCalls:parsed.data.modelCalls??null,notices:parsed.data.notices??null})
      return {type:'poll'}
    }
    if(!response.ok){
      // Non-AI states stay explicit: never synthesize articles or imply a
      // model succeeded. Unparseable edge responses resolve separately so
      // isolated blips never stop a live generation.
      try{
        const parsed=failure.parse(await response.json())
        if(transitional(parsed))return surfaceTransient(parsed)
        return {type:'terminal',fetch:failed(parsed.status??'fallback',{fallbackReason:parsed.fallbackReason,budget:parsed.budget,eligibleImages:parsed.eligibleImages,requiredImages:parsed.requiredImages,validationStage:parsed.validationDiagnostic?.stage,modelCalls:parsed.modelCalls??null,notices:parsed.notices??null})}
      }catch{
        return {type:'unparseable'}
      }
    }
    const raw=await response.json()
    const data=envelope.parse(raw)
    // A 200 fallback carries no items; keep its disclosed reason instead of
    // implying a model succeeded.
    if(data.articleEdition===null||data.items===undefined){
      const parsed=failure.safeParse(raw)
      const detail=parsed.success?parsed.data:{}
      if(transitional(detail))return surfaceTransient(detail)
      return {type:'terminal',fetch:failed(detail.status??'fallback',{fallbackReason:detail.fallbackReason,budget:detail.budget,eligibleImages:detail.eligibleImages,requiredImages:detail.requiredImages,validationStage:detail.validationDiagnostic?.stage,modelCalls:detail.modelCalls??null,notices:detail.notices??null})}
    }
    const articleEdition=(articleCount===1?editorialSingleArticleEdition:editorialPartialArticleEdition).parse(data.articleEdition)
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {type:'terminal',fetch:{
      edition:{articleEdition,items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached,researchReferences:data.researchReferences,aiDisclosure:data.aiDisclosure,editorialTier:data.editorialTier,requestedCount:data.requestedCount,publishedCount:data.publishedCount,partial:data.partial},
      honest,articleCount,status:null,timedOut:false,generation:parseGenerationMetadata(data.generation),evidence:data.evidence,modelCalls:data.modelCalls??null,notices:data.notices??null,
    }}
    }finally{
      stragglers.delete(controller)
    }
  }
  // Pipelined driver: the first request launches immediately; while it is
  // still in flight (the lease owner generates for minutes), a fresh poll
  // launches every gap so 202s render live modelCalls. Settlements queue
  // in arrival order so a terminal is never lost behind a 202. The first
  // terminal response wins and aborts the stragglers. One attempt's
  // transport failure is ignored while others fly; a settled 202 or a
  // transitional failure paces the next launch a full gap out instead of
  // burning launches back-to-back, while request-level failures relaunch
  // at once so a dead owner resumes fast and a dead network fails fast.
  // When the launch bound is reached with nothing resolved, polls seen
  // reads as still-reviewing and a clean sweep of failures reads as a
  // request failure, as before.
  type Settled={value:AttemptResult|null;error:unknown}
  const results:Settled[]=[]
  let launched=0,settledCount=0,sawPoll=false,lastWasPoll=false,unparseableStreak=0
  let wake:()=>void=()=>{}
  const launch=()=>{
    launched++
    void attemptOnce().then(
      value=>{settledCount++;results.push({value,error:null});wake()},
      error=>{settledCount++;results.push({value:null,error});wake()})
  }
  const waitSettled=(withGap:boolean)=>new Promise<boolean>((resolve,reject)=>{
    // The executor runs synchronously, so arming wake cannot race a
    // settlement: no callback runs between the queue check and this.
    const timer=withGap?setTimeout(()=>{cleanup();resolve(false)},pollGapMs):undefined
    const cleanup=()=>{clearTimeout(timer);bound.removeEventListener('abort',abort);events.signal?.removeEventListener('abort',abort)}
    const abort=()=>{cleanup();reject(new Error('Interrupted'))}
    bound.addEventListener('abort',abort,{once:true});events.signal?.addEventListener('abort',abort,{once:true})
    wake=()=>{cleanup();resolve(true)}
  })
  try{
    launch()
    for(;;){
      const next=results.shift()
      if(next){
        if(next.error){
          if(bound.aborted||events.signal?.aborted)throw new Error('Interrupted')
          lastWasPoll=false
          continue
        }
        const settled=next.value!
        if(settled.type==='terminal'){
          for(const controller of stragglers)controller.abort()
          events.onResponse?.()
          return settled.fetch
        }
        if(settled.type==='unparseable'){
          // No parsed verdict: an isolated blip rides on, a sustained
          // outage fails fast without waiting out the overall bound.
          lastWasPoll=false
          if(++unparseableStreak>=ARTICLE_UNPARSEABLE_STREAK)return failed('request_failed')
          continue
        }
        sawPoll=true;unparseableStreak=0;lastWasPoll=true
        continue
      }
      if(settledCount>=launched){
        if(launched>=maxAttempts)return failed(sawPoll?'preparing':'request_failed',{timedOut:sawPoll})
        if(lastWasPoll){lastWasPoll=false;await waitSettled(true);continue}
        launch()
        continue
      }
      if(launched<maxAttempts){
        if(!await waitSettled(true)&&!bound.aborted&&!events.signal?.aborted)launch()
      }else{
        await waitSettled(false)
      }
    }
  }catch{
    return failed(bound.aborted?'fallback':'request_failed',{timedOut:bound.aborted})
  }
}
