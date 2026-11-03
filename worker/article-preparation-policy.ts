import {z} from 'zod'
import type {Bindings} from './index'

// These bounds keep Dashboard tuning within the already reviewed preparation
// policy. The shared daily/lifetime budget remains a separate, stricter gate.
export const articlePreparationPolicy=z.strictObject({
  maxPerHour:z.number().int().min(1).max(48),
  maxPerDay:z.number().int().min(1).max(100),
  windowLimit:z.number().int().min(1).max(4),
  windowSeconds:z.number().int().min(16).max(60),
  concurrency:z.number().int().min(1).max(4),
}).refine(p=>p.maxPerDay>=p.maxPerHour&&p.maxPerHour>=p.windowLimit&&p.windowLimit>=p.concurrency)
export type ArticlePreparationPolicy=z.infer<typeof articlePreparationPolicy>

const integer=(value:string|undefined,fallback:number)=>{
  if(value===undefined)return fallback
  if(!/^[1-9][0-9]*$/.test(value))throw Error('Invalid article preparation configuration')
  return Number(value)
}

export function resolveArticlePreparationPolicy(env:Bindings):ArticlePreparationPolicy{
  const result=articlePreparationPolicy.safeParse({
    maxPerHour:integer(env.ARTICLE_PREP_MAX_PER_HOUR,16),
    maxPerDay:integer(env.ARTICLE_PREP_MAX_PER_DAY,24),
    windowLimit:integer(env.ARTICLE_PREP_WINDOW_LIMIT,2),
    windowSeconds:integer(env.ARTICLE_PREP_WINDOW_SECONDS,16),
    concurrency:integer(env.ARTICLE_PREP_CONCURRENCY,2),
  })
  if(!result.success)throw Error('Invalid article preparation configuration')
  return result.data
}
