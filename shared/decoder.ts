import { z } from 'zod'
import { catalog, isPublishable, type CatalogItem } from './catalog'

const id = z.string().regex(/^[a-z0-9-]+$/).max(80)
export const normalizedBox = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) })
  .refine(box => box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001, 'Region exceeds source bounds')
export const decoderRegion = z.strictObject({
  id, detailId: id, box: normalizedBox,
  confidence: z.number().min(0).max(1).nullable(),
  uncertainty: z.enum(['authored_not_measured', 'model_estimate_not_identity']),
})
export const segmentation = z.strictObject({
  adId: id, assetId: id, width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
  source: z.enum(['authored_demo', 'sam_detection']), model: z.literal('sam-3.1').nullable(),
  regions: z.array(decoderRegion).max(8),
}).superRefine((data, ctx) => {
  if ((data.source === 'authored_demo') !== (data.model === null)) ctx.addIssue({ code: 'custom', message: 'Incorrect detection provenance' })
  if (new Set(data.regions.map(region => region.id)).size !== data.regions.length) ctx.addIssue({ code: 'custom', message: 'Duplicate region IDs' })
  for (const region of data.regions) {
    if (data.source === 'authored_demo' && (region.confidence !== null || region.uncertainty !== 'authored_not_measured')) ctx.addIssue({ code: 'custom', message: 'Authored annotations have no model confidence' })
    if (data.source === 'sam_detection' && region.uncertainty !== 'model_estimate_not_identity') ctx.addIssue({ code: 'custom', message: 'SAM regions must disclose uncertainty' })
  }
})
export type Segmentation = z.infer<typeof segmentation>
export type DecoderRegion = z.infer<typeof decoderRegion>
export const decoderRequest = z.strictObject({ adId: id, assetId: id, detailId: id, consent: z.literal(true) })
export type DecoderRequest = z.infer<typeof decoderRequest>
const prose = z.string().trim().min(1).max(500).refine(value => !/(https?:|www\.|<[^>]*>|\[[^\]]*\]\()/i.test(value), 'No markup or links')
export const decoderCommentary = z.strictObject({ adId: id, assetId: id, detailId: id, text: prose,
  model: z.literal('muse-spark-1.3'), source: z.literal('ai_interpretation_not_verified_fact') })

export function bindSegmentation(raw: unknown, ad: CatalogItem): Segmentation {
  const data = segmentation.parse(raw)
  if (data.adId !== ad.id || data.assetId !== ad.image.id || data.width !== ad.image.width || data.height !== ad.image.height) throw new Error('Stale or mismatched source image')
  if (data.regions.some(region => !ad.discoverableObjects.some(detail => detail.id === region.detailId))) throw new Error('Unknown catalog detail')
  return data
}

// Source-pixel geometry authored from our own 1200x900 SVGs. These are not SAM
// outputs or pixel-accurate masks. Never bind them to a different asset version.
const demoBoxes: Record<string, { detailId: string; box: [number, number, number, number] }[]> = {
  'home-lamp': [{ detailId: 'home-lamp-detail', box: [560, 170, 400, 320] }, { detailId: 'home-lamp-base', box: [660, 480, 200, 270] }],
  'home-chair': [{ detailId: 'home-chair-detail', box: [380, 245, 520, 500] }],
  'fashion-coat': [{ detailId: 'fashion-coat-detail', box: [270, 230, 670, 590] }],
  'fashion-bag': [{ detailId: 'fashion-bag-detail', box: [300, 320, 630, 440] }],
  'travel-cabin': [{ detailId: 'travel-cabin-detail', box: [270, 190, 510, 380] }],
  'travel-walk': [{ detailId: 'travel-walk-detail', box: [400, 300, 380, 590] }],
}
export function authoredDemo(ad: CatalogItem): Segmentation | null {
  if (!isPublishable(ad) || ad.image.role !== 'placeholder' || ad.image.externalUrl || ad.image.id !== `asset-${ad.id}-v1` || ad.image.path !== `/catalog/${ad.id}.svg` || !demoBoxes[ad.id]) return null
  return bindSegmentation({ adId: ad.id, assetId: ad.image.id, width: 1200, height: 900, source: 'authored_demo', model: null,
    regions: demoBoxes[ad.id].map(({ detailId, box }, index) => ({ id: `${ad.id}-region-${index + 1}`, detailId,
      box: { x: box[0] / 1200, y: box[1] / 900, width: box[2] / 1200, height: box[3] / 900 }, confidence: null, uncertainty: 'authored_not_measured' })) }, ad)
}
export function containRect(frameWidth: number, frameHeight: number, sourceWidth: number, sourceHeight: number) {
  if (![frameWidth, frameHeight, sourceWidth, sourceHeight].every(value => Number.isFinite(value) && value > 0)) return null
  const scale = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight)
  const width = sourceWidth * scale, height = sourceHeight * scale
  return { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height }
}
export function relatedDiscovery(ad: CatalogItem) {
  return catalog.find(item => item.id !== ad.id && isPublishable(item) && item.category === ad.category && item.lifestyleTags.some(tag => ad.lifestyleTags.includes(tag))) ??
    catalog.find(item => item.id !== ad.id && isPublishable(item) && item.category === ad.category)
}

// Result input is supplied only by an authenticated operator capture/replay, never
// fetched by the public reader. Live API authentication stays on the Worker.
export function readerSegmentation(ad: CatalogItem, result?: unknown): Segmentation | null {
  if (result === undefined) return authoredDemo(ad)
  if (!isPublishable(ad) || ad.image.externalUrl || !ad.image.path?.endsWith('.png') || ad.permissions.aiAnalysis.status !== 'approved' || !ad.permissions.aiAnalysis.evidence) return authoredDemo(ad)
  try {
    const parsed = bindSegmentation(result, ad)
    return parsed.source === 'sam_detection' && parsed.model === 'sam-3.1' ? parsed : authoredDemo(ad)
  } catch { return authoredDemo(ad) }
}
