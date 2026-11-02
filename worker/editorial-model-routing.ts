import { z } from 'zod'

export const EDITORIAL_MODEL_ROUTING_VERSION = 'curio-editorial-model-routing-v1'
export const editorialModeSchema = z.enum(['lite', 'hybrid'])
export type EditorialMode = z.infer<typeof editorialModeSchema>

// The caller chooses a mode, never a provider model or inference parameters.
const chiefModels = {
  lite: { model: 'muse-spark-1.3', max_completion_tokens: 2200, reasoning_effort: 'minimal', timeoutMs: 15000 },
  hybrid: { model: 'muse-wonder-1.0', max_completion_tokens: 2200, reasoning_effort: 'minimal', timeoutMs: 15000 },
} as const

export function chiefModel(mode: EditorialMode) { return chiefModels[mode] }

type HybridEnvironment = {
  EDITORIAL_HYBRID_ENABLED?: string
  EDITORIAL_WONDER_PROVIDER_VERIFIED?: string
  META_WONDER_MODEL?: string
  MAGAZINE_AI_ENABLED?: string
  EDITORIAL_REVIEW_ENABLED?: string
  EDITORIAL_PUBLIC_AI_ENABLED?: string
}
export function hybridConfigured(env: HybridEnvironment) {
  return env.EDITORIAL_HYBRID_ENABLED === 'true' &&
    env.EDITORIAL_WONDER_PROVIDER_VERIFIED === 'true' &&
    env.META_WONDER_MODEL === chiefModels.hybrid.model &&
    env.MAGAZINE_AI_ENABLED === 'true' &&
    env.EDITORIAL_REVIEW_ENABLED === 'true'
}
export function hybridAvailable(env: HybridEnvironment) {
  return hybridConfigured(env) && env.EDITORIAL_PUBLIC_AI_ENABLED === 'true'
}

export function generationMetadata(mode: EditorialMode,revised=false) {
  return {
    version: EDITORIAL_MODEL_ROUTING_VERSION,
    editorialMode: mode,
    chiefEditorModel: chiefModels[mode].model,
    reviewerModel: 'muse-spark-1.3',
    revisionModel: revised?'muse-spark-1.3':null,
    confirmationModel: revised?'muse-spark-1.3':null,
  }
}
