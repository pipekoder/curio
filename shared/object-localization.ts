import { z } from 'zod'
import { segmentation, type Segmentation } from './decoder'
export const localizationConcept = z.enum(['lamp','table','wall art','seating'])
export type LocalizationConcept = z.infer<typeof localizationConcept>
export const observedObjectCandidate = z.strictObject({ concept:localizationConcept, objectIndex:z.number().int().min(0).max(19), visualConfidence:z.number().min(0).max(1), editorialRelevance:z.number().min(0).max(1) })
const aliases: Record<LocalizationConcept,RegExp>={lamp:/\b(lamps?|pendants?|lighting fixtures?)\b/i,table:/\b(tables?|desks?)\b/i,'wall art':/\b(wall art|artworks?|paintings?|framed prints?)\b/i,seating:/\b(seating|chairs?|armchairs?|sofas?|couches?|benches)\b/i}
const matchesObserved=(concept:LocalizationConcept,text:string)=>aliases[concept].test(concept==='table'?text.replace(/\btable lamps?\b/gi,''):text)
const matchesIntent=(concept:LocalizationConcept,text:string)=>aliases[concept].test(text)||(concept==='lamp'&&/\b(light|lighting|shade|shadows?)\b/i.test(text))||(concept==='wall art'&&/\b(art|artwork|painting)\b/i.test(text))
export const conceptKey=(concept:LocalizationConcept)=>concept.replace(' ','-')
export const conceptDetail=(concept:LocalizationConcept)=>`norm-local-${conceptKey(concept)}`
// The text sent to SAM is always one of four bounded noun phrases, never model prose.
export function rankObjectCandidates(input:{objects:string[];objectCandidates?:unknown;editorialRelevance:number},intent:string){
 z.object({objects:z.array(z.string().max(500)).max(20),editorialRelevance:z.number().min(0).max(1)}).parse(input)
 if(intent.length>1000 || input.objects.length>20)throw Error('Bounded discovery context required')
 const supplied=input.objectCandidates===undefined?undefined:z.array(observedObjectCandidate).max(4).parse(input.objectCandidates)
 const candidates=supplied??input.objects.flatMap((text,index)=>localizationConcept.options.filter(c=>matchesObserved(c,text)).map(concept=>({concept,objectIndex:index,visualConfidence:0.6,editorialRelevance:input.editorialRelevance})))
 const best=new Map<LocalizationConcept,{concept:LocalizationConcept;objectIndex:number;score:number;source:'muse_structured_candidate'|'existing_muse_object_label'}>()
 for(const c of candidates){
  const observed=input.objects[c.objectIndex]
  if(!observed || !matchesObserved(c.concept,observed) || c.visualConfidence<0.55)continue
  const intentMatch=matchesIntent(c.concept,intent)?1:0
  const score=Math.round((.45*c.visualConfidence+.25*c.editorialRelevance+.3*intentMatch)*10000)/10000
  const ranked={concept:c.concept,objectIndex:c.objectIndex,score,source:supplied?'muse_structured_candidate' as const:'existing_muse_object_label' as const}
  if(!best.has(c.concept)||best.get(c.concept)!.score<score)best.set(c.concept,ranked)
 }
 return [...best.values()].sort((a,b)=>b.score-a.score||a.concept.localeCompare(b.concept)).slice(0,3)
}
export function selectLocalizationCandidate(input:Parameters<typeof rankObjectCandidates>[0],intent:string,selected?:unknown){
 const ranked=rankObjectCandidates(input,intent)
 if(!ranked.length)throw Error('No sufficiently grounded object concept; no localization request')
 const concept=selected===undefined?ranked[0].concept:localizationConcept.parse(selected)
 if(!ranked.some(c=>c.concept===concept))throw Error('Concept absent from eligible Muse-derived shortlist')
 return {concept,detailId:conceptDetail(concept),ranked,maxRequests:1 as const}
}
export function samConceptBody(concept:unknown,imageDataUrl:string){
 const phrase=localizationConcept.parse(concept)
 return {model:'sam-3.1',stream:true,input:[{type:'message',role:'user',content:[{type:'input_text',text:phrase},{type:'input_image',image_url:imageDataUrl}]}]}
}
export type LocalizationCapture={assetId:string;versionId:string;imageSha256:string;concept:LocalizationConcept;result:Segmentation}
// Different requests may both use sam-1. Preserve raw IDs/boxes and scope display
// identities to the exact image/version/concept; never infer cross-concept identity.
export function combineLocalizationCaptures(captures:readonly LocalizationCapture[]){
 if(captures.length>3)throw Error('At most three reviewed concept captures')
 const first=captures[0],seen=new Set<string>()
 const raw=captures.map(c=>{
  const concept=localizationConcept.parse(c.concept),result=segmentation.parse(c.result)
  if(!/^version-[a-f0-9]{64}$/.test(c.versionId)||! /^[a-f0-9]{64}$/.test(c.imageSha256)||result.source!=='sam_detection'||result.model!=='sam-3.1'||result.assetId!==c.assetId)throw Error('Exact Meta capture binding required')
  if(first&&(c.assetId!==first.assetId||c.versionId!==first.versionId||c.imageSha256!==first.imageSha256||result.adId!==first.result.adId||result.width!==first.result.width||result.height!==first.result.height))throw Error('Mixed image versions cannot be combined')
  if(seen.has(concept))throw Error('Duplicate concept capture requires explicit review')
  seen.add(concept);return {...c,concept,result}
 })
 const regions=raw.flatMap(c=>c.result.regions.map(r=>({...r,id:`loc-${conceptKey(c.concept)}-${r.id}`,identityKey:JSON.stringify([c.assetId,c.versionId,c.imageSha256,c.concept,r.id]),rawId:r.id,concept:c.concept,versionId:c.versionId,imageSha256:c.imageSha256})))
 const overlaps=regions.flatMap((a,i)=>regions.slice(i+1).filter(b=>a.concept!==b.concept&&Math.min(a.box.x+a.box.width,b.box.x+b.box.width)>Math.max(a.box.x,b.box.x)&&Math.min(a.box.y+a.box.height,b.box.y+b.box.height)>Math.max(a.box.y,b.box.y)).map(b=>({a:a.id,b:b.id,decision:'remain_separate_pending_review' as const})))
 return {raw,regions,overlaps,modelCalls:0 as const}
}
