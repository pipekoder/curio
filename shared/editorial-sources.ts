import { z } from 'zod'

const bounded = z.string().trim().min(1).max(4000)
export const editorialSource = z.strictObject({
  id: z.string().regex(/^[a-z0-9:_-]+$/).max(180),
  assetId: z.string().regex(/^version-[a-f0-9]{64}$/),
  kind: z.enum(['brand_name','brand_story','brand_description','brand_country','product_name','product_description','product_category','product_materials','product_price','campaign_name','campaign_description','cultural_claim']),
  label: z.string().trim().min(1).max(80),
  value: bounded,
  authority: z.enum(['owner_supplied_mockup','operator_reviewed_cultural']),
  source: z.enum(['content_studio','cultural_evidence_pack']),
  citations:z.array(z.strictObject({sourceId:z.string().max(180),passageId:z.string().max(180),url:z.url().max(2048),publication:z.string().max(160).nullable()})).max(6).optional(),
}).refine(value=>(value.authority==='owner_supplied_mockup')===(value.source==='content_studio')&&(value.kind==='cultural_claim')===(value.authority==='operator_reviewed_cultural')&&(value.kind==='cultural_claim'||!value.citations),{message:'Editorial source authority mismatch'})
export const editorialSources = z.array(editorialSource).max(120)
export type EditorialSource = z.infer<typeof editorialSource>

export function sourcesForAsset(sources: readonly EditorialSource[], assetId: string) {
  return sources.filter(source => source.assetId === assetId)
}
