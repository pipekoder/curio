// Isolated local CLI only: no production routes, remote D1 binding or media hosting.
import { z } from 'zod'
import { normAsset, normDataUrl, normGeometryRecord, normObservation, verifyNormBytes } from './norm-asset'
import { D1Catalog } from '../worker/catalog-store'
import { AssetStore } from '../worker/asset-store'
import { classifyWithMeta, mockUnderstanding, type AssetInference } from '../worker/asset-classifier'
import { generateEditorialResult, EditorialGenerationError } from '../worker/editorial'
import { fallbackPlan } from '../shared/editorial'
import { interpretEditorialPrompt } from '../shared/editorial-intent'
import { curationCatalog } from '../shared/catalog'
import { parseSamResponse, type SamInput } from '../worker/sam-client'
import { bindSegmentation } from '../shared/decoder'
import { reserveInference } from '../worker/inference-budget'
import type { Bindings } from '../worker/index'

export const stages = ['muse-image', 'image-editorial', 'sam-segmentation'] as const
export type Stage = typeof stages[number]
type Rates = { input: number; cachedInput: number; output: number }
export type Options = { stage: Stage; mode: 'mock' | 'live'; bytes: Uint8Array; db: D1Database; env: Bindings; consent?: boolean; approval?: string; maxUsd?: number; rates?: Rates; samPriceConfirmed?: boolean; prompt?: string }
type Dependencies = { classify: typeof classifyWithMeta; editorial: typeof generateEditorialResult; sam: typeof normSam; reserve: typeof reserveInference }
export async function normSam(input: SamInput, key: string, signal: AbortSignal) {
  // Revalidate decoded exact bytes immediately before the genuine JPEG request.
  const prefix = 'data:image/jpeg;base64,'
  if (!input.imageDataUrl.startsWith(prefix)) throw Error('Exact Norm JPEG required')
  const bytes = Uint8Array.from(atob(input.imageDataUrl.slice(prefix.length)), c => c.charCodeAt(0))
  const ad = await normGeometryRecord()
  await verifyNormBytes(bytes)
  if (JSON.stringify(input.ad) !== JSON.stringify(ad) || input.detailId !== 'norm-local-detail' || input.concept !== 'seating') throw Error('Unbound Norm SAM selection')
  const response = await fetch('https://api.meta.ai/v1/responses', { method: 'POST', redirect: 'manual', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'sam-3.1', stream: true, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: input.concept }, { type: 'input_image', image_url: input.imageDataUrl }] }] }),
  })
  return parseSamResponse(response, input)
}
export async function initializeNorm(db: D1Database, bytes: Uint8Array) {
  const exact = await verifyNormBytes(bytes)
  const sourceId = 'norm-private-owner-test'
  await new D1Catalog(db).ingest({ schemaVersion: 1,
    sources: [{ id: sourceId, name: 'Owner-provided Norm test, identity unverified', entryUrl: normAsset.originalUrl, kind: 'individual_urls', issueUrl: 'https://github.com/pipekoder/curio/issues/8' }],
    candidates: [{ sourceId, imageUrl: normAsset.originalUrl, versionKey: normAsset.versionKey, sourcePage: normAsset.originalUrl, retrievedAt: '2026-10-28T00:00:00Z', sha256: normAsset.sha256, width: normAsset.width, height: normAsset.height, alt: null, attribution: null, sourceType: 'brand_candidate', provenance: { discoveredFrom: normAsset.originalUrl, notes: 'Separate local resized derivative, not the original remote bytes. Exact owner-authorized dev validation only. Public display, editing and general AI permissions remain pending.' } }],
  }, 'local-norm-validation')
  // Dev schema only, deliberately NOT a production migration. Never writes a
  // general rights approval or promotes results into public reader retrieval.
  await db.exec('CREATE TABLE IF NOT EXISTS local_norm_results(stage TEXT NOT NULL, origin TEXT NOT NULL, version_id TEXT NOT NULL, fingerprint TEXT NOT NULL, output_json TEXT NOT NULL, PRIMARY KEY(stage,origin)); CREATE TABLE IF NOT EXISTS local_norm_attempts(stage TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, started_at TEXT NOT NULL);')
  return exact
}
export async function runNormStage(o: Options, overrides: Partial<Dependencies> = {}) {
  const stage = z.enum(stages).parse(o.stage)
  const mode = z.enum(['mock', 'live']).parse(o.mode)
  const exact = await verifyNormBytes(o.bytes)
  const row = await new AssetStore(o.db).version(exact.versionId)
  if (!row || row.archived_at || row.latest_version !== row.id || row.sha256 !== exact.sha256 || row.width !== exact.width || row.height !== exact.height || ['rejected', 'blocked'].includes(String(row.analysis_status))) throw Error('Local derivative record is stale or unavailable')
  const deps = { classify: classifyWithMeta, editorial: generateEditorialResult, sam: normSam, reserve: reserveInference, ...overrides }
  const origin = mode === 'live' ? 'meta' : 'mock'
  let reference: Awaited<ReturnType<typeof normObservation>> | undefined
  if (stage === 'image-editorial') {
    const saved = await o.db.prepare("SELECT version_id,fingerprint,output_json FROM local_norm_results WHERE stage='muse-image' AND origin=?").bind(origin).first<{ version_id: string; fingerprint: string; output_json: string }>()
    if (!saved || saved.version_id !== exact.versionId || saved.fingerprint !== exact.sha256) throw Error('Matching persisted image analysis required; no automatic classification call')
    reference = await normObservation(JSON.parse(saved.output_json))
  }
  const cached = await o.db.prepare('SELECT version_id,fingerprint,output_json FROM local_norm_results WHERE stage=? AND origin=?').bind(stage, origin).first<{ version_id: string; fingerprint: string; output_json: string }>()
  if (cached && cached.version_id === exact.versionId && cached.fingerprint === exact.sha256 && stage !== 'image-editorial') {
    const output = stage === 'muse-image' ? await normObservation(JSON.parse(cached.output_json)) : bindSegmentation(JSON.parse(cached.output_json), await normGeometryRecord())
    if (stage === 'sam-segmentation' && (output as { source: string }).source !== (mode === 'live' ? 'sam_detection' : 'authored_demo')) throw Error('Incorrect cached SAM provenance')
    return { stage, origin, cached: true, requestValid: true, responseValid: true, fallback: false, inference: { attempted: false, reservedUnits: 0, latencyMs: null, usage: null }, output }
  }
  const prefs = interpretEditorialPrompt({ prompt: o.prompt ?? 'Create a quiet Scandinavian home magazine about light and space.', consent: mode === 'live' && o.consent === true })
  if (mode === 'live') {
    if (!o.consent || o.approval !== `norm-one-${stage}` || !o.env.META_API_KEY || o.env.META_SPARK_MODEL !== 'muse-spark-1.3' || o.env.MAGAZINE_MAX_CALLS !== '3') throw Error('Explicit single-stage approval, consent, fixed model, key and three-call safety budget required')
    if (!(Number.isFinite(o.maxUsd) && o.maxUsd! > 0)) throw Error('Explicit approved cost ceiling required')
    if (stage === 'sam-segmentation') { if (!o.samPriceConfirmed) throw Error('Verified SAM eligibility, JPEG support, pricing and provider spending cap required') }
    else if (!o.rates || !Object.values(o.rates).every(n => Number.isFinite(n) && n >= 0) || Object.keys(o.rates).length !== 3) throw Error('Verified Meta token prices required')
    const claim = await o.db.prepare('INSERT OR IGNORE INTO local_norm_attempts(stage,fingerprint,started_at) VALUES(?,?,?)').bind(stage, exact.sha256, new Date().toISOString()).run()
    if (claim.meta.changes !== 1) throw Error('Stage already attempted; no automatic retry permitted')
  }
  let inference: AssetInference = { attempted: false, reservedUnits: 0, latencyMs: null, usage: null }
  let output: unknown, fallback = false, responseValid = false, errorCode: string | null = null
  const started = performance.now(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000)
  try {
    if (mode === 'live') {
      const budget = await deps.reserve(o.env, '127.0.0.1', 1, stage === 'sam-segmentation' ? exact.assetId : undefined)
      if (!budget.allowed) throw Error('Inference budget denied')
      inference = { ...inference, attempted: true, reservedUnits: 1 }
    }
    if (stage === 'muse-image') {
      output = mode === 'mock'
        ? { ...mockUnderstanding(exact.versionId), imageSha256: exact.sha256, observations: { subjects: ['seating'], materialAppearance: ['indeterminate'], environments: ['interior-like'], relationships: ['light-and-shadow'] } }
        : await deps.classify(exact.versionId, exact.sha256, await normDataUrl(o.bytes), o.env.META_API_KEY!, controller.signal, measured => { inference = { ...inference, ...measured } })
      output = await normObservation(output)
    } else if (stage === 'image-editorial') {
      if (mode === 'mock') output = fallbackPlan(prefs, curationCatalog)
      else {
        const result = await deps.editorial(prefs, [...curationCatalog], o.env.META_API_KEY!, undefined, [{ versionId: exact.versionId, imageSha256: exact.sha256, source: 'meta_image_observation', observations: reference!.observations! }])
        output = result.plan; inference = { ...inference, ...result.measurement }
      }
    } else {
      const ad = await normGeometryRecord()
      output = mode === 'mock' ? bindSegmentation({ adId: ad.id, assetId: ad.image.id, width: ad.image.width, height: ad.image.height, source: 'authored_demo', model: null, regions: [{ id: 'mock-seating', detailId: 'norm-local-detail', box: { x: 0.1, y: 0.6, width: 0.5, height: 0.3 }, confidence: null, uncertainty: 'authored_not_measured' }] }, ad)
        : await deps.sam({ ad, detailId: 'norm-local-detail', concept: 'seating', imageDataUrl: await normDataUrl(o.bytes) }, o.env.META_API_KEY!, controller.signal)
    }
    if (stage === 'sam-segmentation') {
      const parsed = bindSegmentation(output, await normGeometryRecord())
      output = parsed
      if (parsed.source !== (mode === 'live' ? 'sam_detection' : 'authored_demo')) throw Error('Incorrect SAM provenance')
    }
    controller.signal.throwIfAborted()
    responseValid = true
    await o.db.prepare('INSERT OR REPLACE INTO local_norm_results(stage,origin,version_id,fingerprint,output_json) VALUES(?,?,?,?,?)').bind(stage, origin, exact.versionId, exact.sha256, JSON.stringify(output)).run()
  } catch (error) {
    errorCode = stage === 'image-editorial' && error instanceof EditorialGenerationError ? error.diagnostic.code : 'local_validation_failed'
    if (error instanceof EditorialGenerationError) inference = { ...inference, ...error.measurement }
    if (stage === 'image-editorial') { output = fallbackPlan(prefs, curationCatalog); fallback = true }
  } finally { clearTimeout(timer) }
  inference.latencyMs ??= Math.round(performance.now() - started)
  return { stage, origin, cached: false, requestValid: true, responseValid, fallback, errorCode, inference, output, referenceVersionId: reference?.versionId ?? null, publicImageSelection: false }
}
