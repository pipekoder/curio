import {editorialPlan,validatePlan,type EditorialPlan} from '../shared/editorial'
import {PUBLIC_CITATIONS_VERSION,publicCitations,type PublicCitations} from '../shared/public-citations'
import {CatalogPublications,publicationApprovals} from './catalog-publications'
import {loadEditorialSources} from './editorial-sources'
import {culturalSourcesForEditorial,loadApprovedCulturalEvidence} from './cultural-evidence-store'
import {resolveR2MediaPermit} from './media-ai-adapter'

type CitationEnv={CATALOG_DB?:D1Database;MEDIA_BUCKET?:R2Bucket;CATALOG_PUBLIC_ENABLED?:string;CULTURAL_INTELLIGENCE_V3_ENABLED?:string}

// The client supplies the already validated edition only to identify its
// narrative spans. Publication, R2 identity, source rights and review status
// are always resolved afresh on the server. No private pack is returned.
export async function publicCitationsForPlan(raw:unknown,env:CitationEnv):Promise<PublicCitations|null>{
  if(env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||env.CATALOG_PUBLIC_ENABLED!=='true'||!env.CATALOG_DB||!env.MEDIA_BUCKET)return null
  const plan=editorialPlan.parse(raw)
  if(plan.qualityVersion!==3||plan.culturalEvidenceVersion!=='curio-cultural-evidence-v3.0.0'||!plan.features.some(feature=>feature.culturalClaims?.length))return publicCitations.parse({version:PUBLIC_CITATIONS_VERSION,features:[]})
  const ids=plan.features.map(feature=>feature.assetId)
  if(ids.some(id=>!/^version-[a-f0-9]{64}$/.test(id)))return null
  const published=await new CatalogPublications(env.CATALOG_DB).list('',6,ids)
  if(published.items.length!==ids.length||ids.some(id=>!published.items.some(item=>item.image.id===id&&item.permissions.aiAnalysis.status==='approved'&&item.permissions.aiAnalysis.evidence)))return null
  const media=await Promise.all(ids.map(async id=>{const permit=await resolveR2MediaPermit(env.CATALOG_DB!,id);if(!permit)return false;const object=await env.MEDIA_BUCKET!.head(permit.r2Key);return object?.size===permit.byteSize&&object.customMetadata?.sha256===permit.sha256&&object.customMetadata?.versionId===id}))
  if(media.some(value=>!value))return null
  const pack=await loadApprovedCulturalEvidence(env.MEDIA_BUCKET,ids)
  if(!pack)return null
  const sources=[...await loadEditorialSources(env.CATALOG_DB,ids),...culturalSourcesForEditorial(pack,ids)]
  let checked:EditorialPlan
  try{checked=validatePlan(plan,published.items,publicationApprovals(published.items),sources,true)}catch{return null}
  const features:PublicCitations['features']=[]
  for(const [featureIndex,feature] of checked.features.entries()){
    if(!feature.culturalClaims?.length)continue
    const citations:PublicCitations['features'][number]['citations']=[]
    for(const reference of feature.culturalClaims){
      const claim=pack.claims.find(row=>reference.sourceId===`${feature.assetId}:cultural_claim:${row.id}`&&row.assetVersionIds.includes(feature.assetId)&&row.status==='reviewed'&&row.kind!=='hypothesis')
      if(!claim||claim.kind==='hypothesis')return null
      const supporting=claim.passageIds.map(id=>{const passage=pack.passages.find(row=>row.id===id),source=pack.sources.find(row=>row.id===passage?.sourceId);if(!passage||!source||source.verification!=='operator_reviewed'||!['approved_for_paraphrase','approved_for_quotation'].includes(source.rights))return null;const excerpt=source.rights==='approved_for_quotation'&&passage.text.length<=400;return {sourceId:source.id,passageId:passage.id,canonicalUrl:source.canonicalUrl,publication:source.publication,support:{kind:excerpt?'approved_excerpt' as const:'reviewed_paraphrase' as const,text:excerpt?passage.text:claim.text}}})
      if(supporting.some(row=>!row))return null
      citations.push({claimId:claim.id,sourceId:reference.sourceId,narrativeText:reference.narrativeText,claimKind:claim.kind,evidenceStatus:'operator_reviewed',reviewStatus:'approved',sources:supporting as NonNullable<typeof supporting[number]>[]})
    }
    features.push({featureIndex,catalogId:feature.catalogId,assetId:feature.assetId,headline:feature.headline,citations})
  }
  return publicCitations.parse({version:PUBLIC_CITATIONS_VERSION,features})
}
