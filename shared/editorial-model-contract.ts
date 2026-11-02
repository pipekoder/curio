// Additive public contract. Older saved editions and deterministic fallbacks
// may omit generation entirely; callers must check source before displaying it.
export type EditorialMode = 'lite' | 'hybrid'
export type EditorialGenerationMetadata = {
  version: 'curio-editorial-model-routing-v1'
  editorialMode: EditorialMode
  chiefEditorModel: 'muse-spark-1.3' | 'muse-wonder-1.0'
  reviewerModel: 'muse-spark-1.3'
  revisionModel: 'muse-spark-1.3' | null
  confirmationModel: 'muse-spark-1.3' | null
}
export type EditorialModelCapabilities = {
  version: EditorialGenerationMetadata['version']
  defaultMode: 'lite'
  liteAvailable: boolean
  hybridAvailable: boolean
  modes: {id: EditorialMode; label: string; description: string}[]
}
