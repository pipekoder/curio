import type { Bindings } from './index'
import { demoCapsValid,demoPolicyEnabled } from './demo-access'

export class InferenceReservation{
  private remaining:number
  constructor(public readonly reservedUnits:number){this.remaining=reservedUnits}
  claim(){if(this.remaining<1)return false;this.remaining--;return true}
  get unusedUnits(){return this.remaining}
}

function budgetLimits(env:Bindings,demo:boolean){
  const ceiling=Number(demo?env.EDITORIAL_DEMO_LIFETIME_UNITS:env.MAGAZINE_MAX_CALLS??'20')
  const daily=Number(demo?env.EDITORIAL_DEMO_DAILY_UNITS:env.INFERENCE_DAILY_MAX_UNITS??'20')
  if(!Number.isInteger(ceiling)||ceiling<1||ceiling>(demo?500:100)||!Number.isInteger(daily)||daily<1||daily>(demo?160:100))throw Error('Invalid budget limits')
  return {ceiling,daily}
}

// Shared namespace/name and unchanged ceilings for magazine and Decoder calls.
// Multi-model operations reserve every possible call atomically, never refund.
export async function reserveInference(env: Bindings, ip: string, units: 1 | 2 | 3 | 4 = 1, samAssetId?: string,editorialPilot=false,demoTester:string|null=null) {
  if (!env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length < 32 || !env.INFERENCE_BUDGET) throw new Error('Budget unavailable')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RATE_LIMIT_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  const hash = Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('')
  if(env.EDITORIAL_DEMO_BUDGET_ENABLED==='true'&&!demoPolicyEnabled(env))throw new Error('Demo budget unavailable')
  const demo=demoPolicyEnabled(env)
  const {ceiling,daily}=budgetLimits(env,demo)
  const stub = env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  if(editorialPilot&&(units!==4||!env.EDITORIAL_REVIEW_PILOT_TOKEN||env.EDITORIAL_REVIEW_PILOT_TOKEN.length<32))throw new Error('Pilot unavailable')
  const testerHash=demo&&demoTester?await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`demo-tester:${demoTester}`)):null
  const testerKey=testerHash?Array.from(new Uint8Array(testerHash),value=>value.toString(16).padStart(2,'0')).join(''):null
  const response = await stub.fetch('https://budget/reserve', { method: 'POST', body: JSON.stringify({ ip: hash, ceiling, daily, demo, ...(testerKey&&units===4?{demoTester:testerKey}:{}), ...(units > 1 ? { units } : {}), ...(samAssetId ? { samAssetId } : {}),...(editorialPilot?{editorialPilot:true}:{}) }) })
  if (!response.ok) throw new Error('Budget unavailable')
  const result = await response.json() as { allowed?: boolean; retryAfter?: number; reservationId?: string }
  if (typeof result.allowed !== 'boolean') throw new Error('Invalid budget result')
  return { allowed: result.allowed, retryAfter: result.retryAfter || 60, ...(result.reservationId?{reservationId:result.reservationId}:{}) }
}

export async function finishInference(env:Bindings,id:string,outcome:'completed'|'fallback'|'error'){
  if(!env.INFERENCE_BUDGET)return
  const stub=env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  await stub.fetch('https://budget/finish',{method:'POST',body:JSON.stringify({id,outcome})})
}

export async function inferenceBudgetStatus(env:Bindings){
  if(!env.INFERENCE_BUDGET)throw Error('Budget unavailable')
  if(env.EDITORIAL_DEMO_BUDGET_ENABLED==='true'&&!demoCapsValid(env))throw Error('Demo budget unavailable')
  const demo=env.EDITORIAL_DEMO_BUDGET_ENABLED==='true', {ceiling,daily}=budgetLimits(env,demo)
  const stub=env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  const response=await stub.fetch(`https://budget/status?ceiling=${ceiling}&daily=${daily}&demo=${demo}`)
  if(!response.ok)throw Error('Budget status unavailable')
  return {...await response.json() as Record<string,unknown>,inferenceEnabled:env.MAGAZINE_AI_ENABLED==='true',demoActive:demoPolicyEnabled(env)}
}
