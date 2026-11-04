import type {Bindings} from './index'

export const ARTICLE_CHIEF_TIMEOUT_DEFAULT_MS=60_000
export const ARTICLE_REVIEW_TIMEOUT_DEFAULT_MS=30_000
export const ARTICLE_REVIEW_STEP_TIMEOUT_MS=20_000
export const ARTICLE_WORKFLOW_TIMEOUT_MS=150_000
// Success-first 3-story limits. Single Story keeps the values above
// untouched; only 3-story editions use the generous budgets below.
export const ARTICLE_3STORY_CHIEF_TIMEOUT_DEFAULT_MS=180_000
export const ARTICLE_3STORY_REVIEW_TIMEOUT_DEFAULT_MS=120_000
export const ARTICLE_3STORY_STEP_TIMEOUT_MS=100_000
export const ARTICLE_3STORY_WORKFLOW_TIMEOUT_DEFAULT_MS=750_000
export const ARTICLE_3STORY_LEASE_MS=900_000

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

export function article3StoryChiefTimeoutMs(env:Bindings){
  const raw=env.ARTICLE_3STORY_CHIEF_TIMEOUT_MS
  if(raw===undefined)return ARTICLE_3STORY_CHIEF_TIMEOUT_DEFAULT_MS
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid 3-story Chief Editor timeout')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<60_000||value>300_000)throw Error('Invalid 3-story Chief Editor timeout')
  return value
}

export function article3StoryReviewTimeoutMs(env:Bindings){
  const raw=env.ARTICLE_3STORY_REVIEW_TIMEOUT_MS
  if(raw===undefined)return ARTICLE_3STORY_REVIEW_TIMEOUT_DEFAULT_MS
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid 3-story Reviewer timeout')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<30_000||value>180_000)throw Error('Invalid 3-story Reviewer timeout')
  return value
}

export function article3StoryWorkflowTimeoutMs(env:Bindings){
  const raw=env.ARTICLE_3STORY_WORKFLOW_TIMEOUT_MS
  if(raw===undefined)return ARTICLE_3STORY_WORKFLOW_TIMEOUT_DEFAULT_MS
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid 3-story workflow timeout')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value<5_000||value>900_000)throw Error('Invalid 3-story workflow timeout')
  return value
}

export function articleRetryBackoffBaseMs(env:Bindings){
  const raw=env.ARTICLE_RETRY_BACKOFF_BASE_MS
  if(raw===undefined)return 500
  if(!/^[0-9]+$/.test(raw))throw Error('Invalid retry backoff base')
  const value=Number(raw)
  if(!Number.isSafeInteger(value)||value>10_000)throw Error('Invalid retry backoff base')
  return value
}
