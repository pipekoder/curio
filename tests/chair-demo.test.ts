import {describe,expect,it} from 'vitest'
import {chairDemo,chairDemoDetails} from '../src/chair-demo'
import {curationCatalog,displaySource,isPublishable} from '../shared/catalog'
import {readCollection} from '../shared/editorial'

describe('fictional chair reader demo',()=>{
 it('uses exactly the approved local photo and keeps the record outside the verified merchant catalog',()=>{
  expect(chairDemo.id).toBe('curio-fictional-arc-chair-v1')
  expect(displaySource(chairDemo)).toBe('/editorial/read/16_read_chair.png')
  expect(isPublishable(chairDemo)).toBe(true)
  expect(chairDemo.sourceType).toBe('synthetic_concept')
  expect(chairDemo.advertiser?.verification).toBe('unverified')
  expect(chairDemo.verifiedBrandLink).toBeNull()
  expect(curationCatalog.some(a=>a.id===chairDemo.id)).toBe(false)
  expect(chairDemo.permissions.aiAnalysis.status).toBe('pending')
  expect(chairDemo.permissions.edits.status).toBe('pending')
  expect(chairDemoDetails.price.status).toBe('fictional_demo_estimate')
 })
 it('places a manually authored point inside the visible chair in original photo coordinates',()=>{
  expect(chairDemoDetails.hotspot.source).toBe('manually_authored')
  expect(chairDemoDetails.hotspot.x*chairDemo.image.width).toBeCloseTo(539,0)
  expect(chairDemoDetails.hotspot.y*chairDemo.image.height).toBeCloseTo(925,0)
  expect(chairDemo.discoverableObjects[0].grounding).toBe('catalog_metadata')
 })
 it('revalidates the same asset version when a saved collection reloads',()=>{
  const saved=JSON.stringify([{assetId:chairDemo.image.id,kind:'story',shelf:'Field notes'}])
  expect(readCollection(saved,[chairDemo])).toHaveLength(1)
  expect(readCollection(saved,[])).toHaveLength(0)
 })
})
