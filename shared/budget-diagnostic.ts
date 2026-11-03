import {z} from 'zod'

export const budgetLimitType=z.enum([
  'global_lifetime','global_daily','per_ip_hourly','per_ip_cooldown',
  'demo_tester_hourly','demo_tester_daily','demo_tester_concurrency',
  'demo_testing_window',
  'article_preparation_hourly','article_preparation_daily','article_preparation_window','article_preparation_concurrency',
  'sam_once_per_asset',
])
export type BudgetLimitType=z.infer<typeof budgetLimitType>
export const budgetDenial=z.strictObject({
  limitType:budgetLimitType,limit:z.number().int().nonnegative(),used:z.number().int().nonnegative(),
  remaining:z.number().int().nonnegative(),requestedUnits:z.number().int().min(1).max(4),
  measure:z.enum(['units','requests','concurrent']),retryAfterSeconds:z.number().int().min(1).max(86400).optional(),
  resetAt:z.string().datetime().optional(),
})
export type BudgetDenial=z.infer<typeof budgetDenial>

// Global usage belongs to all visitors, so public responses disclose only
// exhaustion and timing, never the aggregate counter or allowance.
export function publicBudgetDenial(denial:BudgetDenial){
  if(denial.limitType==='global_lifetime'||denial.limitType==='global_daily'){
    const {limitType,requestedUnits,retryAfterSeconds,resetAt}=denial
    return {limitType,remaining:Math.floor(denial.remaining/denial.requestedUnits),requestedUnits,measure:'requests' as const,...(retryAfterSeconds?{retryAfterSeconds}:{}),...(resetAt?{resetAt}:{})}
  }
  return denial
}

export const publicBudgetDiagnostic=z.object({limitType:budgetLimitType,limit:z.number().int().nonnegative().optional(),used:z.number().int().nonnegative().optional(),remaining:z.number().int().nonnegative(),requestedUnits:z.number().int().min(1).max(4),measure:z.enum(['units','requests','concurrent']),retryAfterSeconds:z.number().int().min(1).max(86400).optional(),resetAt:z.string().datetime().optional()})
export type PublicBudgetDiagnostic=z.infer<typeof publicBudgetDiagnostic>
const labels:Record<BudgetLimitType,string>={
  global_lifetime:'shared lifetime inference budget',global_daily:'shared daily inference budget',
  per_ip_hourly:'your hourly inference allowance',per_ip_cooldown:'your request cooldown',
  demo_tester_hourly:'your tester hourly allowance',demo_tester_daily:'your tester daily allowance',demo_tester_concurrency:'your concurrent tester request limit',
  demo_testing_window:'your Demo Testing window',
  article_preparation_hourly:'your hourly image-preparation allowance',article_preparation_daily:'your daily image-preparation allowance',article_preparation_window:'your image-preparation request window',article_preparation_concurrency:'the shared image-preparation concurrency limit',
  sam_once_per_asset:'the one-time object-analysis limit for this image',
}
export function budgetExplanation(value:PublicBudgetDiagnostic):string{
  const unit=value.measure==='units'?'inference units':value.measure==='requests'?'requests':'active requests'
  const allowance=value.limit===undefined?'':` The allowance is ${value.limit} ${unit}; ${value.remaining} remain.`
  const when=value.resetAt?` Try again after ${new Date(value.resetAt).toLocaleString()}.`:value.retryAfterSeconds?` Try again in about ${value.retryAfterSeconds} seconds.`:''
  return `Curio reached ${labels[value.limitType]}.${allowance}${when}`
}
