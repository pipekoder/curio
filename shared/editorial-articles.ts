import {z} from 'zod'

export const ARTICLE_CONTRACT_VERSION='curio-editorial-articles-v1' as const
export const ARTICLE_COUNT=3
export const ARTICLE_MIN_IMAGES=2
export const ARTICLE_MAX_IMAGES=3
export const ARTICLE_MIN_ELIGIBLE_IMAGES=6
export const ARTICLE_MAX_EDITION_IMAGES=9
const id=z.string().regex(/^version-[a-f0-9]{64}$/)
const plain=z.string().trim().min(1).max(2400).refine(value=>!/[<>]|javascript:|https?:|```/i.test(value))
export const articleImage=z.strictObject({
  catalogId:z.string().max(80),assetId:id,brandName:z.string().trim().min(1).max(160),
  brandSourceId:z.string().max(180),productSourceIds:z.array(z.string().max(180)).max(6),
})
export const editorialArticle=z.strictObject({
  id:z.string().regex(/^article-version-[a-f0-9]{64}$/),
  headline:plain.max(180),deck:plain.max(400),narrative:plain,
  heroAssetId:id,images:z.array(articleImage).min(ARTICLE_MIN_IMAGES).max(ARTICLE_MAX_IMAGES),
  sourceIds:z.array(z.string().max(180)).min(1).max(36),
  culturalClaims:z.array(z.strictObject({sourceId:z.string().max(180),narrativeText:plain.max(200)})).max(8).optional(),
}).superRefine((article,ctx)=>{
  if(article.id!==`article-${article.heroAssetId}`||article.images[0]?.assetId!==article.heroAssetId||new Set(article.images.map(image=>image.assetId)).size!==article.images.length)
    ctx.addIssue({code:'custom',message:'Article hero and image identity mismatch.'})
})
export const editorialArticleEdition=z.strictObject({
  version:z.literal(ARTICLE_CONTRACT_VERSION),title:plain.max(180),deck:plain.max(400),
  articles:z.array(editorialArticle).length(ARTICLE_COUNT),
}).superRefine((edition,ctx)=>{
  if(new Set(edition.articles.map(article=>article.id)).size!==edition.articles.length||new Set(edition.articles.map(article=>article.heroAssetId)).size!==edition.articles.length||edition.articles.reduce((n,article)=>n+article.images.length,0)>ARTICLE_MAX_EDITION_IMAGES)
    ctx.addIssue({code:'custom',message:'Article image and hero identities must be unique and within the edition limit.'})
})
export type EditorialArticleEdition=z.infer<typeof editorialArticleEdition>
export type EditorialArticle=z.infer<typeof editorialArticle>
