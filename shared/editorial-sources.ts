import { z } from 'zod'

const bounded = z.string().trim().min(1).max(4000)
export const editorialSource = z.strictObject({
  id: z.string().regex(/^[a-z0-9:_-]+$/).max(180),
  assetId: z.string().regex(/^version-[a-f0-9]{64}$/),
  kind: z.enum(['brand_name','brand_story','brand_description','brand_country','product_name','product_description','product_category','product_materials','product_price','campaign_name','campaign_description']),
  label: z.string().trim().min(1).max(80),
  value: bounded,
  authority: z.literal('owner_supplied_mockup'),
  source: z.literal('content_studio'),
})
export const editorialSources = z.array(editorialSource).max(120)
export type EditorialSource = z.infer<typeof editorialSource>

export function sourcesForAsset(sources: readonly EditorialSource[], assetId: string) {
  return sources.filter(source => source.assetId === assetId)
}
