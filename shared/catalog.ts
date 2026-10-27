import { z } from 'zod'

export const categories = ['home', 'fashion', 'travel'] as const
export const category = z.enum(categories)
export const lifestyles = ['Japanese Wabi-Sabi', 'Gaudí / Catalan Modernism', 'Scandinavian', 'French Style', 'British Vintage & Eclectic', 'Quiet Luxury', 'Urban Creative', 'Nature & Outdoor'] as const
export const CATALOG_CAPACITY = 24
const text = z.string().trim().min(1).max(500)
const reference = z.string().regex(/^docs\/[a-zA-Z0-9/_#.-]+$/)
const sourceUrl = z.url().refine(value => {
  try {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && !/\b(checkout|cart|payment|buy|shop)\b/i.test(url.pathname)
  } catch { return false }
}, 'Use an HTTPS source without tracking, purchase or checkout paths.')
export const imagePath = z.string().regex(/^\/catalog\/[a-z0-9][a-z0-9-]*\.(svg|webp|avif|jpg|png)$/)
export const catalogItem = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/).max(50), category,
  name: z.string().min(1).max(80), description: z.string().min(1).max(200),
  lifestyleTags: z.array(z.enum(lifestyles)).min(1).max(8),
  sourceType: z.enum(['licensed_brand', 'synthetic_concept', 'editorial_support']),
  advertiser: z.strictObject({ name: text, verification: z.enum(['unverified', 'verified']), evidence: reference.nullable() }).nullable(),
  campaign: z.strictObject({ title: text, reference: reference.nullable() }),
  image: z.strictObject({ id: z.string().regex(/^[a-z0-9-]+$/), path: imagePath.nullable(), alt: text, width: z.number().int().positive(), height: z.number().int().positive(), role: z.enum(['placeholder', 'supplied_image']) }),
  provenance: z.strictObject({ origin: z.enum(['authored_geometry', 'owner_supplied']), sourceUrl: sourceUrl.nullable(), evidence: reference, attribution: text,
    modifications: z.array(z.strictObject({ date: z.iso.date(), description: text })).max(20) }),
  licensing: z.strictObject({ status: z.enum(['pending', 'cleared', 'placeholder_only']), rightsHolder: text.nullable(), evidence: reference.nullable() }),
  verifiedBrandLink: sourceUrl.nullable(),
  discoverableObjects: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9-]+$/), label: text, description: text,
    grounding: z.enum(['authored_illustration', 'catalog_metadata']), productIdentity: text.nullable() })).max(20),
}).superRefine((item, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (item.sourceType === 'licensed_brand' && (!item.advertiser || item.advertiser.verification !== 'verified' || !item.advertiser.evidence)) reject('Brand content requires documented advertiser verification.')
  if (item.licensing.status === 'cleared' && (!item.licensing.evidence || !item.licensing.rightsHolder)) reject('Cleared rights require evidence and a rights holder.')
  if (item.licensing.status === 'placeholder_only' && (item.sourceType !== 'synthetic_concept' || item.image.role !== 'placeholder' || item.provenance.origin !== 'authored_geometry' || item.advertiser !== null)) reject('Placeholder status is only for unbranded original geometry.')
  if (item.verifiedBrandLink && (!URL.canParse(item.verifiedBrandLink) || item.sourceType !== 'licensed_brand' || item.licensing.status !== 'cleared' || new URL(item.verifiedBrandLink).pathname !== '/')) reject('Only verified, rights-cleared advertiser homepages may be linked.')
})
export type CatalogItem = z.infer<typeof catalogItem>

// Human-reviewed approval registry. Empty until the owner supplies verification.
// Neither a model nor a submitted URL may grant its own merchant-link permission.
export const approvedBrandLinks: Readonly<Record<string, string>> = Object.freeze({})
export function validateCatalog(records: unknown, approvals = approvedBrandLinks): CatalogItem[] {
  const items = z.array(catalogItem).max(CATALOG_CAPACITY).parse(records)
  if (new Set(items.map(item => item.id)).size !== items.length || new Set(items.map(item => item.image.id)).size !== items.length) throw new Error('Catalog and asset IDs must be unique')
  for (const item of items) {
    if (item.verifiedBrandLink && approvals[item.id] !== item.verifiedBrandLink) throw new Error('Brand link has not been approved')
  }
  return items
}
export const isPublishable = (item: CatalogItem) => item.image.path !== null && (item.licensing.status === 'cleared' || item.licensing.status === 'placeholder_only')

const seeds = [
  { id: 'home-lamp', category: 'home', name: 'Paper Moon Lamp', description: 'A fictional sculptural paper lamp for a quiet reading corner.', tags: [0, 2], object: 'Paper shade' },
  { id: 'home-chair', category: 'home', name: 'Pebble Chair', description: 'A fictional rounded chair in muted clay tones.', tags: [1, 5], object: 'Rounded silhouette' },
  { id: 'fashion-coat', category: 'fashion', name: 'Drift Coat', description: 'A fictional flowing coat in a soft sand palette.', tags: [3, 5], object: 'Draped shape' },
  { id: 'fashion-bag', category: 'fashion', name: 'Fold Bag', description: 'A fictional geometric bag with a simple folded silhouette.', tags: [4, 6], object: 'Folded panel' },
  { id: 'travel-cabin', category: 'travel', name: 'Stillwater Cabin', description: 'An imaginary lakeside retreat, not a bookable destination.', tags: [2, 7], object: 'Lakeside composition' },
  { id: 'travel-walk', category: 'travel', name: 'Moss Path', description: 'An imaginary woodland walking escape, not a travel offer.', tags: [0, 7], object: 'Winding path' },
]
export const catalog = validateCatalog(seeds.map(({ tags, object, ...item }) => ({ ...item,
  lifestyleTags: tags.map(index => lifestyles[index]), sourceType: 'synthetic_concept', advertiser: null,
  campaign: { title: 'Curio fictional fixture study', reference: 'docs/ASSET_REGISTER.md' },
  image: { id: `asset-${item.id}-v1`, path: `/catalog/${item.id}.svg`, alt: `Original geometric illustration of ${item.name}; fictional placeholder, not a product photograph.`, width: 1200, height: 900, role: 'placeholder' },
  provenance: { origin: 'authored_geometry', sourceUrl: null, evidence: 'docs/ASSET_REGISTER.md', attribution: 'Curio · original geometric placeholder', modifications: [{ date: '2026-10-27', description: 'Added original SVG illustration; no third-party image or real brand marks used.' }] },
  licensing: { status: 'placeholder_only', rightsHolder: null, evidence: 'docs/ASSET_REGISTER.md' }, verifiedBrandLink: null,
  discoverableObjects: [{ id: `${item.id}-detail`, label: object, description: 'An authored visual detail in this fictional illustration; no identified real product.', grounding: 'authored_illustration', productIdentity: null }],
})))

// Storage boundary: UI and curation consume records, not storage-provider URLs.
export interface CatalogRepository { list(): readonly CatalogItem[]; get(id: string): CatalogItem | undefined }
export const localCatalogRepository: CatalogRepository = { list: () => catalog, get: id => catalog.find(item => item.id === id) }
export const curationCatalog = catalog.filter(isPublishable)
