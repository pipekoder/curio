import { observedObjectCandidate } from "../shared/object-localization"
import { visualObservations } from "../shared/visual-observations"
import { z } from 'zod'
import { categories, lifestyles } from '../shared/catalog'
import { isSafeHttpsUrl } from '../shared/url-policy'
import { candidateRecord, sourceRecord } from './catalog-contracts'
export const versionId = z.string().regex(/^version-[a-f0-9]{64}$/)
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
const text = z.string().trim().min(1).max(500)
const publicPage = z.string().max(2048).refine(v => isSafeHttpsUrl(v.split('#')[0]))
export const editorialHints = z.strictObject({ categories: z.array(z.enum(categories)).max(3), aesthetics: z.array(z.enum(lifestyles)).max(8), tags: z.array(text).max(15) })
export const discoveryItem = z.strictObject({ candidate: candidateRecord,
  publisher: z.strictObject({ name: text, campaign: text.nullable(), description: text.nullable(), alt: text.nullable(), sourcePage: publicPage, hints: editorialHints }),
  access: z.strictObject({ status: z.enum(['unverified','observed','reachable','blocked','failed']), transport: z.enum(['owner_metadata','web_connector','head']), httpStatus: z.number().int().min(100).max(599).nullable(), contentType: z.string().max(100).nullable() }),
}).superRefine((v, ctx) => {
  if (v.access.status === 'reachable' && (v.access.transport !== 'head' || v.access.httpStatus !== 200 || !v.access.contentType?.startsWith('image/'))) ctx.addIssue({ code: 'custom', message: 'Reachability requires a successful image HEAD check.' })
})
export type DiscoveryItem = z.infer<typeof discoveryItem>
export const discoveryImport = z.strictObject({ sources: z.array(sourceRecord).max(10), items: z.array(discoveryItem).max(5) }).refine(v => v.sources.length + 8*v.items.length + 3 <= 50, 'Split source and asset batches to preserve the Workers Free D1 query budget.')
const score = z.number().min(0).max(1)
export const understanding = z.strictObject({ versionId, imageSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  categoryScores: z.record(z.enum(categories), score), aestheticScores: z.record(z.enum(lifestyles), score),
  tags: z.array(text).max(30), objects: z.array(text).max(20), colors: z.array(text).max(12),
  observations: visualObservations.optional(),
  objectCandidates: z.array(observedObjectCandidate).max(4).optional(),
  mood: text, composition: text, editorialThemes: z.array(text).max(10), editorialRelevance: score,
})
export type Understanding = z.infer<typeof understanding>
export const classificationRequest = z.strictObject({ versionId, mode: z.enum(['mock','meta']).default('mock'), consent: z.literal(true), retryFailed: z.boolean().default(false) })
export const retrievalRequest = z.strictObject({
  allocations: z.strictObject({ home: z.number().min(0).max(100), fashion: z.number().min(0).max(100), travel: z.number().min(0).max(100) }),
  aesthetics: z.array(z.enum(lifestyles)).max(8), tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  brandDiversity: z.boolean().default(true), serendipity: z.number().min(0).max(0.25).default(0), seed: z.string().max(40).default('curio'),
  scope: z.enum(['reader','review']).default('reader'), includeMock: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20),
  categoryFilter: z.enum(categories).optional(), aestheticFilter: z.enum(lifestyles).optional(),
}).refine(v => Math.abs(Object.values(v.allocations).reduce((a,b) => a+b,0)-100) < 0.001, 'Allocations must total 100.')
export type RetrievalRequest = z.infer<typeof retrievalRequest>
export const identityReview = z.strictObject({ sourceId: key, canonicalBrandId: key, brandName: text, evidence: publicPage, reviewer: text })
export const readerReview = z.strictObject({ versionId, sourceId: key, alt: text, attribution: text, sourcePage: publicPage, licensingEvidence: publicPage, reviewer: text })
