import {describe,expect,it} from 'vitest'
import allocation from '../docs/DISCOVER_ASSET_ALLOCATION.json'
import {demoMedia,readerDemoCatalog} from '../src/editorial-demo-media'
import {interpretEditorialPrompt} from '../shared/editorial-intent'
import {editorialDemoCatalog,fallbackPlan} from '../shared/editorial'
import {isPublishable} from '../shared/catalog'

describe('approved editorial demo media',()=>{
 it('records all 26 unique, versioned owner assets without inventing rights or merchants',()=>{
  expect(demoMedia).toHaveLength(26)
  expect(new Set(demoMedia.map(m=>m.assetId)).size).toBe(26)
  expect(new Set(demoMedia.map(m=>m.fingerprint)).size).toBe(26)
  expect(demoMedia.map(m=>m.path).sort()).toEqual(allocation.map(a=>`/editorial/${{'Discover':'discover','Generate':'generate','Read & Explore':'read','Curiosity Journey':'journey','Collect':'collect'}[a.stage]}/${a.filename}`).sort())
  expect(demoMedia.every(m=>m.related.every(id=>demoMedia.some(next=>next.id===id)))).toBe(true)
  expect(readerDemoCatalog).toHaveLength(5)
  expect(readerDemoCatalog.every(a=>isPublishable(a)&&a.permissions.aiAnalysis.status==='pending'&&a.permissions.edits.status==='pending'&&a.verifiedBrandLink===null)).toBe(true)
  expect(demoMedia.filter(m=>m.product).every(m=>m.product?.brandName.includes('(fictional)'))).toBe(true)
  expect(demoMedia.filter(m=>m.product).every(m=>Boolean(m.product?.hotspot.x&&m.product.hotspot.y&&m.product.hotspot.x<1&&m.product.hotspot.y<1))).toBe(true)
 })
 it('produces different validated primary assets and copy for chair and fashion prompts without AI',()=>{
  const pool=[...readerDemoCatalog,...editorialDemoCatalog]
  const chair=fallbackPlan(interpretEditorialPrompt({prompt:'Focus on a rounded lounge chair and sculptural seating in quiet rooms',consent:false}),pool)
  const fashion=fallbackPlan(interpretEditorialPrompt({prompt:'Focus on fashion, flowing coats and loose garment silhouettes',consent:false}),pool)
  expect(chair.features[0].assetId).toMatch(/^curio-owner-(08|16)-v1$/)
  expect(fashion.features[0].assetId).toBe('curio-owner-18-v1')
  expect(chair.features[0].assetId).not.toBe(fashion.features[0].assetId)
  expect(chair.features[0].headline).not.toBe(fashion.features[0].headline)
 })
})
