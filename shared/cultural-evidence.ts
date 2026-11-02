import {z} from 'zod'
import {isSafeHttpsUrl} from './url-policy'

export const CULTURAL_EVIDENCE_VERSION='curio-cultural-evidence-v3.0.0' as const
const digest=z.string().regex(/^[a-f0-9]{64}$/)
const version=z.string().regex(/^version-[a-f0-9]{64}$/)
const id=z.string().regex(/^[a-z0-9:_-]{3,180}$/)
const text=z.string().trim().min(1).max(2000)
const url=z.url().max(2048)

export const culturalPassage=z.strictObject({
  id,sourceId:id,text,documentSha256:digest,
  start:z.number().int().min(0),end:z.number().int().positive(),
})
export const culturalSource=z.strictObject({
  id,canonicalUrl:url,origin:url,retrievedAt:z.iso.datetime(),sha256:digest,
  author:z.string().max(160).nullable(),publication:z.string().max(160).nullable(),publishedAt:z.iso.datetime().nullable(),
  rights:z.enum(['pending','approved_for_paraphrase','approved_for_quotation','rejected']),
  verification:z.enum(['pending','operator_reviewed','rejected']),
})
export const culturalClaim=z.strictObject({
  id:z.string().regex(/^[a-z0-9:_-]{3,80}$/),text:z.string().trim().min(1).max(500),kind:z.enum(['factual','comparison','interpretation','hypothesis']),
  assetVersionIds:z.array(version).min(1).max(3),
  passageIds:z.array(id).max(6),status:z.enum(['pending','reviewed','conflicted','rejected']),
  conflict:z.string().max(400).nullable(),
})
export const culturalRelationship=z.strictObject({
  id,from:id,to:id,type:z.enum(['documented','comparison','interpretation','hypothesis']),
  claimIds:z.array(id).min(1).max(8),confidence:z.number().min(0).max(1),
})
export const culturalEvidencePack=z.strictObject({
  version:z.literal(CULTURAL_EVIDENCE_VERSION),id,createdAt:z.iso.datetime(),
  assetVersionIds:z.array(version).min(1).max(6),
  sourceIds:z.array(id).max(24),
  sources:z.array(culturalSource).max(12),passages:z.array(culturalPassage).max(12),
  claims:z.array(culturalClaim).max(12),relationships:z.array(culturalRelationship).max(24),
  reviewRevision:z.number().int().min(0).max(1000).default(0),
  reviewHistory:z.array(z.strictObject({revision:z.number().int().positive(),action:z.enum(['approve','revoke']),at:z.iso.datetime(),actor:z.literal('catalog-operator')})).max(20).default([]),
  status:z.enum(['candidate','approved','rejected']),
})
export type CulturalEvidencePack=z.infer<typeof culturalEvidencePack>

// Identity, version, and rights are technical gates. Semantic support still
// requires independent human review; model agreement is not verification.
export function validateCulturalEvidence(raw:unknown, approvedAssetVersions:readonly string[]){
  const pack=culturalEvidencePack.parse(raw)
  if(pack.sources.some(source=>!isSafeHttpsUrl(source.canonicalUrl)||!isSafeHttpsUrl(source.origin)||new URL(source.canonicalUrl).origin!==source.origin))throw Error('Unsafe cultural source')
  const unique=(values:readonly string[])=>new Set(values).size===values.length
  if(!unique(pack.assetVersionIds)||!pack.assetVersionIds.every(value=>approvedAssetVersions.includes(value)))throw Error('Cultural asset version unavailable')
  for(const values of [pack.sourceIds,pack.sources.map(s=>s.id),pack.passages.map(p=>p.id),pack.claims.map(c=>c.id),pack.relationships.map(r=>r.id)])if(!unique(values))throw Error('Duplicate cultural identity')
  if(pack.sourceIds.length!==pack.sources.length||pack.sourceIds.some(value=>!pack.sources.some(s=>s.id===value)))throw Error('Cultural source list mismatch')
  const sources=new Map(pack.sources.map(value=>[value.id,value])),passages=new Map(pack.passages.map(value=>[value.id,value])),claims=new Map(pack.claims.map(value=>[value.id,value]))
  for(const passage of pack.passages){const source=sources.get(passage.sourceId);if(!source||passage.documentSha256!==source.sha256||passage.end<=passage.start||passage.end-passage.start!==passage.text.length)throw Error('Cultural passage mismatch')}
  for(const claim of pack.claims){if(!unique(claim.assetVersionIds)||claim.assetVersionIds.some(value=>!pack.assetVersionIds.includes(value)))throw Error('Cultural claim asset mismatch');if(pack.status==='approved'&&!claim.passageIds.length)throw Error('Uncited cultural claim');for(const reference of claim.passageIds)if(!passages.has(reference))throw Error('Unknown cultural passage')}
  for(const relationship of pack.relationships)for(const reference of relationship.claimIds)if(!claims.has(reference))throw Error('Unknown cultural claim')
  if(pack.status==='approved'){
    const latest=pack.reviewHistory.at(-1)
    if(!latest||latest.action!=='approve'||latest.revision!==pack.reviewRevision)throw Error('Cultural approval history missing')
    if(!pack.sources.length||!pack.claims.length)throw Error('Empty cultural evidence')
    if(pack.sources.some(source=>source.verification!=='operator_reviewed'||!['approved_for_paraphrase','approved_for_quotation'].includes(source.rights)))throw Error('Cultural source not approved')
    if(pack.claims.some(claim=>claim.status!=='reviewed'||claim.conflict))throw Error('Cultural claim not reviewed')
    if(pack.relationships.some(relationship=>relationship.type==='documented'&&relationship.claimIds.some(value=>claims.get(value)?.kind!=='factual')))throw Error('Undocumented relationship')
    if(pack.relationships.some(relationship=>relationship.type==='comparison'&&relationship.claimIds.some(value=>!['comparison','factual'].includes(claims.get(value)?.kind??''))))throw Error('Unsupported comparison')
  }
  if(pack.status==='rejected'&&pack.reviewHistory.at(-1)?.action!=='revoke')throw Error('Cultural revocation history missing')
  return pack
}

export function editorialCulturalEvidence(pack:CulturalEvidencePack,assetVersions:readonly string[]){
  const checked=validateCulturalEvidence(pack,assetVersions)
  if(checked.status!=='approved')return null
  return {version:checked.version,id:checked.id,claims:checked.claims.filter(c=>c.status==='reviewed'&&c.kind!=='hypothesis'),relationships:checked.relationships.filter(r=>r.type!=='hypothesis'),passages:checked.passages,sources:checked.sources.map(s=>({id:s.id,canonicalUrl:s.canonicalUrl,sha256:s.sha256,rights:s.rights}))}
}
