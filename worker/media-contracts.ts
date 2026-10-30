import { z } from 'zod'
import { categories, lifestyles } from '../shared/catalog'

const text = (max = 1000) => z.string().trim().max(max)
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
const website = z.union([z.literal(''), z.url({ protocol: /^https$/ })]).nullable().default(null)

export const brandInput = z.strictObject({
  id: id.optional(), name: text(120).min(1), story: text(4000).default(''),
  description: text(4000).default(''), website, country: text(120).nullable().default(null),
})
export const productInput = z.strictObject({
  id: id.optional(), brand: text(120).min(1), name: text(160).min(1), description: text(4000).default(''),
  category: z.enum(categories), materials: z.array(text(120).min(1)).max(30).default([]),
  price: z.number().nonnegative().max(100000000).nullable().default(null), currency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  imageFilenames: z.array(text(255).min(1)).max(100).default([]), lifestyleTags: z.array(z.enum(lifestyles)).max(8).default([]),
})
export const campaignInput = z.strictObject({
  id: id.optional(), brand: text(120).nullable().default(null), name: text(160).min(1),
  description: text(4000).default(''), imageFilenames: z.array(text(255).min(1)).max(100).default([]),
})
export const studioImport = z.strictObject({
  batchId: z.uuid().optional(), sourceText: text(100000).default(''),
  brands: z.array(brandInput).max(100), products: z.array(productInput).max(500), campaigns: z.array(campaignInput).max(200).default([]),
})
export type StudioImport = z.infer<typeof studioImport>

export const mediaLinkInput = z.strictObject({
  imageType: z.enum(['product', 'brand', 'campaign', 'editorial']),
  productId: id.nullable().default(null), brandId: id.nullable().default(null), campaignId: id.nullable().default(null),
}).refine(value => value.imageType === 'editorial' || Boolean(value.productId || value.brandId || value.campaignId), 'Choose a matching record.')

const lineValue = (line: string, name: string) => line.match(new RegExp(`^${name}\\s*:\\s*(.+)$`, 'i'))?.[1]?.trim()
export function parseStudioText(source: string): StudioImport {
  if (new TextEncoder().encode(source).length > 100000) throw new Error('Import text exceeds 100 KiB.')
  const trimmed = source.trim()
  if (!trimmed) return { sourceText: '', brands: [], products: [], campaigns: [] }
  if (trimmed.startsWith('{')) return studioImport.parse({ ...JSON.parse(trimmed), sourceText: source })
  const brands: z.infer<typeof brandInput>[] = [], products: z.infer<typeof productInput>[] = [], campaigns: z.infer<typeof campaignInput>[] = []
  let brandName = ''
  for (const block of trimmed.split(/\n\s*\n+/)) {
    const lines = block.split('\n').map(value => value.trim()).filter(Boolean)
    const brand = lines.map(line => lineValue(line, 'Brand')).find(Boolean)
    const product = lines.map(line => lineValue(line, 'Product')).find(Boolean)
    const campaign = lines.map(line => lineValue(line, 'Campaign')).find(Boolean)
    if (brand) {
      brandName = brand
      brands.push(brandInput.parse({ name: brand, story: lines.map(line => lineValue(line, 'Story')).find(Boolean) ?? '', description: lines.map(line => lineValue(line, 'Description')).find(Boolean) ?? '', website: lines.map(line => lineValue(line, 'Website')).find(Boolean) ?? null, country: lines.map(line => lineValue(line, 'Country')).find(Boolean) ?? null }))
    }
    if (product) products.push(productInput.parse({ brand: lines.map(line => lineValue(line, 'Brand')).find(Boolean) ?? brandName, name: product, description: lines.map(line => lineValue(line, 'Description')).find(Boolean) ?? '', category: (lines.map(line => lineValue(line, 'Category')).find(Boolean) ?? 'home').toLowerCase(), materials: (lines.map(line => lineValue(line, 'Materials')).find(Boolean) ?? '').split(',').map(value => value.trim()).filter(Boolean), price: Number(lines.map(line => lineValue(line, 'Price')).find(Boolean)?.match(/[\d.]+/)?.[0] ?? '') || null, currency: lines.map(line => lineValue(line, 'Currency')).find(Boolean)?.toUpperCase() ?? null, imageFilenames: (lines.map(line => lineValue(line, 'Images?')).find(Boolean) ?? '').split(',').map(value => value.trim()).filter(Boolean) }))
    if (campaign) campaigns.push(campaignInput.parse({ brand: (lines.map(line => lineValue(line, 'Brand')).find(Boolean) ?? brandName) || null, name: campaign, description: lines.map(line => lineValue(line, 'Description')).find(Boolean) ?? '', imageFilenames: (lines.map(line => lineValue(line, 'Images?')).find(Boolean) ?? '').split(',').map(value => value.trim()).filter(Boolean) }))
  }
  return studioImport.parse({ sourceText: source, brands, products, campaigns })
}
