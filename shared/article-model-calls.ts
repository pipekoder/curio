import {z} from 'zod'

// Backend-observed Meta model invocations during article generation. Every
// entry is recorded by the server around a real inference call: the model
// ID actually invoked, the workflow stage that invoked it, measured
// timestamps and a short summary derived only from the returned structured
// data. Entries never contain prompts, interests, keys or prose dumps.
export const modelCallStage=z.enum(['planning','chief_editor','reviewer','revision','confirmation'])
export type ModelCallStage=z.infer<typeof modelCallStage>
export const modelCallEvent=z.strictObject({
  id:z.string().min(1).max(80),
  model:z.string().min(1).max(60),
  stage:modelCallStage,
  startedAt:z.number().int().min(0),
  endedAt:z.number().int().min(0).nullable(),
  status:z.enum(['calling','completed','failed']),
  summary:z.string().max(200).optional(),
})
export type ModelCallEvent=z.infer<typeof modelCallEvent>
// One generation runs at most planning, chief, reviewer, revision and
// confirmation. The cap only bounds malformed payloads.
export const modelCallEvents=z.array(modelCallEvent).max(8)
