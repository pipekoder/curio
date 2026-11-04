import {z} from 'zod'
import {budgetExplanation,publicBudgetDiagnostic,type PublicBudgetDiagnostic} from '../../shared/budget-diagnostic'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_MIN_ELIGIBLE_IMAGES,ARTICLE_SINGLE_CONTRACT_VERSION,ARTICLE_SINGLE_MIN_ELIGIBLE_IMAGES,editorialArticleEdition,editorialSingleArticleEdition,type ArticleEditionBody} from '../../shared/editorial-articles'
import {editorialTierLabel,type EditorialTierLabel} from '../../shared/editorial-tiers'
import {catalogItem,type CatalogItem} from '../../shared/catalog'
import {editorialSources,type EditorialSource} from '../../shared/editorial-sources'
import {parseGenerationMetadata,type EditorialMode,type GenerationMetadata} from './editorial-mode'
import type {HonestState} from './edition'

// Article Edition may make Chief, Reviewer, Revision and Confirmation calls
// under one D1 generation lease. Its request bound is distinct from the
// shorter standard Editorial API bound.
const ARTICLE_REQUEST_TIMEOUT_MS=180_000

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
}
export type ArticleFetch={
  edition:StagedArticleEdition|null;honest:HonestState;articleCount:1|3;
  status:ArticleStatus|'request_failed'|null;fallbackReason?:string;
  eligibleImages?:number;requiredImages?:number;validationStage?:string;
  timedOut:boolean;generation:GenerationMetadata|null;budget?:PublicBudgetDiagnostic;evidence?:{interpretations:number}|null
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
})

const failure=z.object({
  status:z.enum(['disabled','consent_required','unavailable','insufficient_content','fallback','preparing']).optional(),
  fallbackReason:z.string().max(80).optional(),
  budget:publicBudgetDiagnostic.optional(),
  eligibleImages:z.number().int().min(0).optional(),
  requiredImages:z.number().int().min(0).optional(),
  generationStage:z.enum(['evidence','planning','research','chief_editor','reviewer','revision','confirmation']).optional(),
  validationDiagnostic:z.object({stage:z.string().max(40),code:z.string().max(40)}).passthrough().optional(),
  preparation:z.object({retryAfterMs:z.number().int().min(0).max(60000),outcome:z.string().max(40).optional(),remainingCandidates:z.number().int().min(0).optional(),processing:z.number().int().min(0).optional()}).passthrough().optional(),
})

export type ArticlePoll={outcome:string|null;eligibleImages:number|null;requiredImages:number|null;remainingCandidates:number|null;processing:number|null;generationStage:string|null}

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

export async function fetchArticleEdition(prompt:string,consent:boolean,fetchImpl:typeof fetch=fetch,events:{onResponse?:()=>void;onPoll?:(poll:ArticlePoll)=>void;signal?:AbortSignal;timeoutMs?:number;editorialMode?:EditorialMode;articleCount?:1|3}={}):Promise<ArticleFetch>{
  const articleCount=events.articleCount??3
  const editionFormat=articleCount===1?ARTICLE_SINGLE_CONTRACT_VERSION:ARTICLE_CONTRACT_VERSION
  const bound=AbortSignal.timeout(events.timeoutMs??300000)
  const failed=(status:ArticleFetch['status'],extra:Partial<ArticleFetch>&{timedOut?:boolean}={}):ArticleFetch=>({
    edition:null,honest:'authored-fallback',articleCount,status,timedOut:false,generation:null,...extra,
  })
  try{
   for(let attempt=0;attempt<20;attempt++){
    const requestBound=AbortSignal.timeout(ARTICLE_REQUEST_TIMEOUT_MS)
    const signal=AbortSignal.any([bound,requestBound,...(events.signal?[events.signal]:[])])
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,consent,editionFormat,...(events.editorialMode?{editorialMode:events.editorialMode}:{})}),
      signal,
    })
    if(response.status===202){
      const parsed=failure.safeParse(await response.json())
      if(!parsed.success||parsed.data.status!=='preparing')return failed('fallback')
      events.onPoll?.({outcome:parsed.data.preparation?.outcome??null,eligibleImages:parsed.data.eligibleImages??null,requiredImages:parsed.data.requiredImages??null,remainingCandidates:parsed.data.preparation?.remainingCandidates??null,processing:parsed.data.preparation?.processing??null,generationStage:parsed.data.generationStage??null})
      const wait=parsed.data.preparation?.retryAfterMs??16000
      if(wait)await new Promise<void>((resolve,reject)=>{
        if(bound.aborted||events.signal?.aborted){reject(new Error('Interrupted'));return}
        const timer=setTimeout(()=>{bound.removeEventListener('abort',abort);events.signal?.removeEventListener('abort',abort);resolve()},wait)
        const abort=()=>{clearTimeout(timer);bound.removeEventListener('abort',abort);events.signal?.removeEventListener('abort',abort);reject(new Error('Interrupted'))}
        bound.addEventListener('abort',abort,{once:true});events.signal?.addEventListener('abort',abort,{once:true})
      })
      continue
    }
    events.onResponse?.()
    if(!response.ok){
      // Non-AI states stay explicit: never synthesize articles or imply a
      // model succeeded. Unparseable errors fail closed the same way.
      try{
        const parsed=failure.parse(await response.json())
        return failed(parsed.status??'fallback',{fallbackReason:parsed.fallbackReason,budget:parsed.budget,eligibleImages:parsed.eligibleImages,requiredImages:parsed.requiredImages,validationStage:parsed.validationDiagnostic?.stage})
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
      return failed(detail.status??'fallback',{fallbackReason:detail.fallbackReason,budget:detail.budget,eligibleImages:detail.eligibleImages,requiredImages:detail.requiredImages,validationStage:detail.validationDiagnostic?.stage})
    }
    const articleEdition=(articleCount===1?editorialSingleArticleEdition:editorialArticleEdition).parse(data.articleEdition)
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {
      edition:{articleEdition,items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached,researchReferences:data.researchReferences,aiDisclosure:data.aiDisclosure,editorialTier:data.editorialTier},
      honest,articleCount,status:null,timedOut:false,generation:parseGenerationMetadata(data.generation),evidence:data.evidence,
    }
   }
   return failed('preparing',{timedOut:true})
  }catch{
    return failed(bound.aborted?'fallback':'request_failed',{timedOut:bound.aborted})
  }
}
