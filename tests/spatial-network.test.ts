import {describe,expect,it} from 'vitest'
import {NETWORK_CENTER,NETWORK_RADIUS,ORBIT_DEFAULT,ORBIT_MAX,ORBIT_MIN,buildEdges,layoutNetwork,orbitCamera,pickSurprise} from '../src/spatial/network-math'

describe('network layout',()=>{
 it('spreads every node deterministically inside the chamber shell',()=>{
  const first=layoutNetwork(26),second=layoutNetwork(26)
  expect(first).toEqual(second)
  expect(first).toHaveLength(26)
  for(const [x,y,z] of first){
    const dist=Math.hypot(x-NETWORK_CENTER[0],(y-NETWORK_CENTER[1])/0.72,z-NETWORK_CENTER[2])
    expect(dist).toBeGreaterThan(NETWORK_RADIUS-0.01)
    expect(dist).toBeLessThan(NETWORK_RADIUS+0.01)
  }
  const ids=first.map(p=>p.join(','))
  expect(new Set(ids).size).toBe(26)
 })
 it('handles empty and single-node catalogs',()=>{
  expect(layoutNetwork(0)).toEqual([])
  expect(layoutNetwork(1)).toEqual([NETWORK_CENTER])
 })
})

describe('network edges',()=>{
 it('keeps only pairs where both endpoints exist, deduped',()=>{
  const hints=new Map([['a',['b','ghost','a']],['b',['a']],['c',['b']]])
  expect(buildEdges(['a','b','c'],hints).sort()).toEqual([[0,1],[1,2]])
 })
})

describe('orbit camera',()=>{
 it('circles the center with clamped pitch and radius',()=>{
  const {position,look}=orbitCamera(NETWORK_CENTER,0,0,ORBIT_DEFAULT)
  expect(look).toEqual(NETWORK_CENTER)
  expect(position[2]).toBeCloseTo(NETWORK_CENTER[2]+ORBIT_DEFAULT,5)
  const high=orbitCamera(NETWORK_CENTER,0,99,9e9)
  expect(high.position[1]).toBeLessThan(NETWORK_CENTER[1]+ORBIT_MAX+0.01)
  expect(Math.hypot(...high.position.map((v,i)=>v-NETWORK_CENTER[i]))).toBeLessThanOrEqual(ORBIT_MAX+0.01)
  const low=orbitCamera(NETWORK_CENTER,Math.PI,-99,-5)
  expect(Math.hypot(...low.position.map((v,i)=>v-NETWORK_CENTER[i]))).toBeGreaterThanOrEqual(ORBIT_MIN-0.01)
 })
})

describe('surprise selection',()=>{
 it('never repeats the current highlight and never auto-selects outside range',()=>{
  expect(pickSurprise(0)).toBe(-1)
  expect(pickSurprise(1,0)).toBe(0)
  expect(pickSurprise(26,5,()=>0.2)).toBe(6) // floor(.2*26)=5 is excluded -> next
  expect(pickSurprise(26,25,()=>0.999)).toBe(0) // wraps past the end
  expect(pickSurprise(26,-1,()=>0.999)).toBe(25)
 })
})
