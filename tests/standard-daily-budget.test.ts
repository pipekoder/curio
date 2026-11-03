// @vitest-environment node
import {DatabaseSync} from 'node:sqlite'
import {afterEach,expect,it,vi} from 'vitest'
import {InferenceBudget} from '../worker/budget'
import {inferenceBudgetStatus,reserveInference} from '../worker/inference-budget'
import type {Bindings} from '../worker/index'

function fixture(){
 const db=new DatabaseSync(':memory:')
 const state={storage:{sql:{exec:(sql:string,...args:(string|number)[])=>{const statement=db.prepare(sql);const rows=/^\s*SELECT\b/i.test(sql)?statement.all(...args):(statement.run(...args),[]);return{toArray:()=>rows}}},transactionSync:<T>(callback:()=>T)=>{db.exec('BEGIN');try{const value=callback();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}}}} as unknown as DurableObjectState
 const budget=new InferenceBudget(state),idFromName=vi.fn((name:string)=>name),namespace={idFromName,get:()=>({fetch:(input:string|Request,init?:RequestInit)=>budget.fetch(typeof input==='string'?new Request(input,init):input)})} as unknown as DurableObjectNamespace
 const env={INFERENCE_BUDGET:namespace,RATE_LIMIT_SALT:'test-only-rate-limit-salt-at-least-32-characters',MAGAZINE_MAX_CALLS:'100',INFERENCE_DAILY_MAX_UNITS:'100'} as Bindings
 return{db,budget,env,idFromName}
}
afterEach(()=>vi.useRealTimers())

it('uses the existing shared DO and preserves 17 historical units when lifting both standard caps to 100',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
 const {db,env,idFromName}=fixture()
 try{
  const day=`day:${Math.floor(Date.now()/86400000)}`
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',17,0)
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run(day,17,(Math.floor(Date.now()/86400000)+1)*86400000)
  expect(await inferenceBudgetStatus(env)).toMatchObject({mode:'standard',lifetime:{total:100,used:17,remaining:83},day:{total:100,used:17,remaining:83}})
  expect((await reserveInference(env,'192.0.2.1',1,'version-test-asset')).allowed).toBe(true)
  expect(await inferenceBudgetStatus(env)).toMatchObject({lifetime:{used:18,remaining:82},day:{used:18,remaining:82}})
  expect(idFromName).toHaveBeenCalledWith('magazine-v1')
 }finally{db.close()}
})

it('reserves five V3 steps atomically without changing legacy four-unit traffic or global usage',async()=>{
 const {db,env}=fixture()
 try{
  const v3={...env,EDITORIAL_WORKFLOW_V3_ENABLED:'true'}
  expect((await reserveInference(v3,'192.0.2.20',5)).allowed).toBe(true)
  expect(await inferenceBudgetStatus(v3)).toMatchObject({lifetime:{used:5,remaining:95},day:{used:5,remaining:95}})
  await expect(reserveInference(env,'192.0.2.21',5)).rejects.toThrow('Article V3 budget unavailable')
  expect((await reserveInference(env,'192.0.2.21',4)).allowed).toBe(true)
  expect(await inferenceBudgetStatus(env)).toMatchObject({lifetime:{used:9,remaining:91}})
 }finally{db.close()}
})

it('enforces 100 daily units independently of the lifetime counter and resets only the UTC day',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
 const {db,env}=fixture()
 try{
  const day=`day:${Math.floor(Date.now()/86400000)}`
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',17,0)
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run(day,99,(Math.floor(Date.now()/86400000)+1)*86400000)
  expect((await reserveInference(env,'192.0.2.1')).allowed).toBe(true)
  expect((await reserveInference(env,'192.0.2.2')).allowed).toBe(false)
  expect(await inferenceBudgetStatus(env)).toMatchObject({lifetime:{used:18,remaining:82},day:{used:100,remaining:0}})
  vi.setSystemTime(new Date('2026-11-03T00:00:00Z'))
  expect((await reserveInference(env,'192.0.2.2')).allowed).toBe(true)
  expect(await inferenceBudgetStatus(env)).toMatchObject({lifetime:{used:19,remaining:81},day:{used:1,remaining:99}})
 }finally{db.close()}
})

it('enforces the 100-unit lifetime cap across UTC-day resets',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
 const {db,env}=fixture()
 try{
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',99,0)
  expect((await reserveInference(env,'192.0.2.10')).allowed).toBe(true)
  vi.setSystemTime(new Date('2026-11-03T08:00:00Z'))
  expect((await reserveInference(env,'192.0.2.11')).allowed).toBe(false)
  expect(await inferenceBudgetStatus(env)).toMatchObject({lifetime:{total:100,used:100,remaining:0},day:{total:100,used:0,remaining:100}})
 }finally{db.close()}
})

it('fails closed for invalid standard configuration, retains the missing-variable 20-unit default, and rejects standard 160/day',async()=>{
 const {db,budget,env}=fixture()
 try{
  for(const value of ['0','101','1.5','NaN']){
   const invalid={...env,INFERENCE_DAILY_MAX_UNITS:value}
   await expect(reserveInference(invalid,'192.0.2.1')).rejects.toThrow('Invalid budget limits')
   await expect(inferenceBudgetStatus(invalid)).rejects.toThrow('Invalid budget limits')
  }
  expect(await inferenceBudgetStatus({...env,INFERENCE_DAILY_MAX_UNITS:undefined})).toMatchObject({day:{total:20}})
  expect((await budget.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip:'a'.repeat(64),ceiling:100,daily:160,demo:false})}))).status).toBe(400)
  expect((await budget.fetch(new Request('https://budget/status?ceiling=100&daily=160&demo=false'))).status).toBe(400)
  expect((await budget.fetch(new Request('https://budget/status?ceiling=500&daily=160&demo=true'))).status).toBe(200)
 }finally{db.close()}
})
