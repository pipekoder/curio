import { z } from 'zod'

export const categories = ['home', 'fashion', 'travel'] as const
export const category = z.enum(categories)
const weight = z.number().int().min(0).max(100)
export const magazineRequest = z.strictObject({
  interests: z.string().trim().max(1000),
  lifestyles: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  allocations: z.strictObject({ home: weight, fashion: weight, travel: weight }),
  consent: z.literal(true),
}).refine(({ allocations }) => Object.values(allocations).reduce((a, b) => a + b, 0) === 100,
  { message: 'Category allocations must total 100%.' })
export type MagazineRequest = z.infer<typeof magazineRequest>

export const catalogItem = z.strictObject({
  id: z.string().min(1).max(50), category,
  name: z.string().min(1).max(80), description: z.string().min(1).max(200),
  source: z.literal('fictional_fixture'), asset: z.literal('illustrated_placeholder'),
})
export type CatalogItem = z.infer<typeof catalogItem>
export const catalog: CatalogItem[] = [
  { id: 'home-lamp', category: 'home', name: 'Paper Moon Lamp', description: 'A fictional sculptural paper lamp for a quiet reading corner.' },
  { id: 'home-chair', category: 'home', name: 'Pebble Chair', description: 'A fictional rounded chair in muted clay tones.' },
  { id: 'fashion-coat', category: 'fashion', name: 'Drift Coat', description: 'A fictional flowing coat in a soft sand palette.' },
  { id: 'fashion-bag', category: 'fashion', name: 'Fold Bag', description: 'A fictional geometric bag with a simple folded silhouette.' },
  { id: 'travel-cabin', category: 'travel', name: 'Stillwater Cabin', description: 'An imaginary lakeside retreat, not a bookable destination.' },
  { id: 'travel-walk', category: 'travel', name: 'Moss Path', description: 'An imaginary woodland walking escape, not a travel offer.' },
].map(item => catalogItem.parse({ ...item, source: 'fictional_fixture', asset: 'illustrated_placeholder' }))

// All model prose is interpretation, never a verified factual claim or shopping URL.
const prose = z.string().trim().min(1).max(350).refine(s => !/(https?:|www\.|\[[^\]]*\]\(|<[^>]*>)/i.test(s), 'Links and markup are not allowed.')
export const modelIssue = z.strictObject({
  title: prose,
  sections: z.array(z.strictObject({ category, catalogId: z.string().min(1).max(50), commentary: prose })).min(1).max(3),
})
export const magazineIssue = z.strictObject({
  id: z.string().uuid(), title: prose, model: z.literal('muse-spark-1.3'),
  source: z.literal('meta_generated_commentary'),
  sections: z.array(z.strictObject({
    category, weight, ad: catalogItem, commentary: prose,
    commentarySource: z.literal('ai_interpretation_not_verified_fact'),
  })).min(1).max(3),
})
export type MagazineIssue = z.infer<typeof magazineIssue>

export function normalizeIssue(raw: unknown, request: MagazineRequest, items = catalog): MagazineIssue {
  const draft = modelIssue.parse(raw)
  const selected = categories.filter(key => request.allocations[key] > 0)
  if (draft.sections.length !== selected.length) throw new Error('Incorrect category coverage')
  const seen = new Set<string>()
  const sections = draft.sections.map(section => {
    const ad = items.find(item => item.id === section.catalogId)
    if (!ad || ad.category !== section.category || !selected.includes(section.category) || seen.has(section.category)) {
      throw new Error('Unknown catalog item or invalid category')
    }
    seen.add(section.category)
    return { category: section.category, weight: request.allocations[section.category], ad,
      commentary: section.commentary, commentarySource: 'ai_interpretation_not_verified_fact' as const }
  }).sort((a, b) => b.weight - a.weight)
  return magazineIssue.parse({ id: crypto.randomUUID(), title: draft.title,
    model: 'muse-spark-1.3', source: 'meta_generated_commentary', sections })
}
