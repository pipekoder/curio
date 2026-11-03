// @vitest-environment node
import {DatabaseSync} from 'node:sqlite'
import {afterEach,expect,it,vi} from 'vitest'
import {InferenceBudget} from '../worker/budget'

function budget(){
 const db=new DatabaseSync(':memory:')
 const state={storage:{sql:{exec:(sql:string,...args:(string|number)[])=>{const stmt=db.prepare(sql);const rows=/^\s*SELECT\b/i.test(sql)?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows}}},transactionSync:<T>(fn:()=>T)=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}} as unknown as DurableObjectState
 return {db,value:new InferenceBudget(state)}
}
const ip='a'.repeat(64)
const reserve=(value:InferenceBudget,more:Record<string,unknown>={})=>value.fetch(new Request('https://budget/reserve',{method:'POST',body:JSON.stringify({ip,ceiling:100,daily:100,units:1,articlePreparation:true,...more})}))
afterEach(()=>vi.useRealTimers())

it('charges preparation against existing lifetime/day counters with a separate bounded hourly policy',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T08:00:00Z'))
 const {db,value}=budget()
 try{
  expect(await (await reserve(value)).json()).toMatchObject({allowed:true})
  expect(await (await reserve(value)).json()).toMatchObject({allowed:true})
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false}) // two calls in a bounded preparation window
  for(let i=2;i<16;i++){vi.advanceTimersByTime(17000);expect(await (await reserve(value)).json()).toMatchObject({allowed:true})}
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
  db.prepare('INSERT INTO counters(key,count,expires) VALUES(?,?,?)').run('lifetime',100,0)
  expect(await (await reserve(value)).json()).toMatchObject({allowed:false})
 }finally{db.close()}
})
