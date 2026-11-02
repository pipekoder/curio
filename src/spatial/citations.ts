import {z} from 'zod'

// Read-only client for docs/silver-field-citations-contract.md (backend PR
// #75): POSTs the validated edition plan back unchanged and renders only the
// reviewed citations returned. No inference, no prompt, no token. Anything
// unexpected — HTTP error, malformed body, unapproved status — resolves to
// null so Sources stays hidden. All rendered text stays React text; links
// accept http(s) only.
export const CITATIONS_VERSION='curio-public-citations-v1'
export const CULTURAL_EVIDENCE_V3='curio-cultural-evidence-v3.0.0'

const httpUrl=z.string().max(2048).refine(value=>{
  try{
    const protocol=new URL(value).protocol
    return protocol==='http:'||protocol==='https:'
  }catch{
    return false
  }
})
const citationSource=z.object({
  sourceId:z.string().max(180),passageId:z.string().max(180),canonicalUrl:httpUrl,
  publication:z.string().max(160).nullable(),
  support:z.object({kind:z.enum(['reviewed_paraphrase','approved_excerpt']),text:z.string().min(1).max(500)}),
})
const citation=z.object({
  claimId:z.string().max(80),sourceId:z.string().max(180),narrativeText:z.string().min(5).max(200),
  claimKind:z.enum(['factual','comparison','interpretation']),
  evidenceStatus:z.literal('operator_reviewed'),reviewStatus:z.literal('approved'),
  sources:z.array(citationSource).min(1).max(6),
})
const featureCitations=z.object({
  featureIndex:z.number().int().min(0).max(5),catalogId:z.string().max(80),
  assetId:z.string().max(100),headline:z.string().max(400),
  citations:z.array(citation).min(1).max(4),
})
const citationsResponse=z.object({
  version:z.literal(CITATIONS_VERSION),
  features:z.array(featureCitations).max(6),
})
export type PublicCitationsResponse=z.infer<typeof citationsResponse>
export type FeatureCitations=z.infer<typeof featureCitations>
export type PublicCitation=z.infer<typeof citation>

export async function fetchCitations(plan:unknown,fetchImpl:typeof fetch=fetch):Promise<PublicCitationsResponse|null>{
  try{
    const response=await fetchImpl('/api/editorial/citations',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({plan}),
    })
    if(!response.ok)return null
    return citationsResponse.parse(await response.json())
  }catch{
    return null
  }
}

export function citationsForFeature(
  response:PublicCitationsResponse,
  exhibit:{featureIndex:number;catalogId:string;assetId:string},
):PublicCitation[]|null{
  const match=response.features.find(feature=>
    feature.featureIndex===exhibit.featureIndex
    &&feature.catalogId===exhibit.catalogId
    &&feature.assetId===exhibit.assetId)
  return match?match.citations:null
}

// Sources affordance gate: the edition plan carries the V3 evidence marker
// and this feature binds cultural claims. Claim contents stay opaque; only
// the reviewed lookup response is ever rendered.
export function featureHasCitedClaims(plan:unknown,featureIndex:number):boolean{
  if(typeof plan!=='object'||plan===null)return false
  const record=plan as Record<string,unknown>
  if(record.culturalEvidenceVersion!==CULTURAL_EVIDENCE_V3)return false
  if(!Array.isArray(record.features))return false
  const feature=record.features[featureIndex] as Record<string,unknown>|undefined
  return !!feature&&Array.isArray(feature.culturalClaims)&&feature.culturalClaims.length>0
}
