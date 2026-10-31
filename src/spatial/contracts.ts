import {z} from 'zod'

// Joint Muse/Codex contract, frontend-owned copy (see implementation plan R1).
// Target: GET /api/catalog/nodes. MVP fallback: nodes.manifest.json (same shape).
// Codex mirrors this schema server-side; any drift breaks the catalog test.
export const catalogNode=z.strictObject({
  assetId:z.string().min(1).max(100),
  kind:z.enum(['exhibit','story']),
  label:z.string().min(1).max(60),
  thumbnail:z.string().max(200).refine(path=>path.startsWith('/'),{message:'Same-origin thumbnail path required.'}),
  edgeHints:z.array(z.string().min(1).max(100)).max(12).optional(),
})
export type CatalogNode=z.infer<typeof catalogNode>
export const catalogNodesResponse=z.array(catalogNode).max(500)
export type CatalogNodesResponse=z.infer<typeof catalogNodesResponse>

// Session-only visit state. Never persisted beyond the tab; Clear wipes it.
export const spatialSession=z.strictObject({
  version:z.literal(1),
  prompt:z.string().max(1000),
  startedAt:z.number(),
})
export type SpatialSession=z.infer<typeof spatialSession>
