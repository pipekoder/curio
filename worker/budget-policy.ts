import {z} from 'zod'
import type {Bindings} from './index'

// Defaults reproduce the deployed policy. Dashboard values are optional and
// bounded; the existing shared Durable Object counters are never reset.
export const ratePolicy=z.strictObject({
  standardHourlyUnits:z.number().int().min(1).max(12),
  reviewedHourlyUnits:z.number().int().min(4).max(8),
  pilotHourlyUnits:z.number().int().min(4).max(16),
  testerHourlyUnits:z.number().int().min(4).max(80),
  testerDailyUnits:z.number().int().min(4).max(160),
  cooldownSeconds:z.number().int().min(60).max(600),
  testerConcurrent:z.number().int().min(1).max(2),
}).refine(p=>p.testerDailyUnits>=p.testerHourlyUnits)
export type RatePolicy=z.infer<typeof ratePolicy>
export const DEFAULT_RATE_POLICY:RatePolicy={standardHourlyUnits:3,reviewedHourlyUnits:4,pilotHourlyUnits:8,testerHourlyUnits:40,testerDailyUnits:120,cooldownSeconds:60,testerConcurrent:2}
const integer=(raw:string|undefined,fallback:number)=>{
  if(raw===undefined)return fallback
  if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid inference rate configuration')
  return Number(raw)
}
export function resolveRatePolicy(env:Bindings):RatePolicy{
  const parsed=ratePolicy.safeParse({
    standardHourlyUnits:integer(env.INFERENCE_STANDARD_HOURLY_UNITS,3),
    reviewedHourlyUnits:integer(env.INFERENCE_REVIEWED_HOURLY_UNITS,4),
    pilotHourlyUnits:integer(env.INFERENCE_PILOT_HOURLY_UNITS,8),
    testerHourlyUnits:integer(env.INFERENCE_TESTER_HOURLY_UNITS,40),
    testerDailyUnits:integer(env.INFERENCE_TESTER_DAILY_UNITS,120),
    cooldownSeconds:integer(env.INFERENCE_COOLDOWN_SECONDS,60),
    testerConcurrent:integer(env.INFERENCE_TESTER_CONCURRENT,2),
  })
  if(!parsed.success)throw Error('Invalid inference rate configuration')
  return parsed.data
}

export {budgetLimitType,budgetDenial,publicBudgetDenial} from '../shared/budget-diagnostic'
export type {BudgetDenial,BudgetLimitType} from '../shared/budget-diagnostic'
