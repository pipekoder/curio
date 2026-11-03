// @vitest-environment node
import {DatabaseSync} from 'node:sqlite'
import {afterEach,expect,it,vi} from 'vitest'
import {InferenceBudget} from '../worker/budget'
import {resolveDemoTestingPolicy} from '../worker/demo-testing-policy'
import {reserveInference,inferenceBudgetStatus} from '../worker/inference-budget'
import {issueDemoSession,demoIdentity} from '../worker/demo-access'
import app from '../worker/index'
import {publicBudgetDenial} from '../shared/budget-diagnostic'

const tester='a'.repeat(64),address='b'.repeat(64),testing={windowSeconds:900,windowUnits:12}
function budget(){
 const db=new DatabaseSync(':memory:')
 const state={storage:{sql:{exec:(sql:string,...args:(string|number)[])=>{const statement=db.prepare(sql);const rows=/^\s*SELECT\b/i.test(sql)?statement.all(...args):(statement.run(...args),[]);return {toArray:()=>rows}}},transactionSync:<T>(callback:()=>T)=>{db.exec('BEGIN');try{const result=callback();db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}}} as unknown as DurableObjectState
 const value=new InferenceBudget(state)
 const namespace={idFromName:()=>({}),get:()=>({fetch:(request:Request|string,init?:RequestInit)=>value.fetch(typeof request==='string'?new Request(request,init):request)})} as unknown as DurableObjectNamespace
 return {db,value,namespace}
}
const reserve=(value:InferenceBudget,extra:Record<string,unknown>={})=>value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip:address,ceiling:500,daily:160,demo:true,demoTester:tester,units:4,demoTestingPolicy:testing,...extra})}))
const finish=(value:InferenceBudget,id:string)=>value.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({id,outcome:'error'})}))
afterEach(()=>vi.useRealTimers())

it('accepts three four-unit reservations, denies the fourth, and renews only the fixed UTC window',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
 const {db,value}=budget()
 try{
  for(let i=0;i<3;i++){
   const result=await (await reserve(value)).json() as {allowed:boolean;reservationId:string}
   expect(result.allowed).toBe(true)
   await finish(value,result.reservationId)
  }
  const denied=await (await reserve(value)).json() as {allowed:boolean;denial:Parameters<typeof publicBudgetDenial>[0]}
  expect(denied).toMatchObject({allowed:false,denial:{limitType:'demo_testing_window',limit:12,used:12,remaining:0,requestedUnits:4,resetAt:'2026-11-01T08:15:00.000Z'}})
  expect(JSON.stringify(publicBudgetDenial(denied.denial))).not.toContain(tester)
  expect(JSON.stringify(denied)).not.toContain(address)
  const status=async()=>await (await value.fetch(new Request('https://budget/status',{method:'POST',body:JSON.stringify({ip:address,ceiling:500,daily:160,demo:true,demoTester:tester,demoTestingPolicy:testing})}))).json() as {lifetime:{used:number};day:{used:number};demoTestingWindow:{used:number;remaining:number;canReserveFourUnits:boolean;blockingLimitType:string|null;resetAt:string}}
  expect(await status()).toMatchObject({lifetime:{used:12},day:{used:12},demoTestingWindow:{used:12,remaining:0,canReserveFourUnits:false,blockingLimitType:'demo_testing_window',resetAt:'2026-11-01T08:15:00.000Z'}})
  vi.advanceTimersByTime(900000)
  expect(await status()).toMatchObject({lifetime:{used:12},day:{used:12},demoTestingWindow:{used:0,remaining:12,canReserveFourUnits:true}})
  expect(await (await reserve(value)).json()).toMatchObject({allowed:true})
  expect(await status()).toMatchObject({lifetime:{used:16},day:{used:16}})
 }finally{db.close()}
})

it('keeps atomic two-lease concurrency and shared daily/lifetime caps authoritative',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
 const {db,value}=budget()
 try{
  const [a,b,c]=await Promise.all([reserve(value),reserve(value),reserve(value)])
  const results=await Promise.all([a,b,c].map(row=>row.json())) as {allowed:boolean;reservationId?:string;denial?:{limitType:string}}[]
  expect(results.filter(row=>row.allowed)).toHaveLength(2)
  expect(results.find(row=>!row.allowed)?.denial?.limitType).toBe('demo_tester_concurrency')
  await finish(value,results[0].reservationId!)
  await finish(value,results[1].reservationId!)
  db.prepare('UPDATE counters SET count=158 WHERE key=?').run(`day:${Math.floor(Date.now()/86400000)}`)
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false,denial:{limitType:'global_daily'}})
  db.prepare('UPDATE counters SET count=498 WHERE key=?').run('lifetime')
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false,denial:{limitType:'global_lifetime'}})
 }finally{db.close()}
})

it('rejects unsafe toggle and window values, preserving defaults when unset',()=>{
 expect(resolveDemoTestingPolicy({} as never)).toBe(null)
 expect(resolveDemoTestingPolicy({DEMO_TESTING_MODE:'false'} as never)).toBe(null)
 expect(resolveDemoTestingPolicy({DEMO_TESTING_MODE:'true'} as never)).toEqual(testing)
 expect(resolveDemoTestingPolicy({DEMO_TESTING_MODE:'true',DEMO_TESTING_WINDOW_SECONDS:'1800',DEMO_TESTING_WINDOW_UNITS:'24'} as never)).toEqual({windowSeconds:1800,windowUnits:24})
 for(const config of [{DEMO_TESTING_MODE:'yes'},{DEMO_TESTING_WINDOW_SECONDS:'0'},{DEMO_TESTING_WINDOW_SECONDS:'3601'},{DEMO_TESTING_WINDOW_UNITS:'25'},{DEMO_TESTING_WINDOW_UNITS:'5'}])expect(()=>resolveDemoTestingPolicy(config as never)).toThrow()
})

it('requires an authenticated Demo session and does not make anonymous, SAM or preparation requests special',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
 const {db,value,namespace}=budget()
 try{
  const env={DEMO_TESTING_MODE:'true',EDITORIAL_DEMO_BUDGET_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',RATE_LIMIT_SALT:'test-only-32-byte-or-longer-rate-limit-secret',INFERENCE_BUDGET:namespace,CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:'operator-test-token-at-least-32-bytes',PUBLIC_APP_ORIGIN:'https://curio.test',EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true'}
  const session=await issueDemoSession(new Request('https://curio.test/api/editorial/demo-session',{method:'POST',headers:{Origin:'https://curio.test','CF-Connecting-IP':'192.0.2.1',Authorization:`Bearer ${env.CATALOG_OPERATOR_TOKEN}`}}),env)
  expect(session.status).toBe(200)
  const cookie=session.headers.get('Set-Cookie')!.split(';')[0]
  const request=new Request('https://curio.test/api/editorial',{headers:{Cookie:cookie}})
  expect(await demoIdentity(request,env,'192.0.2.1')).toBe('owner')
  const anonymous=await reserveInference(env as never,'192.0.2.2',4)
  expect(anonymous.allowed).toBe(true)
  const denied=await reserveInference(env as never,'192.0.2.2',4)
  expect(denied.denial?.limitType).toBe('per_ip_hourly')
  const testerReservation=await reserveInference(env as never,'192.0.2.1',4,undefined,false,'owner')
  expect(testerReservation.allowed).toBe(true)
  expect(await reserveInference(env as never,'192.0.2.3',1,'asset-one')).toMatchObject({allowed:true})
  expect((await reserveInference(env as never,'192.0.2.4',1,undefined,false,null,true)).allowed).toBe(true)
  expect((await reserveInference(env as never,'192.0.2.5',1,'asset-one')).denial?.limitType).toBe('sam_once_per_asset')
  expect((await value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip:address,ceiling:500,daily:160,demo:true,units:4,demoTestingPolicy:testing})}))).status).toBe(400)
 }finally{db.close()}
})

it('operator status shows the authenticated window without private counter keys and survives toggle off/on',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
 const {db,value,namespace}=budget()
 try{
  const env={DEMO_TESTING_MODE:'true',EDITORIAL_DEMO_BUDGET_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',RATE_LIMIT_SALT:'test-only-32-byte-or-longer-rate-limit-secret',INFERENCE_BUDGET:namespace,CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:'operator-test-token-at-least-32-bytes',PUBLIC_APP_ORIGIN:'https://curio.test',CATALOG_DB:{} as D1Database}
  const headers={Origin:'https://curio.test','CF-Connecting-IP':'192.0.2.1',Authorization:`Bearer ${env.CATALOG_OPERATOR_TOKEN}`}
  const session=await issueDemoSession(new Request('https://curio.test/api/editorial/demo-session',{method:'POST',headers}),env)
  const cookie=session.headers.get('Set-Cookie')!.split(';')[0]
  const path='https://curio.test/api/operator/catalog/intelligence/budget/status'
  const get=(settings:typeof env)=>app.request(path,{headers:{...headers,Cookie:cookie}},settings)
  expect((await app.request(path,{headers:{...headers,Authorization:'Bearer invalid'}},env)).status).toBe(403)
  expect(await (await get(env)).json()).toMatchObject({demoTesting:{enabled:true,authenticated:true,active:true},demoTestingWindow:{limit:12,used:0,remaining:12,canReserveFourUnits:true,resetAt:'2026-11-01T08:15:00.000Z'}})
  const charged=await reserveInference(env as never,'192.0.2.1',4,undefined,false,'owner')
  expect(charged.allowed).toBe(true)
  await finish(value,charged.reservationId!)
  const disabled={...env,DEMO_TESTING_MODE:'false'}
  expect(await (await get(disabled)).json()).toMatchObject({demoTesting:{enabled:false,authenticated:true,active:false},lifetime:{used:4}})
  const ordinary=await reserveInference(disabled as never,'192.0.2.1',4,undefined,false,'owner')
  expect(ordinary.allowed).toBe(true)
  await finish(value,ordinary.reservationId!)
  const active=await (await get(env)).json() as Record<string,unknown>
  expect(active).toMatchObject({demoTestingWindow:{used:4,remaining:8},lifetime:{used:8}})
  expect(JSON.stringify(active)).not.toContain('192.0.2.1')
  expect(JSON.stringify(active)).not.toContain(tester)
  expect((await inferenceBudgetStatus(env as never,new Request(path,{headers:{...headers,Cookie:cookie}}))).demoTesting).toMatchObject({active:true})
 }finally{db.close()}
})
