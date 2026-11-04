import {z} from 'zod'

// Backend-observed Meta model invocations during article generation. Every
// entry is recorded by the server around a real inference call: the model
// ID actually invoked, the workflow stage that invoked it, measured
// timestamps and a short summary derived only from the returned structured
// data. Entries never contain prompts, interests, keys or prose dumps.
export const modelCallStage=z.enum(['planning','chief_editor','reviewer','revision','confirmation'])
export type ModelCallStage=z.infer<typeof modelCallStage>
export const modelCallUsage=z.strictObject({inputTokens:z.number().int().min(0),outputTokens:z.number().int().min(0)})
export type ModelCallUsage=z.infer<typeof modelCallUsage>
export const modelCallEvent=z.strictObject({
  id:z.string().min(1).max(80),
  model:z.string().min(1).max(60),
  stage:modelCallStage,
  // 1-based attempt within the stage. Rows written before retries default
  // to the first attempt so upgrade never drops observed history.
  attempt:z.number().int().min(1).max(30).default(1),
  startedAt:z.number().int().min(0),
  endedAt:z.number().int().min(0).nullable(),
  status:z.enum(['calling','completed','failed']),
  summary:z.string().max(200).optional(),
  usage:modelCallUsage.optional(),
  timeoutType:z.enum(['stage','workflow']).optional(),
})
export type ModelCallEvent=z.infer<typeof modelCallEvent>
// One generation runs at most planning, chief, reviewer, revision and
// confirmation, with retries bounded by the job invocation cap. The array
// cap only bounds malformed payloads.
export const modelCallEvents=z.array(modelCallEvent).max(30)
// System lifecycle notices (retry scheduled, resume adopted) travel with
// the invocation log but render separately: they are never model calls.
export const jobNotice=z.strictObject({id:z.string().min(1).max(80),at:z.number().int().min(0),text:z.string().min(1).max(200)})
export type JobNotice=z.infer<typeof jobNotice>
export const jobNotices=z.array(jobNotice).max(12)
