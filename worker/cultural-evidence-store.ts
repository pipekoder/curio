import {boundedText} from './meta'
import {type CulturalEvidencePack,validateCulturalEvidence} from '../shared/cultural-evidence'
import {editorialSources} from '../shared/editorial-sources'

const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
export function passageProofKey(id:string){if(!/^passage:[a-f0-9]{32}$/.test(id))throw Error('Invalid passage proof ID');return `cultural-passages/v3/${id}.json`}
export async function verifyCapturedPassages(bucket:R2Bucket,pack:CulturalEvidencePack){
  return (await Promise.all(pack.passages.map(async passage=>{
    const source=pack.sources.find(value=>value.id===passage.sourceId)
    if(!source)return false
    const object=await bucket.get(passageProofKey(passage.id))
    if(!object||object.size>1024)return false
    try{
      const proof=JSON.parse(await boundedText(object.body,1024)) as Record<string,unknown>
      return proof.id===passage.id&&proof.sourceId===source.id&&proof.url===source.canonicalUrl&&proof.documentSha256===source.sha256&&proof.textSha256===await digest(passage.text)&&proof.start===passage.start&&proof.end===passage.end
    }catch{return false}
  }))).every(Boolean)
}
export async function culturalEvidenceKey(assetVersions:readonly string[]){
  if(!assetVersions.length||assetVersions.length>6||new Set(assetVersions).size!==assetVersions.length||assetVersions.some(id=>!/^version-[a-f0-9]{64}$/.test(id)))throw Error('Invalid cultural asset identity')
  return `cultural-evidence/v3/${await digest([...assetVersions].sort().join('|'))}.json`
}

// R2 holds operator-reviewed packs, not public documents. The current
// publication-approved exact versions are checked on every read.
export async function loadApprovedCulturalEvidence(bucket:R2Bucket|undefined,assetVersions:readonly string[]){
  if(!bucket)return null
  const object=await bucket.get(await culturalEvidenceKey(assetVersions))
  if(!object)return null
  if(object.size>65536){await object.body.cancel();return null}
  try{
    const raw:unknown=JSON.parse(await boundedText(object.body,65536))
    const pack=validateCulturalEvidence(raw,assetVersions)
    if(pack.assetVersionIds.length!==assetVersions.length)return null
    return pack.status==='approved'&&await verifyCapturedPassages(bucket,pack)?pack:null
  }catch{return null}
}

// Draft-only long-form interface; this does not publish or run a model.
export function culturalSourcesForLongform(pack:CulturalEvidencePack,assetVersions:readonly string[]){
  if(pack.status!=='approved')return []
  validateCulturalEvidence(pack,assetVersions)
  return pack.claims.flatMap(claim=>{
    if(claim.status!=='reviewed'||claim.kind!=='factual')return []
    const source=pack.sources.find(source=>pack.passages.some(p=>claim.passageIds.includes(p.id)&&p.sourceId===source.id))
    return source?[{id:claim.id,kind:'cultural_research' as const,assetVersionId:null,text:claim.text,verified:true as const,rightsApproved:true as const,digest:source.sha256}]:[]
  })
}

export function culturalSourcesForEditorial(pack:CulturalEvidencePack,assetVersions:readonly string[]){
  if(pack.status!=='approved')return []
  validateCulturalEvidence(pack,assetVersions)
  return editorialSources.parse(pack.claims.flatMap(claim=>claim.status==='reviewed'&&claim.kind!=='hypothesis'?claim.assetVersionIds.map(assetId=>({id:`${assetId}:cultural_claim:${claim.id}`,assetId,kind:'cultural_claim' as const,label:claim.kind==='factual'?'Reviewed cultural fact':claim.kind==='comparison'?'Evidence-supported comparison':'Editorial interpretation',value:claim.text,authority:'operator_reviewed_cultural' as const,source:'cultural_evidence_pack' as const})):[]))
}
