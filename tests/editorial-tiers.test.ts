import {expect,it} from 'vitest'
import {editorialTierForScore,editorialTierLabel,EDITORIAL_TIER_VERSION} from '../shared/editorial-tiers'

it('maps boundary scores to the three editorial tiers',()=>{
  expect(EDITORIAL_TIER_VERSION).toBe('curio-editorial-tier-v1')
  expect(editorialTierForScore(100)).toMatchObject({id:'editors_pick',label:"Editor's Pick"})
  expect(editorialTierForScore(70)).toMatchObject({id:'editors_pick'})
  expect(editorialTierForScore(69)).toMatchObject({id:'wild_perspectives',label:'Wild Perspectives'})
  expect(editorialTierForScore(50)).toMatchObject({id:'wild_perspectives'})
  expect(editorialTierForScore(49)).toMatchObject({id:'curious_findings',label:'Curious Findings'})
  expect(editorialTierForScore(0)).toMatchObject({id:'curious_findings'})
})

it('carries the exact friendly descriptions and no numeric score',()=>{
  expect(editorialTierForScore(85).description).toBe('A thoughtful selection, bringing together ideas, objects and perspectives worth exploring.')
  expect(editorialTierForScore(60).description).toBe('An unexpected angle, a curious connection, or a different way of seeing familiar things.')
  expect(editorialTierForScore(20).description).toBe('Small discoveries, interesting details and ideas that invite a closer look.')
  for(const score of [100,70,69,50,49,0]){
    const tier=editorialTierForScore(score)
    expect(tier).not.toHaveProperty('score')
    expect(JSON.stringify({label:tier.label,description:tier.description})).not.toMatch(/[0-9]/)
    expect(editorialTierLabel.parse({label:tier.label,description:tier.description})).toEqual({label:tier.label,description:tier.description})
  }
})
