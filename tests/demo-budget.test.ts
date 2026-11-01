// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import {afterEach,expect,it,vi} from 'vitest'
import {InferenceBudget} from '../worker/budget'
import {demoIdentity,issueDemoSession} from '../worker/demo-access'
import app from '../worker/index'

function budget(){
  const db=new DatabaseSync(':memory:')
  const state={storage:{sql:{exec:(sql:string,...args:(string|number)[])=>{
    const statement=db.prepare(sql)
    const rows=/^\s*SELECT\b/i.test(sql)?statement.all(...args):(statement.run(...args),[])
    return {toArray:()=>rows}
  }},transactionSync:<T>(callback:()=>T)=>{db.exec('BEGIN');try{const value=callback();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}}}} as unknown as DurableObjectState
  return {db,value:new InferenceBudget(state)}
}
const ip=(n:number)=>n.toString(16).padStart(64,'0')
const tester='a'.repeat(64)
const reserve=(value:InferenceBudget,address:string,identity?:string)=>value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip:address,ceiling:500,daily:160,demo:true,units:4,...(identity?{demoTester:identity}:{})})}))
afterEach(()=>vi.useRealTimers())

it('keeps 4-unit charges, 10/hour and 30/day tester limits, and 160/day shared cap',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    for(let i=0;i<30;i++){
      const result=await (await reserve(value,ip(i+1),tester)).json() as {allowed:boolean;reservationId:string}
      expect(result.allowed).toBe(true)
      await value.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({id:result.reservationId,outcome:'completed'})}))
      if(i===9||i===19)vi.advanceTimersByTime(3600000)
    }
    expect(await (await reserve(value,ip(40),tester)).json()).toMatchObject({allowed:false})
    for(let i=0;i<10;i++){
      const result=await (await reserve(value,ip(i+50),'b'.repeat(64))).json() as {allowed:boolean;reservationId:string}
      expect(result.allowed).toBe(true)
      await value.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({id:result.reservationId,outcome:'completed'})}))
      if(i===9)expect(await (await reserve(value,ip(99),'c'.repeat(64))).json()).toMatchObject({allowed:false})
    }
    const status=await (await value.fetch(new Request('https://budget/status?ceiling=500&daily=160&demo=true'))).json() as {lifetime:{used:number;remaining:number};day:{used:number;remaining:number}}
    expect(status.lifetime).toMatchObject({used:160,remaining:340})
    expect(status.day).toMatchObject({used:160,remaining:0})
  }finally{db.close()}
})

it('limits concurrent tester leases to two, releases them, and retains charges after failure',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    const first=await (await reserve(value,ip(1),tester)).json() as {allowed:boolean;reservationId:string}
    const second=await (await reserve(value,ip(2),tester)).json() as {allowed:boolean;reservationId:string}
    expect(first.allowed&&second.allowed).toBe(true)
    expect(await (await reserve(value,ip(3),tester)).json()).toMatchObject({allowed:false})
    await value.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({id:first.reservationId,outcome:'error'})}))
    expect(await (await reserve(value,ip(3),tester)).json()).toMatchObject({allowed:true})
    const status=await (await value.fetch(new Request('https://budget/status?ceiling=500&daily=160&demo=true'))).json() as {lifetime:{used:number};recent:{outcome:string}[]}
    expect(status.lifetime.used).toBe(12)
    expect(status.recent.map(row=>row.outcome)).toContain('concurrency_denied')
  }finally{db.close()}
})

it('allows two authenticated requests from one IP in a 60-second window but no third',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    expect(await (await reserve(value,ip(1),tester)).json()).toMatchObject({allowed:true})
    expect(await (await reserve(value,ip(1),tester)).json()).toMatchObject({allowed:true})
    expect(await (await reserve(value,ip(1),tester)).json()).toMatchObject({allowed:false})
  }finally{db.close()}
})

it('keeps anonymous visitors to one reviewed reservation per hour and preserves old budget validation',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    expect(await (await reserve(value,ip(1))).json()).toMatchObject({allowed:true})
    vi.advanceTimersByTime(61000)
    expect(await (await reserve(value,ip(1))).json()).toMatchObject({allowed:false})
    expect((await value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip:ip(2),ceiling:500,units:4})}))).status).toBe(400)
  }finally{db.close()}
})

it('enforces 500 cumulative units without resetting prior charges',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    for(let i=0;i<125;i++){
      if(i>0&&i%40===0)vi.advanceTimersByTime(86400000)
      expect(await (await reserve(value,ip(i+1))).json()).toMatchObject({allowed:true})
    }
    expect(await (await reserve(value,ip(200))).json()).toMatchObject({allowed:false})
    const status=await (await value.fetch(new Request('https://budget/status?ceiling=500&daily=160&demo=true'))).json() as {lifetime:{used:number;remaining:number}}
    expect(status.lifetime).toMatchObject({used:500,remaining:0})
  }finally{db.close()}
})

it('carries existing lifetime and UTC-day counters into demo mode',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
  const {db,value}=budget()
  try{
    db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',16,0)
    db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run(`day:${Math.floor(Date.now()/86400000)}`,16,(Math.floor(Date.now()/86400000)+1)*86400000)
    expect(await (await reserve(value,ip(1),tester)).json()).toMatchObject({allowed:true})
    const status=await (await value.fetch(new Request('https://budget/status?ceiling=500&daily=160&demo=true'))).json() as {lifetime:{used:number};day:{used:number}}
    expect(status.lifetime.used).toBe(20)
    expect(status.day.used).toBe(20)
  }finally{db.close()}
})

it('issues an IP-bound HttpOnly session only for the configured operator and rejects tampering',async()=>{
  const env={EDITORIAL_DEMO_BUDGET_ENABLED:'true',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',INFERENCE_BUDGET:{} as DurableObjectNamespace,RATE_LIMIT_SALT:'test-only-32-byte-or-longer-rate-limit-secret',CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:'operator-test-token-at-least-32-bytes',PUBLIC_APP_ORIGIN:'https://curio.test'}
  const request=(token:string)=>new Request('https://curio.test/api/editorial/demo-session',{method:'POST',headers:{Origin:'https://curio.test','CF-Connecting-IP':'192.0.2.1',Authorization:`Bearer ${token}`}})
  expect((await issueDemoSession(request('wrong-token-at-least-32-characters'),env)).status).toBe(403)
  const response=await issueDemoSession(request(env.CATALOG_OPERATOR_TOKEN),env)
  expect(response.status).toBe(200)
  const cookie=response.headers.get('Set-Cookie')!
  expect(cookie).toContain('HttpOnly; SameSite=Strict')
  expect(cookie).not.toContain(env.CATALOG_OPERATOR_TOKEN)
  const value=cookie.split(';')[0]
  expect(await demoIdentity(new Request('https://curio.test/api/editorial',{headers:{Cookie:value}}),env,'192.0.2.1')).toBe('owner')
  expect(await demoIdentity(new Request('https://curio.test/api/editorial',{headers:{Cookie:value}}),env,'192.0.2.2')).toBe(null)
  expect(await demoIdentity(new Request('https://curio.test/api/editorial',{headers:{Cookie:value+'x'}}),env,'192.0.2.1')).toBe(null)
  expect(await demoIdentity(new Request('https://curio.test/api/editorial',{headers:{Cookie:value}}),{...env,CATALOG_OPERATOR_TOKEN:'rotated-operator-token-at-least-32-bytes'},'192.0.2.1')).toBe(null)
})

it('accepts separately provisioned tester hashes and revokes sessions when the hash is removed',async()=>{
  const token='private-demo-tester-token-at-least-32-bytes'
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),byte=>byte.toString(16).padStart(2,'0')).join('')
  const env={EDITORIAL_DEMO_BUDGET_ENABLED:'true',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_PUBLIC_AI_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',INFERENCE_BUDGET:{} as DurableObjectNamespace,RATE_LIMIT_SALT:'test-only-32-byte-or-longer-rate-limit-secret',PUBLIC_APP_ORIGIN:'https://curio.test',EDITORIAL_TESTER_TOKEN_HASHES:`alice:${hash}`}
  const response=await issueDemoSession(new Request('https://curio.test/api/editorial/demo-session',{method:'POST',headers:{Origin:'https://curio.test','CF-Connecting-IP':'192.0.2.1',Authorization:`Bearer ${token}`}}),env)
  expect(response.status).toBe(200)
  const cookie=response.headers.get('Set-Cookie')!.split(';')[0],request=new Request('https://curio.test/api/editorial',{headers:{Cookie:cookie}})
  expect(await demoIdentity(request,env,'192.0.2.1')).toBe('tester_alice')
  expect(await demoIdentity(request,{...env,EDITORIAL_TESTER_TOKEN_HASHES:''},'192.0.2.1')).toBe(null)
})

it('exposes only bounded aggregate status behind existing operator authentication',async()=>{
  const {db,value}=budget()
  try{
    const token='operator-test-token-at-least-32-bytes'
    const namespace={idFromName:()=>({}),get:()=>({fetch:(request:Request|string)=>value.fetch(typeof request==='string'?new Request(request):request)})} as unknown as DurableObjectNamespace
    const env={CATALOG_DB:{} as D1Database,CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:'https://curio.test',INFERENCE_BUDGET:namespace,MAGAZINE_MAX_CALLS:'20'}
    const headers={Origin:'https://curio.test','CF-Connecting-IP':'192.0.2.1'}
    const path='https://curio.test/api/operator/catalog/intelligence/budget/status'
    expect((await app.request(path,{headers:{...headers,Authorization:'Bearer incorrect'}},env)).status).toBe(403)
    const response=await app.request(path,{headers:{...headers,Authorization:`Bearer ${token}`}},env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({mode:'standard',lifetime:{total:20,used:0,remaining:20},day:{total:20,used:0,remaining:20},recent:[]})
    const disabled=await app.request(path,{headers:{...headers,Authorization:`Bearer ${token}`}},{...env,EDITORIAL_DEMO_BUDGET_ENABLED:'true',EDITORIAL_DEMO_DAILY_UNITS:'160',EDITORIAL_DEMO_LIFETIME_UNITS:'500',MAGAZINE_AI_ENABLED:'false'})
    expect(disabled.status).toBe(200)
    expect(await disabled.json()).toMatchObject({mode:'demo',demoActive:false,inferenceEnabled:false,lifetime:{total:500,used:0}})
  }finally{db.close()}
})
