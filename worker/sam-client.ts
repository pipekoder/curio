import { parseImageStream, recordsOfKind, type ImageSegmentationResult } from '@meta-sam/parser'
import { bindSegmentation, type Segmentation } from '../shared/decoder'
import type { CatalogItem } from '../shared/catalog'

export type SamInput = { ad: CatalogItem; detailId: string; concept: string; imageDataUrl: string }
// Bounded SSE framing only; SAM geometry/mask grammar is parsed by Meta's library.
async function* responseEvents(body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new Error('Missing stream')
  const reader = body.getReader(), decoder = new TextDecoder()
  let total = 0, buffer = '', events = 0
  const completedLanes = new Set<string>()
  let sawTextLane = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > 1024 * 1024) throw new Error('SAM output too large')
      buffer += decoder.decode(chunk.value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]') continue
        if (++events > 128) throw new Error('Too many SAM events')
        const event = JSON.parse(data) as { type?: string; item_id?: string; output_index?: number; content_index?: number; part?: { type?: string; text?: string } }
        if (typeof event.type !== 'string') throw new Error('Invalid event')
        const text = (event as { delta?: string; text?: string }).delta ?? (event as { text?: string }).text ?? event.part?.text ?? ''
        for (const match of text.matchAll(/;data=(\d+),(\d+),/g)) {
          const height = Number(match[1]), width = Number(match[2])
          if (width > 4096 || height > 4096 || width * height > 4000000) throw new Error('Mask exceeds resource limit')
        }
        const lane = `${event.item_id}:${event.output_index}:${event.content_index}`
        const partDone = event.type === 'response.content_part.done' && event.part?.type === 'output_text'
        if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done' || partDone) sawTextLane = true
        if (event.type === 'response.output_text.done' || partDone) {
          if (completedLanes.has(lane)) continue
          completedLanes.add(lane)
        }
        // Meta documents zero-match completion with no output_text events;
        // parser 0.1.0 still requires an explicitly finalized empty lane.
        if (event.type === 'response.completed' && !sawTextLane) {
          yield { type: 'response.output_text.done', item_id: 'curio-empty', output_index: 0, content_index: 0, text: '' }
        }
        yield { ...event, type: event.type }
      }
    }
    if (buffer.trim()) throw new Error('Truncated SSE event')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export function normalizeSamResult(result: ImageSegmentationResult, ad: CatalogItem, detailId: string): Segmentation {
  if (result.outcome.status !== 'completed' || result.diagnostics.some(item => item.severity === 'error')) throw new Error('Incomplete or malformed SAM result')
  if (result.records.some(record => record.kind === 'text')) throw new Error('Unexpected text in segmentation')
  for (const dimensions of result.rawOutput.matchAll(/;w=(\d+);h=(\d+)/g)) {
    if (Number(dimensions[1]) !== ad.image.width || Number(dimensions[2]) !== ad.image.height) throw new Error('Source dimensions do not match')
  }
  const boxes = recordsOfKind(result.records, 'box')
  if (boxes.length > 8) throw new Error('Too many regions')
  return bindSegmentation({ adId: ad.id, assetId: ad.image.id, width: ad.image.width, height: ad.image.height,
    model: 'sam-3.1', source: 'sam_detection', regions: boxes.map(box => ({ id: `sam-${box.objectId}`, detailId,
      box: { x: box.left / ad.image.width, y: box.top / ad.image.height, width: (box.right - box.left) / ad.image.width, height: (box.bottom - box.top) / ad.image.height },
      confidence: box.confidence ?? null, uncertainty: 'model_estimate_not_identity' })) }, ad)
}
export async function segmentWithMeta(input: SamInput, key: string, signal: AbortSignal): Promise<Segmentation> {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(input.imageDataUrl) || input.imageDataUrl.length > 2800000) throw new Error('Invalid approved raster')
  const response = await fetch('https://api.meta.ai/v1/responses', { method: 'POST', redirect: 'manual', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'sam-3.1', stream: true, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: input.concept }, { type: 'input_image', image_url: input.imageDataUrl }] }] }),
  })
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/event-stream')) { await response.body?.cancel(); throw new Error('Meta SAM request failed') }
  const result = await parseImageStream(responseEvents(response.body)).finalResult
  return normalizeSamResult(result, input.ad, input.detailId)
}
