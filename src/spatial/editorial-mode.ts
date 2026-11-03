import {z} from 'zod'

// Read-only client for docs/editorial-dual-model-contract.md (backend PR
// #75): Lite (Spark) vs Hybrid (Wonder Chief Editor + Spark review). The
// capabilities lookup never infers; anything unexpected resolves to null so
// Hybrid stays disabled rather than pretended. The selected mode propagates
// to POST /api/editorial only when a capabilities read proves a contract
// backend — the current strict prompt shape would 400 an extra field.
export const MODEL_ROUTING_VERSION='curio-editorial-model-routing-v1'
export type EditorialMode='lite'|'hybrid'
export type EditorialCapabilities={hybridAvailable:boolean}

const capabilitiesResponse=z.object({
  version:z.literal(MODEL_ROUTING_VERSION),
  defaultMode:z.literal('lite'),
  liteAvailable:z.boolean(),
  hybridAvailable:z.boolean(),
})

export async function fetchCapabilities(fetchImpl:typeof fetch=fetch):Promise<EditorialCapabilities|null>{
  try{
    const response=await fetchImpl('/api/editorial/capabilities')
    if(!response.ok)return null
    const parsed=capabilitiesResponse.parse(await response.json())
    if(!parsed.liteAvailable)return null
    return {hybridAvailable:parsed.hybridAvailable}
  }catch{
    return null
  }
}

// Confirmed generation metadata on a reviewed Meta response. Render only
// when the edition source is meta — never claim a model ran for
// deterministic output.
const generationMetadata=z.object({
  version:z.literal(MODEL_ROUTING_VERSION),
  editorialMode:z.enum(['lite','hybrid']),
  revisionModel:z.string().nullable().optional(),
  confirmationModel:z.string().nullable().optional(),
})
export type GenerationMetadata=z.infer<typeof generationMetadata>

export function parseGenerationMetadata(raw:unknown):GenerationMetadata|null{
  try{
    return generationMetadata.parse(raw)
  }catch{
    return null
  }
}
