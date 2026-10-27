import { z } from 'zod'

import { categories, catalogItem, curationCatalog, validateCatalog, isPublishable } from './catalog'
export { categories, category, catalogItem, catalog } from './catalog'
export type { CatalogItem } from './catalog'
import { category } from './catalog'
const weight = z.number().int().min(0).max(100)
export const magazineRequest = z.strictObject({
  interests: z.string().trim().max(1000),
  lifestyles: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  allocations: z.strictObject({ home: weight, fashion: weight, travel: weight }),
  consent: z.literal(true),
}).refine(({ allocations }) => Object.values(allocations).reduce((a, b) => a + b, 0) === 100,
  { message: 'Category allocations must total 100%.' })
export type MagazineRequest = z.infer<typeof magazineRequest>

// All model prose is interpretation, never a verified factual claim or shopping URL.
const prose = z.string().trim().min(1).max(350).refine(s => !/(https?:|www\.|\[[^\]]*\]\(|<[^>]*>)/i.test(s), 'Links and markup are not allowed.')
export const modelIssue = z.strictObject({
  title: prose,
  layoutIntent: z.enum(['airy', 'immersive']).default('airy'),
  sections: z.array(z.strictObject({ category, catalogId: z.string().min(1).max(50), assetId: z.string().min(1).max(70), commentary: prose })).min(1).max(3),
})
export const magazineIssue = z.strictObject({
  id: z.string().uuid(), title: prose, layoutIntent: z.enum(['airy', 'immersive']), model: z.literal('muse-spark-1.3'),
  source: z.literal('meta_generated_commentary'),
  sections: z.array(z.strictObject({
    category, weight, ad: catalogItem, commentary: prose,
    commentarySource: z.literal('ai_interpretation_not_verified_fact'),
  })).min(1).max(3),
})
export type MagazineIssue = z.infer<typeof magazineIssue>
export type CatalogPreview = Omit<MagazineIssue, 'model' | 'source' | 'sections'> & {
  source: 'catalog_preview'
  sections: (Omit<MagazineIssue['sections'][number], 'commentarySource'> & { commentarySource: 'authored_fixture_commentary' })[]
}

export function normalizeIssue(raw: unknown, request: MagazineRequest, items = curationCatalog): MagazineIssue {
  const approvedItems = validateCatalog(items)
  const draft = modelIssue.parse(raw)
  const selected = categories.filter(key => request.allocations[key] > 0)
  if (draft.sections.length !== selected.length) throw new Error('Incorrect category coverage')
  const seen = new Set<string>()
  const sections = draft.sections.map(section => {
    const ad = approvedItems.find(item => item.id === section.catalogId)
    if (!ad || !isPublishable(ad) || ad.image.id !== section.assetId || ad.category !== section.category || !selected.includes(section.category) || seen.has(section.category)) {
      throw new Error('Unknown catalog item or invalid category')
    }
    seen.add(section.category)
    return { category: section.category, weight: request.allocations[section.category], ad,
      commentary: section.commentary, commentarySource: 'ai_interpretation_not_verified_fact' as const }
  }).sort((a, b) => b.weight - a.weight)
  return magazineIssue.parse({ id: crypto.randomUUID(), title: draft.title,
    layoutIntent: draft.layoutIntent, model: 'muse-spark-1.3', source: 'meta_generated_commentary', sections })
}
