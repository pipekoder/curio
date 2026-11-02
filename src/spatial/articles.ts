import {z} from 'zod'
import {ARTICLE_CONTRACT_VERSION,editorialArticleEdition,type EditorialArticleEdition} from '../../shared/editorial-articles'
import {catalogItem,type CatalogItem} from '../../shared/catalog'
import {parseGenerationMetadata,type EditorialMode,type GenerationMetadata} from './editorial-mode'
import {EDITORIAL_TIMEOUT_MS,type HonestState} from './edition'

// Opt-in client for docs/full-catalog-articles.md: POSTs the existing prompt
// shape plus editionFormat and stages only a fully validated article
// edition. Image URLs always come from joined items; nothing is constructed
// from IDs. Every non-AI state stays machine-readable so the UI can disclose
// it instead of implying a model succeeded.
export type ArticleStatus='disabled'|'consent_required'|'unavailable'|'insufficient_content'|'fallback'
export type StagedArticleEdition={
  articleEdition:EditorialArticleEdition;items:CatalogItem[];
  source:'meta'|'deterministic';retrieval:'d1'|'fictional';cached:boolean
}
export type ArticleFetch={
  edition:StagedArticleEdition|null;honest:HonestState;
  status:ArticleStatus|'request_failed'|null;fallbackReason?:string;
  eligibleImages?:number;requiredImages?:number;
  timedOut:boolean;generation:GenerationMetadata|null
}

const envelope=z.object({
  format:z.literal(ARTICLE_CONTRACT_VERSION),
  source:z.enum(['meta','deterministic']),
  retrieval:z.enum(['d1','fictional']),
  cached:z.boolean(),
  articleEdition:z.unknown(),
  items:z.array(catalogItem).optional(),
  generation:z.unknown().optional(),
})

const failure=z.object({
  status:z.enum(['disabled','consent_required','unavailable','insufficient_content','fallback']).optional(),
  fallbackReason:z.string().max(80).optional(),
  eligibleImages:z.number().int().min(0).optional(),
  requiredImages:z.number().int().min(0).optional(),
})

export function articleStatusCopy(fetch:ArticleFetch):{title:string;detail:string}{
  if(fetch.timedOut)return {title:'The article edition was still being reviewed.',detail:'Nothing was staged. The standard edition below remains available.'}
  switch(fetch.status){
    case 'disabled':return {title:'Article editions are currently disabled.',detail:'The standard edition below remains available.'}
    case 'consent_required':return {title:'Article editions need AI consent.',detail:'Allow AI curation or continue with the standard edition.'}
    case 'insufficient_content':{
      const have=fetch.eligibleImages
      return {title:'Not enough approved imagery for an article edition.',detail:have===undefined
        ?'The standard edition below remains available.'
        :`${have} of ${fetch.requiredImages??15} required images are currently eligible. The standard edition below remains available.`}
    }
    case 'unavailable':return {title:'Article editions are currently unavailable.',detail:'The standard edition below remains available.'}
    default:return {title:'The article edition could not be composed.',detail:'Nothing was staged. The standard edition below remains available.'}
  }
}

export async function fetchArticleEdition(prompt:string,consent:boolean,fetchImpl:typeof fetch=fetch,events:{onResponse?:()=>void;signal?:AbortSignal;timeoutMs?:number;editorialMode?:EditorialMode}={}):Promise<ArticleFetch>{
  const bound=AbortSignal.timeout(events.timeoutMs??EDITORIAL_TIMEOUT_MS)
  const signal=events.signal?AbortSignal.any([bound,events.signal]):bound
  const failed=(status:ArticleFetch['status'],extra:Partial<ArticleFetch>&{timedOut?:boolean}={}):ArticleFetch=>({
    edition:null,honest:'authored-fallback',status,timedOut:false,generation:null,...extra,
  })
  try{
    const response=await fetchImpl('/api/editorial',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,consent,editionFormat:ARTICLE_CONTRACT_VERSION,...(events.editorialMode?{editorialMode:events.editorialMode}:{})}),
      signal,
    })
    events.onResponse?.()
    if(!response.ok){
      // Non-AI states stay explicit: never synthesize articles or imply a
      // model succeeded. Unparseable errors fail closed the same way.
      try{
        const parsed=failure.parse(await response.json())
        return failed(parsed.status??'fallback',{fallbackReason:parsed.fallbackReason,eligibleImages:parsed.eligibleImages,requiredImages:parsed.requiredImages})
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
      return failed(detail.status??'fallback',{fallbackReason:detail.fallbackReason,eligibleImages:detail.eligibleImages,requiredImages:detail.requiredImages})
    }
    const articleEdition=editorialArticleEdition.parse(data.articleEdition)
    const honest:HonestState=
      data.source==='meta'?(data.cached?'meta-cached':'meta')
      :data.retrieval==='d1'?'deterministic-d1':'deterministic-fictional'
    return {
      edition:{articleEdition,items:data.items,source:data.source,retrieval:data.retrieval,cached:data.cached},
      honest,status:null,timedOut:false,generation:parseGenerationMetadata(data.generation),
    }
  }catch{
    return failed(bound.aborted?'fallback':'request_failed',{timedOut:bound.aborted})
  }
}
