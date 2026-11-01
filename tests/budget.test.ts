// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { InferenceBudget } from '../worker/budget'

// Real SQLite runs the same SQL; local workerd smoke separately verifies the DO binding.
function storage() {
  const db = new DatabaseSync(':memory:')
  const state = { storage: {
    sql: { exec: (sql: string, ...values: (string | number)[]) => {
      const statement = db.prepare(sql)
      const rows = statement.all(...values)
      return { toArray: () => rows }
    } },
    transactionSync: <T>(callback: () => T) => { db.exec('BEGIN'); try { const value = callback(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error } },
  } } as unknown as DurableObjectState
  return { state, db }
}
const reserve = async (budget: InferenceBudget, ip = 'a'.repeat(64), ceiling = 20) => {
  const response = await budget.fetch(new Request('https://budget/reserve', { method: 'POST', body: JSON.stringify({ ip, ceiling }) }))
  return await response.json() as { allowed: boolean; retryAfter: number }
}
afterEach(() => vi.useRealTimers())
it('serializes concurrent reservations and survives class recreation', async () => {
  const { state, db } = storage()
  try {
    const first = new InferenceBudget(state)
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(first)))
    expect(results.filter(r => r.allowed)).toHaveLength(1)
    expect((await reserve(new InferenceBudget(state))).allowed).toBe(false)
  } finally { db.close() }
})
it('enforces cooldown and hourly per-IP limit', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
  const { state, db } = storage(); const budget = new InferenceBudget(state)
  try {
    for (let i = 0; i < 3; i++) { expect((await reserve(budget)).allowed).toBe(true); vi.advanceTimersByTime(61000) }
    expect((await reserve(budget)).allowed).toBe(false)
    vi.setSystemTime(new Date('2026-10-27T11:00:00Z'))
    expect((await reserve(budget)).allowed).toBe(true)
  } finally { db.close() }
})
it('enforces global daily and lifetime ceilings across different IPs', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
  const { state, db } = storage(); const budget = new InferenceBudget(state)
  try {
    for (let i = 0; i < 20; i++) expect((await reserve(budget, i.toString(16).padStart(64, '0'), 21)).allowed).toBe(true)
    expect((await reserve(budget, 'f'.repeat(64), 21)).allowed).toBe(false)
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    expect((await reserve(new InferenceBudget(state), 'f'.repeat(64), 21)).allowed).toBe(true)
    vi.setSystemTime(new Date('2026-10-29T10:00:00Z'))
    expect((await reserve(new InferenceBudget(state), 'e'.repeat(64), 21)).allowed).toBe(false)
  } finally { db.close() }
})
it('rejects malformed internal reservation requests', async () => {
  const { state, db } = storage()
  try { expect((await new InferenceBudget(state).fetch(new Request('https://budget', { method: 'POST', body: '{}' }))).status).toBe(400) }
  finally { db.close() }
})

it('charges two-model reservations against unchanged global/hourly ceilings atomically', async () => {
  const { state, db } = storage()
  const budget = new InferenceBudget(state)
  const multi = (ip: string, units: number) => budget.fetch(new Request('https://budget', { method: 'POST', body: JSON.stringify({ ip, ceiling: 3, units }) }))
  try {
    expect(await (await multi('a'.repeat(64), 2)).json()).toMatchObject({ allowed: true })
    expect(await (await multi('b'.repeat(64), 2)).json()).toMatchObject({ allowed: false })
    expect(await (await multi('b'.repeat(64), 1)).json()).toMatchObject({ allowed: true })
    expect(await (await multi('c'.repeat(64), 1)).json()).toMatchObject({ allowed: false })
    expect((await multi('d'.repeat(64), 100)).status).toBe(400)
  } finally { db.close() }
})

it('reserves the three-call editorial workflow atomically without changing ceilings or cooldowns',async()=>{
  const {state,db}=storage(),budget=new InferenceBudget(state)
  const attempt=(ip:string,units:number)=>budget.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({ip,ceiling:4,units})}))
  try{
    expect(await (await attempt('a'.repeat(64),3)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('a'.repeat(64),1)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('b'.repeat(64),2)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('b'.repeat(64),1)).json()).toMatchObject({allowed:true})
  }finally{db.close()}
})
it('allows two authorized four-unit pilot reservations per UTC hour and keeps ordinary traffic at three',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T09:00:00Z'))
  const {state,db}=storage(),budget=new InferenceBudget(state)
  const attempt=(ip:string,units:number,editorialPilot=false)=>budget.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({ip,ceiling:20,units,...(editorialPilot?{editorialPilot:true}:{})})}))
  try{
    expect(await (await attempt('c'.repeat(64),4)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('a'.repeat(64),4,true)).json()).toMatchObject({allowed:true})
    vi.advanceTimersByTime(61000)
    expect(await (await attempt('a'.repeat(64),4,true)).json()).toMatchObject({allowed:true})
    vi.advanceTimersByTime(61000)
    expect(await (await attempt('a'.repeat(64),4,true)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('a'.repeat(64),1)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('b'.repeat(64),1)).json()).toMatchObject({allowed:true})
    expect((await attempt('c'.repeat(64),1,true)).status).toBe(400)
  }finally{db.close()}
})

it('admits one public reviewed four-unit workflow per IP without raising shared ceilings',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T09:00:00Z'))
  const {state,db}=storage(),budget=new InferenceBudget(state)
  const attempt=(ip:string,units:number,ceiling=20)=>budget.fetch(new Request('https://budget',{method:'POST',body:JSON.stringify({ip,ceiling,units})}))
  try{
    expect(await (await attempt('a'.repeat(64),4)).json()).toMatchObject({allowed:true})
    vi.advanceTimersByTime(61000)
    expect(await (await attempt('a'.repeat(64),4)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('a'.repeat(64),1)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('b'.repeat(64),4)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('c'.repeat(64),4,8)).json()).toMatchObject({allowed:false})
    expect(await (await attempt('c'.repeat(64),4)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('d'.repeat(64),4)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('e'.repeat(64),4)).json()).toMatchObject({allowed:true})
    expect(await (await attempt('f'.repeat(64),4)).json()).toMatchObject({allowed:false})
  }finally{db.close()}
})

it('permits only one SAM reservation per exact asset across IPs and UTC days', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
  const { state, db } = storage()
  const attempt = (ip: string) => new InferenceBudget(state).fetch(new Request('https://budget', { method: 'POST', body: JSON.stringify({ ip, ceiling: 20, samAssetId: 'reviewed-asset-v1' }) }))
  try {
    expect(await (await attempt('a'.repeat(64))).json()).toMatchObject({ allowed: true })
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    expect(await (await attempt('b'.repeat(64))).json()).toMatchObject({ allowed: false })
  } finally { db.close() }
})
