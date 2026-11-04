import {z} from 'zod'

// Durable per-stage checkpoints for 3-story generation resume. A checkpoint
// stores a validated, completed stage result; a later request for the same
// job adopts it instead of re-running inference. Values are re-validated
// against a fresh pool on load: a checkpoint that no longer validates is
// discarded and its stage re-runs, never published as-is.
export const CHECKPOINT_WORKFLOW_VERSION=1
export const checkpointStage=z.enum(['chief','review','revision','confirmation'])
export type CheckpointStage=z.infer<typeof checkpointStage>
export const checkpointPayload=z.strictObject({edition:z.unknown(),review:z.unknown().optional(),confirmation:z.unknown().optional()})
export type CheckpointPayload=z.infer<typeof checkpointPayload>
export const articleCheckpoint=z.strictObject({
  version:z.literal(CHECKPOINT_WORKFLOW_VERSION),
  jobId:z.string().min(1).max(120),
  inputDigest:z.string().length(64),
  evidenceDigest:z.string().min(1).max(256),
  stage:checkpointStage,
  articleCount:z.literal(3),
  value:checkpointPayload,
  model:z.string().min(1).max(60),
  invocationId:z.string().min(1).max(80),
  startedAt:z.number().int().min(0),
  endedAt:z.number().int().min(0),
  usage:z.strictObject({inputTokens:z.number().int().min(0),outputTokens:z.number().int().min(0)}).nullable(),
})
export type ArticleCheckpoint=z.infer<typeof articleCheckpoint>
