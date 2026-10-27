import { z } from 'zod'
import { categories, lifestyles } from '../shared/catalog'
import { isSafeHttpsUrl } from '../shared/url-policy'

const text = z.string().trim().min(1).max(1000)
const metadataUrl = (value: string) => isSafeHttpsUrl(value.split('#')[0]) && !/[<>"'\\\s]/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
const url = z.string().max(2048).refine(metadataUrl, 'A public HTTPS metadata URL is required.')
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
const timestamp = z.iso.datetime({ offset: true })
const evidence = z.string().max(2048).refine(v => isSafeHttpsUrl(v) || /^docs\/[a-zA-Z0-9/_#.-]+$/.test(v))
export const sourceRecord = z.strictObject({ id: key, name: text, entryUrl: url,
  kind: z.enum(['gallery', 'individual_urls']), issueUrl: url })
export const candidateRecord = z.strictObject({ sourceId: key, imageUrl: z.string().max(2048).refine(isSafeHttpsUrl),
  versionKey: key, sourcePage: url.nullable(), retrievedAt: timestamp,
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  width: z.number().int().min(1).max(50000).nullable(), height: z.number().int().min(1).max(50000).nullable(),
  alt: text.nullable(), attribution: text.nullable(),
  sourceType: z.enum(['brand_candidate', 'synthetic_concept', 'editorial_support']),
  provenance: z.strictObject({ discoveredFrom: url, notes: text }),
}).refine(v => (v.width === null) === (v.height === null), 'Dimensions must be supplied together.')
export const importManifest = z.strictObject({ schemaVersion: z.literal(1),
  sources: z.array(sourceRecord).max(10), candidates: z.array(candidateRecord).max(5),
}).refine(v => v.sources.length + v.candidates.length > 0, 'Empty import.')
export type ImportManifest = z.infer<typeof importManifest>
export const permissionReview = z.strictObject({ purpose: z.enum(['display', 'ai_analysis', 'edits']),
  status: z.enum(['pending', 'approved', 'rejected', 'blocked']), evidence: evidence.nullable(),
  rightsHolder: text.nullable(), reviewer: text, expectedRevision: z.number().int().min(0),
}).refine(v => v.status !== 'approved' || v.evidence !== null && v.rightsHolder !== null, 'Approval requires evidence and rights holder.')
export const queryRequest = z.strictObject({ cursor: z.string().regex(/^asset-[a-f0-9]{64}$/).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  category: z.enum(categories).optional(), aesthetic: z.enum(lifestyles).optional(),
  permission: z.enum(['display', 'ai_analysis', 'edits']).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'blocked']).optional(),
  includeArchived: z.boolean().default(false),
}).refine(v => !v.status || v.permission, 'Status needs a permission purpose.')
export type CatalogQuery = z.infer<typeof queryRequest>
const scores = <T extends readonly [string, ...string[]]>(names: T) => z.record(z.enum(names), z.number().min(0).max(1))
// Strict JSON data only. These are interpretations, never factual brand identity.
export const intelligenceRecord = z.strictObject({ id: key, versionId: z.string().regex(/^version-[a-f0-9]{64}$/),
  model: z.literal('muse-spark-1.3'), origin: z.enum(['mock', 'meta']),
  output: z.strictObject({ categoryScores: scores(categories), aestheticScores: scores(lifestyles),
    tags: z.array(text).max(30), objects: z.array(text).max(20), mood: text, composition: text, editorialThemes: z.array(text).max(10) }),
})
export const factRecord = z.strictObject({ id: key, sourceId: key, versionId: z.string().regex(/^version-[a-f0-9]{64}$/).nullable(),
  statement: text, citationUrl: url, publisher: text, retrievedAt: timestamp,
  verifiedBy: text, verifiedAt: timestamp })
const box = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1) })
  .refine(v => v.x + v.width <= 1 && v.y + v.height <= 1)
export const regionRecord = z.strictObject({ id: key, versionId: z.string().regex(/^version-[a-f0-9]{64}$/),
  origin: z.enum(['authored_demo', 'sam_detection']), model: z.literal('sam-3.1').nullable(),
  width: z.number().int().positive().max(50000), height: z.number().int().positive().max(50000),
  regions: z.array(z.strictObject({ id: key, label: text, box, confidence: z.number().min(0).max(1).nullable() })).max(20),
}).refine(v => v.origin === 'sam_detection' ? v.model === 'sam-3.1' : v.model === null && v.regions.every(r => r.confidence === null))
  .refine(v => new Set(v.regions.map(r => r.id)).size === v.regions.length, 'Region IDs must be unique.')
export const annotationRequest = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('intelligence'), record: intelligenceRecord }),
  z.strictObject({ kind: z.literal('fact'), record: factRecord }),
  z.strictObject({ kind: z.literal('regions'), record: regionRecord }),
])
