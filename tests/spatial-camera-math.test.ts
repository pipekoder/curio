import {describe,expect,it} from 'vitest'
import {clamp,dampedStep,dockMagnet,lerp,magnetEscape,scrollToDistance,splinePosition} from '../src/spatial/camera-math'

describe('spatial camera math',()=>{
 it('damps toward the target without overshoot and snaps on degenerate input',()=>{
  expect(dampedStep(0,100,4.5,0.016)).toBeGreaterThan(0)
  expect(dampedStep(0,100,4.5,0.016)).toBeLessThan(100)
  let v=0
  for(let i=0;i<600;i++)v=dampedStep(v,100,4.5,0.016)
  expect(v).toBeGreaterThan(99.9)
  expect(dampedStep(0,100,4.5,0)).toBe(100)
  expect(dampedStep(0,100,0,0.016)).toBe(100)
 })
 it('interpolates the spline and clamps beyond its ends',()=>{
  const waypoints=[{d:0,p:[0,2,26] as [number,number,number]},{d:90,p:[0,3,-64] as [number,number,number]}]
  expect(splinePosition(0,waypoints)).toEqual([0,2,26])
  expect(splinePosition(45,waypoints)).toEqual([0,2.5,-19])
  expect(splinePosition(90,waypoints)).toEqual([0,3,-64])
  expect(splinePosition(-10,waypoints)).toEqual([0,2,26])
  expect(splinePosition(200,waypoints)).toEqual([0,3,-64])
  expect(splinePosition(10,[])).toEqual([0,0,0])
 })
 it('pulls gently toward near docks and ignores distant ones',()=>{
  expect(dockMagnet(100,[90],14)).toBeLessThan(100)
  expect(dockMagnet(100,[90],14)).toBeGreaterThan(90)
  expect(dockMagnet(100,[200],14)).toBe(100)
  expect(dockMagnet(90,[90],14)).toBe(90)
  expect(dockMagnet(100,[90],0)).toBe(100)
 })
 it('lets fast scroll escape the magnet',()=>{
  expect(magnetEscape(1200,900)).toBe(true)
  expect(magnetEscape(-1200,900)).toBe(true)
  expect(magnetEscape(100,900)).toBe(false)
 })
 it('maps scroll to path distance and guards unsettled layout',()=>{
  expect(scrollToDistance(500,1000,90)).toBe(45)
  expect(scrollToDistance(2000,1000,90)).toBe(90)
  expect(scrollToDistance(-50,1000,90)).toBe(0)
  expect(scrollToDistance(100,0,90)).toBe(0)
  expect(scrollToDistance(100,1000,0)).toBe(0)
 })
 it('keeps helpers total',()=>{
  expect(lerp(0,10,0.25)).toBe(2.5)
  expect(clamp(9,0,5)).toBe(5)
 })
})
