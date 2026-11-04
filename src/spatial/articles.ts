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
const ARTICLE_3STORY_POLL_ATTEMPTS=64
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
  const bound=AbortSignal.timeout(events.timeoutMs??(articleCount===3?ARTICLE_3STORY_OVERALL_TIMEOUT_MS:300000))
  const failed=(status:ArticleFetch['status'],extra:Partial<ArticleFetch>&{timedOut?:boolean}={}):ArticleFetch=>({
    edition:null,honest:'authored-fallback',articleCount,status,timedOut:false,generation:null,modelCalls:null,notices:null,...extra,
  })
  const maxAttempts=articleCount===3?ARTICLE_3STORY_POLL_ATTEMPTS:20
  const pollGapMs=events.pollGapMs??ARTICLE_POLL_GAP_MS
  const stragglers=new Set<AbortController>()
  // One poll request. Resolves null on 202 (after firing onPoll); any
  // other HTTP response resolves terminally; transport failures throw.
  const attemptOnce=async():Promise<ArticleFetch|null>=>{
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
      if(!parsed.success||parsed.data.status!=='preparing')return failed('fallback')
      events.onPoll?.({outcome:parsed.data.preparation?.outcome??null,eligibleImages:parsed.data.eligibleImages??null,requiredImages:parsed.data.requiredImages??null,remainingCandidates:parsed.data.preparation?.remainingCandidates??null,processing:parsed.data.preparation?.processing??null,generationStage:parsed.data.generationStage??null,modelCalls:parsed.data.modelCalls??null,notices:parsed.data.notices??null})
      return null
    }
    if(!response.ok){
      // Non-AI states stay explicit: never synthesize articles or imply a
      // model succeeded. Unparseable errors fail closed the same way.
      try{
        const parsed=failure.parse(await response.json())
        return failed(parsed.status??'fallback',{fallbackReason:parsed.fallbackReason,budget:parsed.budget,eligibleImages:parsed.eligibleImages,requiredImages:parsed.requiredImages,validationStage:parsed.validationDiagnostic?.stage,modelCalls:parsed.modelCalls??null,notices:parsed.notices??null})
      }catch{
        return failed('fallback')
      }
    }
    const raw=await response.json()
    const data=envelope.parse(raw)
    // A 200 fallback carries no items; keep its disclosed reason instead of
    // implying a model succeeded.
    if(data.articleEdition===null||data.items===undefined){
      const parsed=failure.safeParse(raw)
      const detail=parsed.success?parsed.data:{}
      return failed(detail.status??'fallback',{fallbackReason:detail.fallbackReason,budget:detail.budget,eligibleImages:detail.eligibleImages,requiredImages:detail.requiredImages,validationStage:detail.validationDiagnostic?.stage,modelCalls:detail.modelCalls??null,notices:detail.notices??null})
    }
    const articleEdition=(articleCount===1?editorialSingleArticleEdition:editorialPartialArticleEdition).parse(data.articleEdition)
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {
      edition:{articleEdition,items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached,researchReferences:data.researchReferences,aiDisclosure:data.aiDisclosure,editorialTier:data.editorialTier,requestedCount:data.requestedCount,publishedCount:data.publishedCount,partial:data.partial},
      honest,articleCount,status:null,timedOut:false,generation:parseGenerationMetadata(data.generation),evidence:data.evidence,modelCalls:data.modelCalls??null,notices:data.notices??null,
    }
    }finally{
      stragglers.delete(controller)
    }
  }
  // Pipelined driver: the first request launches immediately; while it is
  // still in flight (the lease owner generates for minutes), a fresh poll
  // launches every gap so 202s render live modelCalls. Settlements queue
  // in arrival order so a terminal is never lost behind a 202. The first
  // terminal response wins and aborts the stragglers. One attempt's
  // transport failure is ignored while others fly; when the launch cap is
  // reached with nothing resolved, polls seen reads as still-reviewing and
  // a clean sweep of failures reads as a request failure, as before.
  type Settled={value:ArticleFetch|null;error:unknown}
  const results:Settled[]=[]
  let launched=0,settledCount=0,sawPoll=false
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
          continue
        }
        if(next.value===null){sawPoll=true;continue}
        for(const controller of stragglers)controller.abort()
        events.onResponse?.()
        return next.value
      }
      if(settledCount>=launched){
        if(launched>=maxAttempts)return failed(sawPoll?'preparing':'request_failed',{timedOut:sawPoll})
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
