import { curationCatalog, isPublishable, type CatalogItem } from '../shared/catalog'
import { CatalogPublications, publicationApprovals } from './catalog-publications'
import { bindSegmentation, decoderCommentary, type DecoderRequest } from '../shared/decoder'
import type { Bindings } from './index'
import { reserveInference } from './inference-budget'
import { samAssetPermits, type SamAssetPermit } from './sam-assets'
import { segmentWithMeta, type SamInput } from './sam-client'
import { regionCommentary } from './decoder-commentary'

export class DecoderError extends Error {
  constructor(public code: string, public status: 400 | 403 | 404 | 409 | 415 | 429 | 502 | 503 | 504, message: string, public retryAfter?: number) { super(message) }
}
export function decoderAvailable(env: Bindings) {
  const ad = curationCatalog.find(item => item.image.id === env.SAM_LIVE_ASSET_ID)
  const permit = env.SAM_LIVE_ASSET_ID ? samAssetPermits[env.SAM_LIVE_ASSET_ID] : null
  return env.SAM_DECODER_ENABLED === 'true' && env.META_SAM_MODEL === 'sam-3.1' && Boolean(
    env.SAM_OPERATOR_TOKEN && env.SAM_OPERATOR_TOKEN.length >= 32 && env.META_API_KEY && env.ASSETS && env.INFERENCE_BUDGET && env.PUBLIC_APP_ORIGIN && env.RATE_LIMIT_SALT && env.RATE_LIMIT_SALT.length >= 32 &&
    ad && isPublishable(ad) && !ad.image.externalUrl && ad.image.path?.endsWith('.png') &&
    ad.permissions.aiAnalysis.status === 'approved' && ad.permissions.aiAnalysis.evidence &&
    permit?.adId === ad.id && permit.path === ad.image.path && permit.analysisEvidence === ad.permissions.aiAnalysis.evidence)
}

type Dependencies = {
  catalog: readonly CatalogItem[]; permits: Readonly<Record<string, SamAssetPermit>>
  reserve: typeof reserveInference; sam: typeof segmentWithMeta; commentary: typeof regionCommentary
}
const defaults: Dependencies = { catalog: curationCatalog, permits: samAssetPermits, reserve: reserveInference, sam: segmentWithMeta, commentary: regionCommentary }

export async function runDecoder(request: DecoderRequest, env: Bindings, ip: string, dependencies: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...dependencies }
  if (env.SAM_DECODER_ENABLED !== 'true') throw new DecoderError('disabled', 503, 'Live SAM analysis is disabled.')
  const published=env.CATALOG_DB?await new CatalogPublications(env.CATALOG_DB).list('',1,[request.assetId]):{items:[]}
  const ad = deps.catalog.find(item => item.id === request.adId)??published.items.find(item=>item.id===request.adId)
  if (!ad) throw new DecoderError('unknown_ad', 404, 'The selected catalog item is unavailable.')
  if (ad.image.id !== request.assetId) throw new DecoderError('stale_asset', 409, 'The image version changed. Reload before analysis.')
  const detail = ad.discoverableObjects.find(item => item.id === request.detailId)
  if (!detail) throw new DecoderError('unknown_detail', 400, 'The selected detail is not catalog-grounded.')
  const approvals=publicationApprovals(published.items),r2Permit=env.CATALOG_DB&&env.MEDIA_BUCKET?await (await import('./media-ai-adapter')).resolveR2MediaPermit(env.CATALOG_DB,request.assetId):null
  if (!isPublishable(ad,approvals) || ad.permissions.aiAnalysis.status !== 'approved' || !ad.permissions.aiAnalysis.evidence) throw new DecoderError('analysis_not_permitted', 403, 'This asset has no evidenced AI-analysis permission.')
  // Existing compiled fixtures use an exact bundled PNG permit. Content Studio
  // assets use an exact active D1 version and private R2 object permit.
  if (!r2Permit&&(ad.image.externalUrl || !ad.image.path?.endsWith('.png'))) throw new DecoderError('unsupported_media', 415, 'An exact approved bundled or private R2 image is required.')
  const permit = deps.permits[ad.image.id]
  if (!r2Permit&&(!permit || permit.assetId !== ad.image.id || permit.adId !== ad.id || permit.path !== ad.image.path || permit.width !== ad.image.width || permit.height !== ad.image.height || permit.analysisEvidence !== ad.permissions.aiAnalysis.evidence || env.SAM_LIVE_ASSET_ID !== ad.image.id)) throw new DecoderError('asset_not_authorized', 403, 'This exact raster is not authorized for live analysis.')
  const withCommentary = env.DECODER_COMMENTARY_ENABLED === 'true'
  if (!env.META_API_KEY || env.META_SAM_MODEL !== 'sam-3.1' || (withCommentary && env.META_SPARK_MODEL !== 'muse-spark-1.3') || (!r2Permit&&!env.ASSETS)) throw new DecoderError('not_configured', 503, 'Decoder model or asset access is not configured.')
  if (ad.image.width > 4096 || ad.image.height > 4096 || ad.image.width * ad.image.height > 4000000) throw new DecoderError('unsupported_media', 415, 'The test raster exceeds the pixel limit.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    if(r2Permit){
      const imageDataUrl=await (await import('./media-ai-adapter')).readR2MediaData(env.MEDIA_BUCKET!,r2Permit,controller.signal)
      let budget;try{budget=await deps.reserve(env,ip,withCommentary?2:1,ad.image.id)}catch{throw new DecoderError('protection_unavailable',503,'The safety budget is unavailable.')}
      if(!budget.allowed)throw new DecoderError('throttled',429,'The shared inference limit has been reached.',budget.retryAfter)
      const input:SamInput={ad,detailId:detail.id,concept:detail.label,imageDataUrl};const regions=bindSegmentation(await deps.sam(input,env.META_API_KEY,controller.signal),ad);const commentary=withCommentary&&regions.regions.length?decoderCommentary.parse(await deps.commentary(input,env.META_API_KEY,controller.signal)):null;return{segmentation:regions,commentary}
    }
    const media = await env.ASSETS!.fetch(new Request(`https://local-assets.invalid${permit.path}`, { signal: controller.signal, redirect: 'manual' }))
    // Bound bytes without decoding or modifying the image. Never use req URLs.
    const reader = media.body?.getReader(); if (!reader) throw new DecoderError('invalid_image', 415, 'Missing raster bytes.')
    const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 2000000) throw new DecoderError('invalid_image', 415, 'Raster exceeds 2 MB.'); chunks.push(chunk.value) } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const png = new DataView(bytes.buffer)
    if (size < 24 || png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a || png.getUint32(12) !== 0x49484452 || png.getUint32(16) !== ad.image.width || png.getUint32(20) !== ad.image.height) throw new DecoderError('invalid_image', 415, 'PNG signature or dimensions do not match.')
    let chunkOffset = 8, hasData = false, hasEnd = false
    while (chunkOffset + 12 <= size) {
      const length = png.getUint32(chunkOffset), kind = png.getUint32(chunkOffset + 4)
      if (chunkOffset + length + 12 > size) throw new DecoderError('invalid_image', 415, 'Truncated PNG chunk.')
      if (chunkOffset === 8 && length !== 13) throw new DecoderError('invalid_image', 415, 'Invalid PNG header.')
      if (kind === 0x49444154 && length > 0) hasData = true
      if (kind === 0x49454e44) { hasEnd = length === 0 && chunkOffset + 12 === size; break }
      chunkOffset += length + 12
    }
    if (!hasData || !hasEnd) throw new DecoderError('invalid_image', 415, 'PNG data is incomplete.')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
    if (hash !== permit.sha256) throw new DecoderError('invalid_image', 415, 'Raster fingerprint changed; review is required.')
    controller.signal.throwIfAborted()
    let budget
    try { budget = await deps.reserve(env, ip, withCommentary ? 2 : 1, ad.image.id) } catch { throw new DecoderError('protection_unavailable', 503, 'The safety budget is unavailable.') }
    if (!budget.allowed) throw new DecoderError('throttled', 429, 'The shared inference limit has been reached.', budget.retryAfter)
    controller.signal.throwIfAborted()
    let binary = ''; for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
    const input: SamInput = { ad, detailId: detail.id, concept: detail.label, imageDataUrl: `data:image/png;base64,${btoa(binary)}` }
    const regions = bindSegmentation(await deps.sam(input, env.META_API_KEY, controller.signal), ad)
    controller.signal.throwIfAborted()
    const commentary = withCommentary && regions.regions.length ? decoderCommentary.parse(await deps.commentary(input, env.META_API_KEY, controller.signal)) : null
    if (commentary && (commentary.adId !== ad.id || commentary.assetId !== ad.image.id || commentary.detailId !== detail.id)) throw new Error('Unbound commentary')
    return { segmentation: regions, commentary }
  } catch (error) {
    if (controller.signal.aborted) throw new DecoderError('timeout', 504, 'Decoder analysis timed out. No automatic retry was made.')
    if (error instanceof DecoderError) throw error
    throw new DecoderError('provider_failure', 502, 'The Decoder result could not be validated. No automatic retry was made.')
  } finally { clearTimeout(timeout) }
}
