import {z} from 'zod'
import {isSafeHttpsUrl} from '../../shared/url-policy'

// Joint Muse/Codex contract, frontend-owned copy (see SILVER_FIELD_BACKEND_INTEGRATION).
// Journey source: GET /api/catalog/published (Codex-owned). Fallback:
// nodes.manifest.json (same shape). Any drift breaks the catalog test.
const thumbnail=z.string().max(2048).refine(
  value=>value===''||value.startsWith('/')||isSafeHttpsUrl(value),
  {message:'Thumbnail must be empty, a same-origin path, or a safe HTTPS URL.'},
)
export const catalogNode=z.strictObject({
  assetId:z.string().min(1).max(100),
  kind:z.enum(['exhibit','story']),
  label:z.string().min(1).max(60),
  thumbnail,
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
