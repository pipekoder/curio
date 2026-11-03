// @vitest-environment node
import {DatabaseSync} from 'node:sqlite'
import {afterEach,expect,it,vi} from 'vitest'
import {InferenceBudget} from '../worker/budget'
import {resolveArticlePreparationPolicy} from '../worker/article-preparation-policy'
import {reserveInference} from '../worker/inference-budget'

function budget(){
 const db=new DatabaseSync(':memory:')
 const state={storage:{sql:{exec:(sql:string,...args:(string|number)[])=>{const stmt=db.prepare(sql);const rows=/^\s*SELECT\b/i.test(sql)?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows}}},transactionSync:<T>(fn:()=>T)=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}} as unknown as DurableObjectState
 return {db,value:new InferenceBudget(state)}
}
const ip='a'.repeat(64)
const defaults={maxPerHour:16,maxPerDay:24,windowLimit:2,windowSeconds:16,concurrency:2}
const recommended={maxPerHour:24,maxPerDay:48,windowLimit:4,windowSeconds:16,concurrency:4}
const reserve=(value:InferenceBudget,more:Record<string,unknown>={})=>value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip,ceiling:100,daily:100,units:1,articlePreparation:true,articlePreparationPolicy:defaults,...more})}))
const finish=(value:InferenceBudget,id:string)=>value.fetch(new Request('https://budget/finish',{method:'POST',body:JSON.stringify({id,outcome:'completed'})}))
afterEach(()=>vi.useRealTimers())

it('parses effective Worker variables, retains defaults, and rejects invalid or unsafe limits',()=>{
 expect(resolveArticlePreparationPolicy({} as never)).toEqual(defaults)
 expect(resolveArticlePreparationPolicy({ARTICLE_PREP_MAX_PER_HOUR:'24',ARTICLE_PREP_MAX_PER_DAY:'48',ARTICLE_PREP_WINDOW_LIMIT:'4',ARTICLE_PREP_WINDOW_SECONDS:'16',ARTICLE_PREP_CONCURRENCY:'4'} as never)).toEqual(recommended)
 for(const override of [{ARTICLE_PREP_MAX_PER_HOUR:'24.5'},{ARTICLE_PREP_MAX_PER_DAY:'0'},{ARTICLE_PREP_CONCURRENCY:'5'},{ARTICLE_PREP_WINDOW_SECONDS:'1'},{ARTICLE_PREP_MAX_PER_HOUR:'49'},{ARTICLE_PREP_MAX_PER_DAY:'16',ARTICLE_PREP_MAX_PER_HOUR:'24'},{ARTICLE_PREP_WINDOW_LIMIT:'2',ARTICLE_PREP_CONCURRENCY:'4'}])
  expect(()=>resolveArticlePreparationPolicy(override as never)).toThrow('Invalid article preparation configuration')
})
it('passes effective Dashboard-style Worker values to the shared budget without changing global caps',async()=>{
 const calls:string[]=[]
 const env={RATE_LIMIT_SALT:'test-salt-'.repeat(4),EDITORIAL_ARTICLE_PREPARATION_ENABLED:'true',MAGAZINE_MAX_CALLS:'100',INFERENCE_DAILY_MAX_UNITS:'100',ARTICLE_PREP_MAX_PER_HOUR:'24',ARTICLE_PREP_MAX_PER_DAY:'48',ARTICLE_PREP_WINDOW_LIMIT:'4',ARTICLE_PREP_WINDOW_SECONDS:'16',ARTICLE_PREP_CONCURRENCY:'4',INFERENCE_BUDGET:{idFromName:()=>({}),get:()=>({fetch:async(_url:string,init:RequestInit)=>{calls.push(String(init.body));return Response.json({allowed:true,reservationId:'00000000-0000-4000-8000-000000000001'})}})}}
 expect(await reserveInference(env as never,'192.0.2.4',1,undefined,false,null,true)).toMatchObject({allowed:true,reservationId:'00000000-0000-4000-8000-000000000001'})
 expect(JSON.parse(calls[0])).toMatchObject({ceiling:100,daily:100,articlePreparation:true,articlePreparationPolicy:recommended})
 await expect(reserveInference({...env,ARTICLE_PREP_CONCURRENCY:'5'} as never,'192.0.2.4',1,undefined,false,null,true)).rejects.toThrow('Invalid article preparation configuration')
 expect(calls).toHaveLength(1)
})

it('charges preparation against existing lifetime/day counters with a separate bounded hourly policy',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T08:00:00Z'))
 const {db,value}=budget()
 try{
  for(let i=0;i<2;i++){
   const row=await (await reserve(value)).json() as {allowed:boolean;reservationId:string}
   expect(row.allowed).toBe(true);await finish(value,row.reservationId)
  }
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false}) // two calls in a bounded preparation window
  for(let i=2;i<16;i++){
   vi.advanceTimersByTime(17000)
   const row=await (await reserve(value)).json() as {allowed:boolean;reservationId:string}
   expect(row.allowed).toBe(true);await finish(value,row.reservationId)
  }
  vi.advanceTimersByTime(17000)
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false})
  const ordinary=await value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip,ceiling:100,daily:100,units:4})}))
  expect(await ordinary.json()).toMatchObject({allowed:true}) // prep did not consume ordinary IP allowance
  const status=await (await value.fetch(new Request('https://budget/status?ceiling=100&daily=100&demo=false'))).json() as {lifetime:{used:number};day:{used:number};recent:{policy:string}[]}
  expect(status.lifetime.used).toBe(20);expect(status.day.used).toBe(20)
  expect(status.recent.some(row=>row.policy==='article_preparation')).toBe(true)
 }finally{db.close()}
})
it('rejects invalid preparation combinations and preserves the shared cap',async()=>{
 const {db,value}=budget()
 try{
  expect((await reserve(value,{units:4})).status).toBe(400)
  expect((await reserve(value,{samAssetId:'asset-test'})).status).toBe(400)
  expect((await reserve(value,{editorialPilot:true})).status).toBe(400)
  expect((await reserve(value,{demoTester:'b'.repeat(64)})).status).toBe(400)
  expect((await reserve(value,{articlePreparationPolicy:{...defaults,concurrency:5}})).status).toBe(400)
  expect((await reserve(value,{articlePreparationPolicy:undefined})).status).toBe(400)
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',100,0)
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false})
 }finally{db.close()}
})
it('atomically enforces the configured global preparation concurrency across distinct IPs',async()=>{
 const {db,value}=budget()
 try{
  const results=await Promise.all(Array.from({length:5},(_,n)=>reserve(value,{ip:n.toString(16).padStart(64,'0'),articlePreparationPolicy:recommended})))
  const bodies=await Promise.all(results.map(response=>response.json())) as {allowed:boolean;reservationId?:string}[]
  expect(bodies.filter(row=>row.allowed)).toHaveLength(4)
  expect(bodies.filter(row=>!row.allowed)).toHaveLength(1)
  await finish(value,bodies.find(row=>row.reservationId)!.reservationId!)
  expect(await (await reserve(value,{ip:'f'.repeat(64),articlePreparationPolicy:recommended})).json()).toMatchObject({allowed:true})
 }finally{db.close()}
})
it('honors configured hourly, daily and window limits without raising shared caps',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T08:00:00Z'))
 const {db,value}=budget()
 try{
  for(let n=0;n<24;n++){
   const row=await (await reserve(value,{articlePreparationPolicy:recommended})).json() as {allowed:boolean;reservationId:string}
   expect(row.allowed).toBe(true);await finish(value,row.reservationId)
   if(n%4===3)vi.advanceTimersByTime(17000)
  }
  expect(await (await reserve(value,{articlePreparationPolicy:recommended})).json()).toMatchObject({allowed:false})
  vi.advanceTimersByTime(3600000)
  for(let n=0;n<24;n++){
   const row=await (await reserve(value,{articlePreparationPolicy:recommended})).json() as {allowed:boolean;reservationId:string}
   expect(row.allowed).toBe(true);await finish(value,row.reservationId)
   if(n%4===3)vi.advanceTimersByTime(17000)
  }
  expect(await (await reserve(value,{articlePreparationPolicy:recommended})).json()).toMatchObject({allowed:false})
  const status=await (await value.fetch(new Request('https://budget/status?ceiling=100&daily=100&demo=false'))).json() as {lifetime:{used:number};day:{used:number}}
  expect(status.lifetime.used).toBe(48);expect(status.day.used).toBe(48)
 }finally{db.close()}
})
it('uses the configured window duration after released leases',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T08:00:00Z'))
 const {db,value}=budget(),policy={...recommended,windowSeconds:32}
 try{
  for(let n=0;n<4;n++){
   const row=await (await reserve(value,{articlePreparationPolicy:policy})).json() as {allowed:boolean;reservationId:string}
   expect(row.allowed).toBe(true);await finish(value,row.reservationId)
  }
  vi.advanceTimersByTime(17000)
  expect(await (await reserve(value,{articlePreparationPolicy:policy})).json()).toMatchObject({allowed:false})
  vi.advanceTimersByTime(16000)
  expect(await (await reserve(value,{articlePreparationPolicy:policy})).json()).toMatchObject({allowed:true})
 }finally{db.close()}
})
