import type {Bindings} from './index'

export const ARTICLE_CHIEF_TIMEOUT_DEFAULT_MS=60_000
export const ARTICLE_REVIEW_TIMEOUT_DEFAULT_MS=30_000
export const ARTICLE_REVIEW_STEP_TIMEOUT_MS=20_000
export const ARTICLE_WORKFLOW_TIMEOUT_MS=150_000

export function articleChiefTimeoutMs(env:Bindings){
  const raw=env.ARTICLE_CHIEF_TIMEOUT_MS
  if(raw===undefined)return ARTICLE_CHIEF_TIMEOUT_DEFAULT_MS
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid Article Chief Editor timeout')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<20_000||value>60_000)throw Error('Invalid Article Chief Editor timeout')
  return value
}

export function articleReviewTimeoutMs(env:Bindings){
  const raw=env.ARTICLE_REVIEW_TIMEOUT_MS
  if(raw===undefined)return ARTICLE_REVIEW_TIMEOUT_DEFAULT_MS
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid Article Reviewer timeout')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<20_000||value>40_000)throw Error('Invalid Article Reviewer timeout')
  return value
}
