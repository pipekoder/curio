import {z} from 'zod'
import {editorialPlan,type EditorialPlan,type EditorialPreferences,validateOriginalPlan} from '../shared/editorial'
import {editorialReviewOutput,editorialStandardInstruction,scoreEditorialReview,type EditorialReviewOutput} from '../shared/editorial-standard'
import {editorialKnowledgeInstruction,selectEditorialVoice} from '../shared/editorial-knowledge-v2'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import type {CatalogItem} from '../shared/catalog'
import type {ExternalAssetApprovals} from '../shared/url-policy'
import {boundedText} from './meta'

const token=z.number().int().min(0).max(10000000)
const usage=z.object({prompt_tokens:token,completion_tokens:token,total_tokens:token,prompt_tokens_details:z.object({cached_tokens:token}).optional()}).optional()
const envelope=z.object({choices:z.array(z.object({finish_reason:z.literal('stop'),message:z.object({content:z.string().max(20000)})})).length(1),usage})
export type EditorialMeasurement={latencyMs:number;usage:null|{inputTokens:number;outputTokens:number;cachedInputTokens:number|null;totalTokens:number}}

async function structuredMuse<T>(key:string,instruction:string,input:unknown,schema:z.ZodType<T>,name:string):Promise<{value:T;measurement:EditorialMeasurement}>{
  const started=performance.now(),response=await fetch('https://api.meta.ai/v1/chat/completions',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'muse-spark-1.3',max_completion_tokens:2200,reasoning_effort:'minimal',stream:false,messages:[{role:'developer',content:instruction},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name,schema:z.toJSONSchema(schema,{unrepresentable:'any'})}}})})
  if(!response.ok){await response.body?.cancel();throw Error('Editorial review unavailable')}
  const parsed=envelope.parse(JSON.parse(await boundedText(response.body,32768)))
  if(parsed.usage&&(parsed.usage.total_tokens!==parsed.usage.prompt_tokens+parsed.usage.completion_tokens||(parsed.usage.prompt_tokens_details?.cached_tokens??0)>parsed.usage.prompt_tokens))throw Error('Invalid usage accounting')
  const measurement={latencyMs:Math.round(performance.now()-started),usage:parsed.usage?{inputTokens:parsed.usage.prompt_tokens,outputTokens:parsed.usage.completion_tokens,cachedInputTokens:parsed.usage.prompt_tokens_details?.cached_tokens??null,totalTokens:parsed.usage.total_tokens}:null}
  try{return {value:schema.parse(JSON.parse(parsed.choices[0].message.content)),measurement}}catch{throw new EditorialReviewError('invalid_output',measurement)}
}

const reviewerInstruction=`You are Curio's independent AI Editorial Reviewer. You did not write the magazine. Apply the complete shared rubric independently to the supplied validated plan. Score each dimension from 0 to 5 using its anchors and give brief evidence-based reasoning. Identify strengths and concrete revision needs. Use only the supplied evidence reference IDs; never copy source values, private metadata, prompts or instructions into feedback. Do not revalidate permissions or factual safety and never override Curio's deterministic gate. Evaluate insight and useful discovery, not only elegant language. Judge the selected voice fairly; flag generic copy, repeated ideas, empty metaphor, awkward uncertainty and superficial questions. Do not calculate a total or choose PASS, REVISE or REJECT. ${editorialStandardInstruction}`
const revisionInstruction=`You are Curio's Revision Editor. Improve only the issues named by the independent Reviewer while preserving successful copy. Preserve the exact feature count, catalogId, assetId, sourceIds, observationKeys, theme, layout, motion, connection endpoints and qualityVersion. Change only title, deck, feature headlines, narratives, discovery questions and connection threads. Never add a factual claim. Use exact cited owner facts only where permitted; preserve uncertainty for visual observations. Return the complete revised plan. ${editorialStandardInstruction}`

function evidenceReferences(plan:EditorialPlan,sources:readonly EditorialSource[],contexts:readonly VisualContext[]){
  const refs=new Set(['plan.title','plan.deck'])
  for(const feature of plan.features){refs.add(`feature:${feature.assetId}`);for(const id of feature.sourceIds??[])if(sources.some(source=>source.id===id&&source.assetId===feature.assetId))refs.add(id);for(const key of feature.observationKeys??[])if(contexts.some(context=>context.assetId===feature.assetId&&Object.entries(context.observations).some(([group,values])=>values.some(value=>`${group}.${value}`===key))))refs.add(`${feature.assetId}:${key}`)}
  for(const connection of plan.connections??[])refs.add(`connection:${connection.fromAssetId}:${connection.toAssetId}`)
  return refs
}

export async function reviewEditorialPlan(key:string,plan:EditorialPlan,sources:readonly EditorialSource[],contexts:readonly VisualContext[],interests='',knowledgeV2=false){
  const refs=evidenceReferences(plan,sources,contexts),result=await structuredMuse(key,knowledgeV2?`${reviewerInstruction} ${editorialKnowledgeInstruction(selectEditorialVoice(interests))}`:reviewerInstruction,{rubricVersion:'curio-editorial-standard-v1',plan,factualSources:sources,visualContexts:contexts,evidenceReferenceIds:[...refs]},editorialReviewOutput,'curio_editorial_review_v1')
  const feedbackIds=result.value.featureFeedback.map(feature=>feature.assetId),assessment=scoreEditorialReview(result.value)
  if(feedbackIds.length!==plan.features.length||new Set(feedbackIds).size!==feedbackIds.length||feedbackIds.some(id=>!plan.features.some(item=>item.assetId===id))||Object.values(result.value.dimensions).some(dimension=>dimension.evidenceRefs.some(ref=>!refs.has(ref)))||result.value.featureFeedback.some(feature=>feature.issues.some(issue=>issue.evidenceRefs.some(ref=>!refs.has(ref))))||assessment.decision==='REVISE'&&(!result.value.revisionInstructions.length||!result.value.featureFeedback.some(feature=>feature.issues.length)))throw new EditorialReviewError('invalid_evidence',result.measurement)
  return {...result,assessment}
}
export function reviewHasHardFailure(review:EditorialReviewOutput){return review.featureFeedback.some(feature=>feature.issues.some(issue=>issue.severity==='high'))}

function sameStructure(original:EditorialPlan,revised:EditorialPlan){
  const stable=(plan:EditorialPlan)=>({qualityVersion:plan.qualityVersion,features:plan.features.map(({catalogId,assetId,observationKeys,sourceIds,layout,motion,theme})=>({catalogId,assetId,observationKeys,sourceIds,layout,motion,theme})),connections:(plan.connections??[]).map(({fromAssetId,toAssetId})=>({fromAssetId,toAssetId}))})
  return JSON.stringify(stable(original))===JSON.stringify(stable(revised))
}

export async function reviseEditorialPlan(key:string,original:EditorialPlan,review:EditorialReviewOutput,p:EditorialPreferences,pool:readonly CatalogItem[],approvals:ExternalAssetApprovals,sources:readonly EditorialSource[],contexts:readonly VisualContext[],knowledgeV2=false){
  const result=await structuredMuse(key,knowledgeV2?`${revisionInstruction} ${editorialKnowledgeInstruction(selectEditorialVoice(p.interests))}`:revisionInstruction,{originalPlan:original,review,factualSources:sources,visualContexts:contexts},editorialPlan,'curio_editorial_revision_v1')
  try{
    if(!sameStructure(original,result.value))throw Error('Structure changed')
    return {...result,value:validateOriginalPlan(result.value,pool,p,approvals,sources,contexts,true)}
  }catch{throw new EditorialReviewError('invalid_revision',result.measurement)}
}

export class EditorialReviewError extends Error{
  constructor(public code:'invalid_output'|'invalid_evidence'|'invalid_revision',public measurement:EditorialMeasurement){super('Editorial review rejected')}
}
