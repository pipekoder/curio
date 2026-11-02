import {describe,expect,it} from 'vitest'
import {INTEREST_SEEDS,SEED_DISPLAY,SUGGESTION_COUNT,drawSurprise,pickSuggestions} from '../src/spatial/prompt-library'

// Oracle transcribed from the Step 2 amendment. Display wording must match
// every seed exactly; any drift fails loudly here.
const SPECIFIED:[string,string][]=[
  ['Scandinavian furniture','craftsmanship and everyday living'],
  ['Warm minimalism','natural materials and atmosphere'],
  ['Vintage interiors','objects with history and character'],
  ['Contemporary living spaces','architecture and cultural influence'],
  ['Contemporary sculpture','form, texture and emotion'],
  ['Abstract art','color and visual expression'],
  ['Photography','places, memory and perspective'],
  ['Art and everyday objects','unexpected creative connections'],
  ['Contemporary fashion','personal identity and expression'],
  ['Timeless wardrobe pieces','silhouettes and craftsmanship'],
  ['Jewelry and adornment','symbolism and cultural traditions'],
  ['Textiles and fabrics','techniques and creative heritage'],
  ['Slow living','everyday rituals and meaningful objects'],
  ['Food and table culture','design and shared experiences'],
  ['Nature-inspired living','materials and sensory experiences'],
  ['Contemporary wellbeing','spaces, habits and lifestyles'],
  ['Japanese cities','architecture and everyday culture'],
  ['Mediterranean destinations','craftsmanship and local traditions'],
  ['Scandinavian landscapes','design, nature and ways of living'],
  ['Hidden urban places','independent culture and creative communities'],
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
      "I'm curious about Scandinavian furniture, especially its craftsmanship and connection to everyday living.")
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
