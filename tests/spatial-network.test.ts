import {describe,expect,it} from 'vitest'
import {NETWORK_CENTER,NETWORK_RADIUS,ORBIT_DEFAULT,ORBIT_MAX,ORBIT_MIN,buildEdges,layoutDust,layoutNetwork,mulberry,nodeScale,orbitCamera,pickSurprise,relevanceWeights} from '../src/spatial/network-math'

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

describe('dust volume',()=>{
 it('fills genuine 3D space deterministically with density variation',()=>{
  const first=layoutDust(163,NETWORK_CENTER,NETWORK_RADIUS,mulberry(7))
  expect(layoutDust(163,NETWORK_CENTER,NETWORK_RADIUS,mulberry(7))).toEqual(first)
  expect(first).toHaveLength(163)
  const axes=[0,1,2].map(axis=>{
    const values=first.map(p=>p[axis] as number)
    const mean=values.reduce((n,v)=>n+v,0)/values.length
    return Math.sqrt(values.reduce((n,v)=>n+(v-mean)*(v-mean),0)/values.length)
  })
  // Spread in every axis: a volume, not a shell, plane, or ring.
  expect(axes[0]).toBeGreaterThan(6)
  expect(axes[1]).toBeGreaterThan(3)
  expect(axes[2]).toBeGreaterThan(5)
  for(const [x,y,z] of first){
    expect(Math.hypot(x-NETWORK_CENTER[0],y-NETWORK_CENTER[1],z-NETWORK_CENTER[2])).toBeLessThan(NETWORK_RADIUS*1.4)
  }
  const heart=first.filter((_,i)=>i%5!==0),halo=first.filter((_,i)=>i%5===0)
  const spread=(pts:number[][])=>Math.hypot(...[0,1,2].map(axis=>{
    const values=pts.map(p=>p[axis])
    return Math.max(...values)-Math.min(...values)
  }))
  expect(spread(halo)).toBeGreaterThan(spread(heart))
 })
 it('handles empty and single-point clouds',()=>{
  expect(layoutDust(0,NETWORK_CENTER,NETWORK_RADIUS,mulberry(1))).toEqual([])
  expect(layoutDust(1,NETWORK_CENTER,NETWORK_RADIUS,mulberry(1))).toHaveLength(1)
 })
})

describe('network edges',()=>{
 it('keeps only pairs where both endpoints exist, deduped',()=>{
  const hints=new Map([['a',['b','ghost','a']],['b',['a']],['c',['b']]])
  expect(buildEdges(['a','b','c'],hints).sort()).toEqual([[0,1],[1,2]])
 })
})

describe('relevance weighting',()=>{
 const near=([x,y,z]:[number,number,number])=>Math.hypot(x-NETWORK_CENTER[0],(y-NETWORK_CENTER[1])/0.72,z-NETWORK_CENTER[2])
 it('pulls staged exhibits nearest and pushes the unrelated outward',()=>{
  const weights=relevanceWeights(new Set([0]),[[0,1],[2,3]],4)
  expect(weights).toEqual([1,0.55,0.15,0.15])
  const positions=layoutNetwork(4,NETWORK_CENTER,NETWORK_RADIUS,weights)
  expect(near(positions[0])).toBeLessThan(near(positions[1]))
  expect(near(positions[1])).toBeLessThan(near(positions[2]))
  expect(layoutNetwork(4,NETWORK_CENTER,NETWORK_RADIUS,weights)).toEqual(positions)
 })
 it('keeps a neutral middle distance before the first edition',()=>{
  expect(relevanceWeights(new Set(),[[0,1]],3)).toEqual([0.6,0.6,0.6])
 })
 it('scales prominence with relevance',()=>{
  expect(nodeScale(1)).toBeCloseTo(1.28,5)
  expect(nodeScale(0.15)).toBeLessThan(nodeScale(0.55))
  expect(nodeScale(99)).toBe(nodeScale(1))
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
