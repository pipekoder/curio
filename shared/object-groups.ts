import type { DecoderRegion, Segmentation } from './decoder'
export type ObjectHint = { objectKey?: string; suppress?: boolean }
export type InteractiveObject = DecoderRegion & { memberIds: readonly string[]; grouping: 'single' | 'reviewed_fragments' }
const area = (b: DecoderRegion['box']) => b.width * b.height
function relation(a: DecoderRegion['box'], b: DecoderRegion['box']) {
  const overlap = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
  const gap = Math.hypot(Math.max(0, Math.max(a.x,b.x)-Math.min(a.x+a.width,b.x+b.width)), Math.max(0, Math.max(a.y,b.y)-Math.min(a.y+a.height,b.y+b.height)))
  return { iou: overlap / (area(a)+area(b)-overlap), gap }
}
// Overlap is not identity. Broad semantic labels ("seating") never merge objects.
// Reviewed object keys permit nearby fragments; complete-link avoids bridge chains.
export function groupObjects(result: Segmentation, hints: Readonly<Record<string, ObjectHint>> = {}) {
  const raw = result.regions
  const groups: DecoderRegion[][] = []
  const ordered = [...raw].sort((a,b) => a.id.localeCompare(b.id))
  for (const region of ordered) {
    if (hints[region.id]?.suppress) continue
    const candidates = groups.filter(group => group.every(other => {
      if (region.detailId !== other.detailId) return false
      const a = hints[region.id]?.objectKey, b = hints[other.id]?.objectKey
      if ((a || b) && a !== b) return false
      const { gap } = relation(region.box,other.box)
      return a && a === b ? gap <= 0.025 : false
    }))
    // Ambiguous membership is not resolved by arbitrary input order.
    if (candidates.length === 1) candidates[0].push(region)
    else groups.push([region])
  }
  const objects: InteractiveObject[] = groups.map(group => {
    const first = group[0], x = Math.min(...group.map(r=>r.box.x)), y = Math.min(...group.map(r=>r.box.y))
    return { ...first, confidence: group.length === 1 ? first.confidence : null, box: { x,y,width: Math.max(...group.map(r=>r.box.x+r.box.width))-x,height: Math.max(...group.map(r=>r.box.y+r.box.height))-y }, memberIds: group.map(r=>r.id), grouping: group.length === 1 ? 'single' : 'reviewed_fragments' }
  })
  const possibleDuplicates = ordered.flatMap((a,i)=>ordered.slice(i+1).filter(b=>a.detailId===b.detailId && relation(a.box,b.box).iou >= 0.92).map(b=>[a.id,b.id]))
  return { raw, objects, possibleDuplicates, suppressedIds: raw.filter(r=>hints[r.id]?.suppress).map(r=>r.id), uncertainty: 'approximate_boxes_not_pixel_masks' as const }
}
