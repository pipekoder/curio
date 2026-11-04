import type { Bindings } from './index'
import {z} from 'zod'
import { demoCapsValid,demoPolicyEnabled,demoIdentity } from './demo-access'
import {resolveArticlePreparationPolicy} from './article-preparation-policy'
import {budgetDenial,publicBudgetDenial,resolveRatePolicy,type BudgetDenial} from './budget-policy'
import {resolveDemoTestingPolicy} from './demo-testing-policy'

export class InferenceReservation{
  private remaining:number
  public totalUnits:number
  constructor(public readonly reservedUnits:number){this.remaining=reservedUnits;this.totalUnits=reservedUnits}
  claim(){if(this.remaining<1)return false;this.remaining--;return true}
  // Retry top-ups extend a live reservation after the Durable Object
  // charges them. The local counter never exceeds charged units.
  addUnits(units:number){this.remaining+=units;this.totalUnits+=units}
  get unusedUnits(){return this.remaining}
}

// Maximum actual Meta invocations per article job, including retries.
// Normal 3-story flow uses 4; retries top up toward this ceiling.
export const ARTICLE_JOB_MAX_INVOCATIONS=30

function budgetLimits(env:Bindings,demo:boolean){
  const ceiling=Number(demo?env.EDITORIAL_DEMO_LIFETIME_UNITS:env.MAGAZINE_MAX_CALLS??'20')
  const daily=Number(demo?env.EDITORIAL_DEMO_DAILY_UNITS:env.INFERENCE_DAILY_MAX_UNITS??'20')
  if(!Number.isInteger(ceiling)||ceiling<1||ceiling>(demo?10000:100)||!Number.isInteger(daily)||daily<1||daily>(demo?2000:100))throw Error('Invalid budget limits')
  return {ceiling,daily}
}

// Shared namespace/name and unchanged ceilings for magazine and Decoder calls.
// Multi-model operations reserve every possible call atomically, never refund.
export type ArticleJobUnits={jobKey:string;topUp?:boolean}
export async function reserveInference(env: Bindings, ip: string, units: 1 | 2 | 3 | 4 | 5 = 1, samAssetId?: string,editorialPilot=false,demoTester:string|null=null,articlePreparation=false,jobUnits?:ArticleJobUnits) {
  if (!env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length < 32 || !env.INFERENCE_BUDGET) throw new Error('Budget unavailable')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RATE_LIMIT_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  const hash = Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('')
  if(env.EDITORIAL_DEMO_BUDGET_ENABLED==='true'&&!demoPolicyEnabled(env))throw new Error('Demo budget unavailable')
  const demo=demoPolicyEnabled(env)
  const testing=resolveDemoTestingPolicy(env)
  const {ceiling,daily}=budgetLimits(env,demo)
  const stub = env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  if(editorialPilot&&(units!==4||!env.EDITORIAL_REVIEW_PILOT_TOKEN||env.EDITORIAL_REVIEW_PILOT_TOKEN.length<32))throw new Error('Pilot unavailable')
  if(articlePreparation&&(units!==1||samAssetId||editorialPilot||env.EDITORIAL_ARTICLE_PREPARATION_ENABLED!=='true'))throw new Error('Article preparation unavailable')
  if(jobUnits&&(samAssetId||editorialPilot||articlePreparation||(jobUnits.topUp&&units!==1)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,89}$/.test(jobUnits.jobKey)))throw new Error('Article job units unavailable')
  const preparationPolicy=articlePreparation?resolveArticlePreparationPolicy(env):null
  const rates=resolveRatePolicy(env)
  const articleV3=units===5&&env.EDITORIAL_WORKFLOW_V3_ENABLED==='true'&&!samAssetId&&!editorialPilot&&!articlePreparation
  if(units===5&&!articleV3)throw Error('Article V3 budget unavailable')
  if(articleV3)rates.reviewedHourlyUnits=Math.max(5,rates.reviewedHourlyUnits)
  const testerHash=demo&&demoTester?await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`demo-tester:${demoTester}`)):null
  const testerKey=testerHash?Array.from(new Uint8Array(testerHash),value=>value.toString(16).padStart(2,'0')).join(''):null
  const testingActive=Boolean(testing&&demo&&testerKey&&(units===4||articleV3||jobUnits)&&!samAssetId&&!articlePreparation)
  const response = await stub.fetch('https://budget/reserve', { method: 'POST', body: JSON.stringify({ ip: hash, ceiling, daily, demo, rates, ...(testerKey&&(units===4||articleV3||jobUnits)?{demoTester:testerKey}:{}), ...(testingActive?{demoTestingPolicy:testing}:{}), ...(units > 1 ? { units } : {}),...(articleV3?{articleV3:true}:{}), ...(samAssetId ? { samAssetId } : {}),...(editorialPilot?{editorialPilot:true}:{}),...(preparationPolicy?{articlePreparation:true,articlePreparationPolicy:preparationPolicy}:{}),...(jobUnits?{jobUnits:{jobKey:jobUnits.jobKey,jobCap:ARTICLE_JOB_MAX_INVOCATIONS,...(jobUnits.topUp?{topUp:true}:{})}}:{}) }) })
  if (!response.ok) throw new Error('Budget unavailable')
  const result = await response.json() as { allowed?: boolean; retryAfter?: number; reservationId?: string;denial?:unknown }
  if (typeof result.allowed !== 'boolean') throw new Error('Invalid budget result')
  if(articlePreparation&&result.allowed&&!result.reservationId)throw Error('Preparation lease unavailable')
  const denial=result.allowed?null:budgetDenial.safeParse(result.denial)
  return { allowed: result.allowed, retryAfter: result.retryAfter || 60, ...(denial?.success?{denial:denial.data,publicDenial:publicBudgetDenial(denial.data)}:{}), ...(result.reservationId?{reservationId:result.reservationId}:{}) }
}

export async function finishInference(env:Bindings,id:string,outcome:'completed'|'fallback'|'error'){
  if(!env.INFERENCE_BUDGET)return
  const stub=env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  await stub.fetch('https://budget/finish',{method:'POST',body:JSON.stringify({id,outcome})})
}

export async function inferenceBudgetStatus(env:Bindings,request?:Request){
  if(!env.INFERENCE_BUDGET)throw Error('Budget unavailable')
  if(env.EDITORIAL_DEMO_BUDGET_ENABLED==='true'&&!demoCapsValid(env))throw Error('Demo budget unavailable')
  const demo=env.EDITORIAL_DEMO_BUDGET_ENABLED==='true', {ceiling,daily}=budgetLimits(env,demo)
  const testing=resolveDemoTestingPolicy(env)
  const rates=resolveRatePolicy(env)
  if(env.EDITORIAL_WORKFLOW_V3_ENABLED==='true')rates.reviewedHourlyUnits=Math.max(5,rates.reviewedHourlyUnits)
  const preparationPolicy=env.EDITORIAL_ARTICLE_PREPARATION_ENABLED==='true'?resolveArticlePreparationPolicy(env):null
  const stub=env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  let ip:string|undefined,testerKey:string|undefined
  const rawIp=request?.headers.get('CF-Connecting-IP')
  if(rawIp&&rawIp.length<=64&&env.RATE_LIMIT_SALT&&env.RATE_LIMIT_SALT.length>=32){
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign'])
    const hex=(value:ArrayBuffer)=>Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('')
    ip=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(rawIp)))
    const tester=await demoIdentity(request!,env,rawIp)
    if(tester)testerKey=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`demo-tester:${tester}`)))
  }
  const testingActive=Boolean(testing&&demo&&testerKey)
  const response=await stub.fetch(new Request('https://budget/status',{method:'POST',body:JSON.stringify({ceiling,daily,demo,rates,...(ip?{ip}:{}),...(testerKey?{demoTester:testerKey}:{}),...(testingActive?{demoTestingPolicy:testing}:{}),...(preparationPolicy?{articlePreparationPolicy:preparationPolicy}:{})})}))
  if(!response.ok)throw Error('Budget status unavailable')
  return {...await response.json() as Record<string,unknown>,inferenceEnabled:env.MAGAZINE_AI_ENABLED==='true',demoActive:demoPolicyEnabled(env),demoTesting:{enabled:Boolean(testing),authenticated:Boolean(testerKey),active:testingActive,configuredWindow:testing},effectiveWorkerConfig:{lifetimeUnits:ceiling,dailyUnits:daily,rates,articlePreparationPolicy:preparationPolicy,demoTestingPolicy:testing}}
}
export async function resetDemoUsage(env:Bindings,request:Request){
  const testing=resolveDemoTestingPolicy(env)
  if(!testing)throw Error('Demo Testing Mode is inactive')
  const ip=request.headers.get('CF-Connecting-IP')
  if(!ip||ip.length>64||!env.INFERENCE_BUDGET||!env.RATE_LIMIT_SALT||env.RATE_LIMIT_SALT.length<32)throw Error('Demo reset unavailable')
  // Fail before mutating the DO if the effective quota configuration cannot
  // be read and validated for the confirmation response.
  await inferenceBudgetStatus(env,request)
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
  const tester=await demoIdentity(request,env,ip)
  const stub=env.INFERENCE_BUDGET.get(env.INFERENCE_BUDGET.idFromName('magazine-v1'))
  const response=await stub.fetch('https://budget/reset-demo',{method:'POST',body:JSON.stringify({ip:await hash(ip),...(tester?{demoTester:await hash(`demo-tester:${tester}`)}:{}),windowSeconds:testing.windowSeconds,articlePreparation:env.EDITORIAL_ARTICLE_PREPARATION_ENABLED==='true'})})
  if(!response.ok)throw Error('Demo reset unavailable')
  const result=await response.json() as {resetApplied?:boolean;operatorIpReset?:boolean;testerWindowReset?:boolean;articlePreparationReset?:boolean}
  if(result.resetApplied!==true)throw Error('Demo reset unavailable')
  const parsed=z.object({lifetime:z.object({remaining:z.number().int().nonnegative()}),day:z.object({remaining:z.number().int().nonnegative()})}).safeParse(await inferenceBudgetStatus(env,request))
  if(!parsed.success)throw Error('Budget status unavailable')
  return {resetApplied:true,operatorIpReset:result.operatorIpReset===true,testerWindowReset:result.testerWindowReset===true,articlePreparationReset:result.articlePreparationReset===true,globalLimitBlocking:parsed.data.lifetime.remaining<4?'global_lifetime':parsed.data.day.remaining<4?'global_daily':null}
}
export type {BudgetDenial}
