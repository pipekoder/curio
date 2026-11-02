import {z} from 'zod'
import {CULTURAL_EVIDENCE_VERSION,validateCulturalEvidence} from '../shared/cultural-evidence'
import {assessCulturalSufficiency,type CulturalResearchPlan} from './cultural-planner'
import type {ResearchSource} from './cultural-research'

export const adaptiveInput=z.strictObject({
  consent:z.literal(true),prompt:z.string().trim().min(3).max(500),
  assetVersionIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6),
  rounds:z.array(z.array(z.url().max(2048)).min(1).max(3)).min(1).max(2),
})
export type AdaptiveInput=z.infer<typeof adaptiveInput>
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')

// Operator supplies URLs; planner only chooses whether and what to investigate.
// No public browsing, automatic URL discovery, source approval or model retry.
export async function executeAdaptiveResearch(input:AdaptiveInput,deps:{plan:()=>Promise<CulturalResearchPlan>;retrieve:(query:string,urls:string[])=>Promise<ResearchSource[]>;rank?:(query:string,sources:ResearchSource[])=>Promise<{mode:string;results:{id:string;score:number}[]}>}){
  const plan=await deps.plan()
  if(plan.decision==='stop_existing_evidence')return {status:'existing_sufficient' as const,plan,rounds:0,mode:'none' as const,pack:null}
  if(plan.decision==='narrow_angle')return {status:'narrowed' as const,plan,rounds:0,mode:'none' as const,pack:null}
  const found=new Map<string,ResearchSource>(),rankings:({mode:string;results:{id:string;score:number}[]})[]= [];let retrievalRounds=0
  for(let index=0;index<input.rounds.length;index++){
    const query=plan.questions[index]?.question??plan.questions[0]?.question
    if(!query)break
    const sources=await deps.retrieve(query,input.rounds[index])
    retrievalRounds++
    for(const source of sources)if(!found.has(source.sha256))found.set(source.sha256,source)
    if(deps.rank)rankings.push(await deps.rank(query,[...found.values()]))
    const decision=assessCulturalSufficiency(plan,[...found.values()].map(source=>({sourceId:source.id,relevance:source.relevance})),input.rounds.length-index-1)
    if(decision.action==='narrow')return {status:'narrowed' as const,plan,rounds:index+1,mode:rankings.at(-1)?.mode??'lexical_only',pack:null}
    if(decision.action==='review_evidence')break
  }
  const lastRanking=rankings.at(-1)?.results??[]
  const byRank=new Map(lastRanking.map((row,index)=>[row.id,index]))
  const sources=[...found.values()].sort((a,b)=>(byRank.get(a.id)??Number.MAX_SAFE_INTEGER)-(byRank.get(b.id)??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id)).slice(0,12)
  if(!sources.length)return {status:'narrowed' as const,plan,rounds:retrievalRounds,mode:rankings.at(-1)?.mode??'lexical_only',pack:null}
  const pack=validateCulturalEvidence({version:CULTURAL_EVIDENCE_VERSION,id:`pack:${(await digest(JSON.stringify([input.assetVersionIds,sources.map(s=>s.sha256)]))).slice(0,32)}`,createdAt:new Date().toISOString(),assetVersionIds:input.assetVersionIds,sourceIds:sources.map(source=>source.id),sources:sources.map(source=>({id:source.id,canonicalUrl:source.url,origin:source.origin,retrievedAt:source.retrievedAt,sha256:source.sha256,author:source.attribution.author,publication:null,publishedAt:source.attribution.publishedAt,rights:'pending',verification:'pending'})),passages:sources.map(source=>({id:source.passage.id,sourceId:source.id,text:source.excerpt,documentSha256:source.sha256,start:source.passage.start,end:source.passage.end})),claims:[],relationships:[],status:'candidate'},input.assetVersionIds)
  return {status:'candidate_review_required' as const,plan,rounds:retrievalRounds,mode:rankings.at(-1)?.mode??'lexical_only',pack}
}
