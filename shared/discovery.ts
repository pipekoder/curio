import { z } from 'zod'
import { isSafeHttpsUrl } from './url-policy'
const id = z.string().regex(/^[a-z0-9-]{1,80}$/)
export const discoveryUrl = z.string().max(2048).refine(value => {
  try { const u = new URL(value); return !/(?:token|password|secret|session|authorization)=/i.test(u.hash) && isSafeHttpsUrl(value.split('#')[0]) && ![...u.searchParams.keys()].some(k => /^(token|access_token|password|secret|session|authorization|signature|sig|api_key|email|code)$/i.test(k)) } catch { return false }
})
const text = z.string().max(2000).nullable()
export const discoveredContent = z.strictObject({
  id, url: discoveryUrl, kind: z.enum(['source','gallery','collection','product','story','image','page']),
  title: text, description: text, text, attribution: text,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  image: z.strictObject({ url: discoveryUrl, variants: z.array(discoveryUrl).max(12), width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(), mime: z.string().max(100).nullable(), bytes: z.number().int().nonnegative().nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), alt: text, quality: z.number().min(0).max(1), access: z.enum(['unverified','reachable','inaccessible','policy_pending']), licenseEvidence:z.array(discoveryUrl).max(5).optional() }).nullable(),
  method: z.enum(['html','json_ld','json','rendered_dom','direct_image','web_connector']),
})
export type DiscoveredContent = z.infer<typeof discoveredContent>
export const discoveryManifest = z.strictObject({
  schemaVersion: z.literal(1), jobId: id, sourceId: id, startUrl: discoveryUrl, observedAt: z.iso.datetime(),
  status: z.enum(['complete','partial','blocked','cancelled']), stopReasons: z.array(z.string().regex(/^[a-z0-9_]{1,80}$/)).max(30),
  pages: z.array(z.strictObject({ url: discoveryUrl, depth: z.number().int().min(0).max(32), parent: discoveryUrl.nullable(), status: z.enum(['fetched','inaccessible']), httpStatus: z.number().int().min(100).max(599).nullable() })).max(50),
  nodes: z.array(discoveredContent).max(400),
  edges: z.array(z.strictObject({ from: id, to: id, relation: z.enum(['contains','links_to','illustrates','variant_of']) })).max(1200),
  metrics: z.strictObject({ requests: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative(), maxDepth: z.number().int().nonnegative(), dynamicInteractions: z.number().int().nonnegative() }),
  displayPermission: z.literal('pending_review'), analysisPermission: z.literal('pending_review'), editsPermission: z.literal('pending_review'),
})
export type DiscoveryManifest = z.infer<typeof discoveryManifest>
