import { editorialV2Instruction, editorialV2Vocabulary, evaluateEditorialV2 } from '../shared/editorial-v2'
import type { VisualContext } from '../shared/visual-observations'
// Same single provider request and existing accounting/timeout path. No extra AI call.
export async function editorialQualityFetch(url: string, init: RequestInit) {
  const body = JSON.parse(String(init.body))
  const input = JSON.parse(body.messages[1].content)
  const previous = body.messages[0].content as string
  body.messages[0].content = `${editorialV2Instruction} ${previous.slice(previous.indexOf('Respect zero category weights'))}`
  input.visualVocabulary = editorialV2Vocabulary
  body.messages[1].content = JSON.stringify(input)
  const response = await fetch(url, { ...init, body: JSON.stringify(body) })
  // Do not consume or replace the response: token accounting, validation diagnostics
  // and failed reservations remain owned by the established planner.
  return response
}
export function requireGroundedEditorial(raw: {qualityVersion?: number;title:string;deck:string;features:{assetId:string;headline:string;narrative:string;observationKeys?:string[];discoveryQuestion?:string}[];connections?:{thread:string}[]}, contexts: readonly VisualContext[]) {
  if (raw.qualityVersion === 2 && evaluateEditorialV2(raw, contexts)) throw Error('Ungrounded editorial quality output')
}
