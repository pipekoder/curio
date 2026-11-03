import {z} from 'zod'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_COUNT,ARTICLE_MAX_IMAGES,ARTICLE_MIN_IMAGES,ARTICLE_SINGLE_CONTRACT_VERSION,ARTICLE_SINGLE_COUNT,type ArticleEditionBody,editorialArticle,editorialArticleEdition} from '../shared/editorial-articles'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialSource} from '../shared/editorial-sources'
import {ArticleValidationError} from './editorial-articles'

// Short server-owned candidate references. The Chief selects images by
// ref; the server hydrates exact IDs. Pair mismatches and ID transcription
// slips become unrepresentable; unknown or duplicate refs fail closed.
// Downstream validation, review, revision, cache and persistence keep the
// full-ID edition shape and are unchanged.
export const IMAGE_REF_ALPHABET='ABCDEFGHI'
export function assignCandidateRefs(items:readonly CatalogItem[]):Map<string,CatalogItem>{
  const byRef=new Map<string,CatalogItem>()
  items.forEach((item,index)=>{const ref=IMAGE_REF_ALPHABET[index];if(ref&&!byRef.has(ref))byRef.set(ref,item)})
  return byRef
}
export function assignClaimRefs(sources:readonly EditorialSource[]):Map<string,EditorialSource>{
  return new Map(sources.filter(source=>source.kind==='cultural_claim').map((source,index)=>[`S${index+1}`,source]))
}
export function catalogEntries(items:readonly CatalogItem[]){
  return items.map((item,index)=>({ref:IMAGE_REF_ALPHABET[index]!,catalogId:item.id,assetId:item.image.id,category:item.category,aestheticTags:item.lifestyleTags}))
}
export function sourcesWithClaimRefs(sources:readonly EditorialSource[]):(EditorialSource&{claimRef?:string})[]{
  const refs=assignClaimRefs(sources),byId=new Map([...refs].map(([ref,source])=>[source.id,ref]))
  return sources.map(source=>{const claimRef=byId.get(source.id);return claimRef?{...source,claimRef}:source})
}
const {id:_id,heroAssetId:_hero,images:_images,sourceIds:_sourceIds,culturalClaims:_claims,...articleTextShape}=editorialArticle.shape
const articleText=z.strictObject(articleTextShape)
const {version:_version,articles:_articles,...editionTextShape}=editorialArticleEdition.shape
const editionText=z.strictObject(editionTextShape)
const claimNarrative=editorialArticle.shape.culturalClaims.unwrap().element.shape.narrativeText
const draftImage=z.strictObject({ref:z.string().min(1),products:z.array(z.string().min(1)).max(6).optional()})
const draftClaim=z.strictObject({ref:z.string().min(1),narrativeText:claimNarrative})
const draftArticle=articleText.extend({images:z.array(draftImage).min(ARTICLE_MIN_IMAGES).max(ARTICLE_MAX_IMAGES),culturalClaims:z.array(draftClaim).max(8).optional()})
const draftEdition=z.strictObject({...editionText.shape,articles:z.array(draftArticle).length(ARTICLE_COUNT)})
const draftSingleEdition=z.strictObject({...editionText.shape,articles:z.array(draftArticle).length(ARTICLE_SINGLE_COUNT)})
export const chiefDraftSchema=(count:1|3)=>count===1?draftSingleEdition:draftEdition
export type ChiefDraft=z.infer<typeof draftEdition>

// Resolve a ref draft to the exact full-ID edition. Every identity field
// comes from server data; the model's ref choices (which candidates, in
// which order, which product kinds and claims) are preserved. Unknown or
// reused refs, unresolvable brands and unknown claim refs throw with
// position; unresolvable product kinds drop silently exactly as unknown
// product source IDs do today. Callers must run validateArticleEdition on
// the result: hydration bugs and same-asset duplicates fail closed there.
export function hydrateChiefDraft(draft:ChiefDraft,count:1|3,items:readonly CatalogItem[],sources:readonly EditorialSource[]):ArticleEditionBody{
  const itemByRef=assignCandidateRefs(items),claimByRef=assignClaimRefs(sources),seenRefs=new Set<string>()
  const articles=draft.articles.map((article,articleIndex)=>{
    if(!article.images.length)throw new ArticleValidationError('image_identity',{article:articleIndex,image:0,refKnown:false})
    const images=article.images.map((selection,imageIndex)=>{
      const item=itemByRef.get(selection.ref)
      if(!item)throw new ArticleValidationError('image_identity',{article:articleIndex,image:imageIndex,refKnown:false})
      if(seenRefs.has(selection.ref))throw new ArticleValidationError('duplicate_image')
      seenRefs.add(selection.ref)
      const brand=sources.find(source=>source.assetId===item.image.id&&source.kind==='brand_name')
      if(!brand)throw new ArticleValidationError('brand_reference',{article:articleIndex,image:imageIndex,sourceFound:false,nameMatches:false})
      const productSourceIds=(selection.products??[]).flatMap(kind=>{
        const found=sources.find(source=>source.assetId===item.image.id&&source.kind===kind)
        return found?[found.id]:[]
      })
      return {catalogId:item.id,assetId:item.image.id,brandName:brand.value,brandSourceId:brand.id,productSourceIds}
    })
    const culturalClaims=(article.culturalClaims??[]).map((claim,claimIndex)=>{
      const source=claimByRef.get(claim.ref)
      if(!source)throw new ArticleValidationError('cultural_claim',{article:articleIndex,claim:claimIndex})
      return {sourceId:source.id,narrativeText:claim.narrativeText}
    })
    const heroAssetId=images[0]!.assetId
    const sourceIds=[...new Set([...images.flatMap(image=>[image.brandSourceId,...image.productSourceIds]),...culturalClaims.map(claim=>claim.sourceId)])]
    return {id:`article-${heroAssetId}`,headline:article.headline,deck:article.deck,narrative:article.narrative,heroAssetId,images,sourceIds,...(culturalClaims.length?{culturalClaims}:{})}
  })
  return {version:count===1?ARTICLE_SINGLE_CONTRACT_VERSION:ARTICLE_CONTRACT_VERSION,title:draft.title,deck:draft.deck,articles}
}
