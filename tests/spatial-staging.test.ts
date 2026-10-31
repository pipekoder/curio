import {describe,expect,it} from 'vitest'
import {defaultPreferences,editorialDemoCatalog,fallbackPlan,type EditorialEdition} from '../shared/editorial'
import {readerDemoCatalog} from '../src/editorial-demo-media'
import {stageEdition} from '../src/spatial/staging'
import manifest from '../src/spatial/nodes.manifest.json'

const pool=[...readerDemoCatalog,...editorialDemoCatalog]
const editionFor=(prompt:string):EditorialEdition=>({
  plan:fallbackPlan({...defaultPreferences,interests:prompt},pool),
  items:pool,source:'deterministic',retrieval:'fictional',cached:false,
})

describe('spatial staging',()=>{
 it('stages real fallback exhibits with approved local artwork only',()=>{
  const {exhibits,skipped}=stageEdition(editionFor('quiet rooms'))
  expect(exhibits.length).toBeGreaterThan(0)
  expect(exhibits.length).toBeLessThanOrEqual(6)
  expect(new Set(exhibits.map(e=>e.assetId)).size).toBe(exhibits.length)
  for(const exhibit of exhibits){
    expect(exhibit.image.startsWith('/editorial/')).toBe(true)
    expect(manifest.some(m=>m.assetId===exhibit.assetId)).toBe(true)
    expect(exhibit.title.length).toBeGreaterThan(0)
    expect(exhibit.narrative.length).toBeGreaterThan(0)
    for(const hotspot of exhibit.hotspots){
      expect(hotspot.x).toBeGreaterThanOrEqual(0);expect(hotspot.x).toBeLessThanOrEqual(1)
      expect(hotspot.y).toBeGreaterThanOrEqual(0);expect(hotspot.y).toBeLessThanOrEqual(1)
    }
  }
  expect(skipped).toBeGreaterThanOrEqual(0)
 })
 it('skips features without a joined item or approved artwork instead of inventing',()=>{
  const base=editionFor('quiet rooms')
  const ghost={...base.plan.features[0],catalogId:'unknown-catalog',assetId:'unknown-asset'}
  const {exhibits,skipped}=stageEdition({...base,plan:{...base.plan,features:[ghost,...base.plan.features]}})
  expect(skipped).toBeGreaterThanOrEqual(1)
  expect(exhibits.every(e=>e.assetId!=='unknown-asset')).toBe(true)
 })
 it('attaches validated connection threads to their source exhibit',()=>{
  const base=editionFor('quiet rooms')
  const first=base.plan.features[0]
  const plan={...base.plan,connections:[{fromAssetId:first.assetId,toAssetId:'curio-owner-08-v1',thread:'Shared curved silhouettes.'}]}
  const {exhibits}=stageEdition({...base,plan})
  const staged=exhibits.find(e=>e.assetId===first.assetId)
  if(staged)expect(staged.thread).toBe('Shared curved silhouettes.')
 })
})
