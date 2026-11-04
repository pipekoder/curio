import {describe,expect,it} from 'vitest'
import {INTEREST_SEEDS,SEED_DISPLAY,SUGGESTION_COUNT,drawSurprise,pickSuggestions} from '../src/spatial/prompt-library'

// Oracle transcribed from the Hackathon Demo curation. Display wording must
// match every seed exactly; any drift fails loudly here.
const SPECIFIED:[string,string][]=[
  ['Quiet Nordic interiors','wood, light and calm spaces'],
  ['Swedish homes','shaped by wood and light'],
  ['Nordic concrete interiors','natural materials and texture'],
  ['Nordic stone interiors','quiet monumental calm'],
  ['Handcrafted Scandinavian interiors','natural materials and craft'],
  ['Nordic homes in glass and light','craft and transparency'],
  ['Timeless Nordic homes','metal, wood and honest craft'],
  ['Swedish country homes','wood, stone and craft'],
  ['Minimal Japanese homes','stone, wood and shadow'],
  ['Japanese wood interiors','handcrafted warmth'],
  ['Natural Japanese interiors','light and emptiness'],
  ['Japanese concrete homes','architecture and stillness'],
  ['Asian ceramic homes','vessels and quiet rituals'],
  ['Scandinavian home rituals','morning light and linen'],
  ['Japanese ceramic rituals','tea bowls and morning routines'],
  ['Scandinavian clothing','everyday life and honest fabrics'],
  ['Japanese travel','design and architecture'],
  ['Scandinavian linen clothing','timeless everyday wear'],
  ['Contemporary Nordic travel','cabins and coastlines'],
  ['Timeless Swedish clothing','linen layers and quiet tailoring'],
]

describe('curiosity interest seeds',()=>{
  it('contains exactly the 20 specified unique seeds',()=>{
    expect(SPECIFIED).toHaveLength(20)
    expect(INTEREST_SEEDS).toHaveLength(20)
    expect(INTEREST_SEEDS.map(seed=>[seed.subject,seed.direction])).toEqual(SPECIFIED)
    expect(new Set(INTEREST_SEEDS.map(SEED_DISPLAY)).size).toBe(20)
    expect(SUGGESTION_COUNT).toBe(4)
  })
  it('fills the specified example sentence verbatim',()=>{
    expect(INTEREST_SEEDS[0].sentence).toBe(
      "I'm curious about quiet Nordic interiors, especially their wood, light and calm spaces.")
  })
  it('keeps every subject inside the curated region and category vocabulary',()=>{
    const regions=['swedish','scandinavian','nordic','japanese','asian']
    const categories=['interior','home','ceramic','clothing','travel']
    for(const seed of INTEREST_SEEDS){
      const subject=seed.subject.toLowerCase()
      expect(regions.some(region=>subject.includes(region))).toBe(true)
      expect(categories.some(category=>subject.includes(category))).toBe(true)
    }
  })
  it('gives every seed a natural editable sentence naming its subject',()=>{
    for(const seed of INTEREST_SEEDS){
      expect(seed.sentence.startsWith("I'm curious about ")).toBe(true)
      expect(seed.sentence.toLowerCase()).toContain(seed.subject.toLowerCase())
      expect(seed.sentence.endsWith('.')).toBe(true)
    }
  })
  it('picks four distinct seeds per set',()=>{
    for(let attempt=0;attempt<20;attempt++){
      const picks=pickSuggestions(INTEREST_SEEDS,[],4,()=>((attempt*0.37)%1+1)%1||0.5)
      expect(picks).toHaveLength(4)
      expect(new Set(picks.map(SEED_DISPLAY)).size).toBe(4)
    }
  })
  it('refreshes to a set that avoids every previous seed',()=>{
    const first=pickSuggestions(INTEREST_SEEDS,[],4,()=>0.1)
    const second=pickSuggestions(INTEREST_SEEDS,first,4,()=>0.9)
    expect(second).toHaveLength(4)
    const shown=new Set(first.map(SEED_DISPLAY))
    expect(second.some(seed=>shown.has(SEED_DISPLAY(seed)))).toBe(false)
  })
  it('draws surprises deterministically with variety and no shown repeat',()=>{
    const shown=pickSuggestions(INTEREST_SEEDS,[],4,()=>0.3)
    const first=drawSurprise(INTEREST_SEEDS,shown,0)
    const second=drawSurprise(INTEREST_SEEDS,shown,first.cursor)
    expect(SEED_DISPLAY(first.seed)).not.toBe(SEED_DISPLAY(second.seed))
    expect(shown.map(SEED_DISPLAY)).not.toContain(SEED_DISPLAY(first.seed))
    // Same cursor replays the same pick: deterministic, no model involved.
    expect(drawSurprise(INTEREST_SEEDS,shown,0)).toEqual(first)
    // A full cycle visits every seed exactly once.
    const seen=new Set<string>()
    let cursor=0
    for(let i=0;i<INTEREST_SEEDS.length;i++){
      const drawn=drawSurprise(INTEREST_SEEDS,[],cursor)
      seen.add(SEED_DISPLAY(drawn.seed))
      cursor=drawn.cursor
    }
    expect(seen.size).toBe(20)
  })
})
