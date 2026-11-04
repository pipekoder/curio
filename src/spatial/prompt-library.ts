// Static curated interest seeds: exactly 20 approved {subject, direction}
// pairs. Display text preserves the specified wording exactly; each seed
// maps to a hand-written natural sentence for the prompt field. Selection is
// client-only logic over this eligible content — never an AI call.
//
// Hackathon Demo curation vocabulary: every subject names a region
// (Swedish, Scandinavian, Nordic, Japanese, Asian) and a category
// (interior, home, ceramic, clothing, travel), optionally with a material
// (ceramic, wood, concrete, linen, glass, stone, metal) or a style
// (minimal, quiet, natural, contemporary, handcrafted, timeless). The pill
// shows "subject · direction"; clicking it fills the prompt field with the
// sentence. The refresh button draws one new seed outside the current pick;
// typed input stays unrestricted. tests/spatial-prompt-library.test.ts pins
// the exact list and the vocabulary rule.
export type InterestSeed={subject:string;direction:string;sentence:string}

const seed=(subject:string,direction:string,sentence:string):InterestSeed=>({subject,direction,sentence})

export const INTEREST_SEEDS:readonly InterestSeed[]=[
  // Nordic and Scandinavian interiors and homes (8)
  seed('Quiet Nordic interiors','wood, light and calm spaces',
    "I'm curious about quiet Nordic interiors, especially their wood, light and calm spaces."),
  seed('Swedish homes','shaped by wood and light',
    "I'm curious about Swedish homes, especially those shaped by wood and light."),
  seed('Nordic concrete interiors','natural materials and texture',
    "I'm curious about Nordic concrete interiors, especially their natural materials and texture."),
  seed('Nordic stone interiors','quiet monumental calm',
    "I'm curious about Nordic stone interiors, especially their quiet monumental calm."),
  seed('Handcrafted Scandinavian interiors','natural materials and craft',
    "I'm curious about handcrafted Scandinavian interiors, especially their natural materials and craft."),
  seed('Nordic homes in glass and light','craft and transparency',
    "I'm curious about Nordic homes in glass and light, especially their craft and transparency."),
  seed('Timeless Nordic homes','metal, wood and honest craft',
    "I'm curious about timeless Nordic homes, especially their metal, wood and honest craft."),
  seed('Swedish country homes','wood, stone and craft',
    "I'm curious about Swedish country homes, especially their wood, stone and craft."),
  // Japanese and Asian interiors and homes (6)
  seed('Minimal Japanese homes','stone, wood and shadow',
    "I'm curious about minimal Japanese homes, especially their stone, wood and shadow."),
  seed('Japanese wood interiors','handcrafted warmth',
    "I'm curious about Japanese wood interiors, especially their handcrafted warmth."),
  seed('Natural Japanese interiors','light and emptiness',
    "I'm curious about natural Japanese interiors, especially their light and emptiness."),
  seed('Japanese concrete homes','architecture and stillness',
    "I'm curious about Japanese concrete homes, especially their architecture and stillness."),
  seed('Asian ceramic homes','vessels and quiet rituals',
    "I'm curious about Asian ceramic homes, especially their vessels and quiet rituals."),
  seed('Scandinavian home rituals','morning light and linen',
    "I'm curious about Scandinavian home rituals, especially their morning light and linen."),
  // Ceramic, clothing and travel (6)
  seed('Japanese ceramic rituals','tea bowls and morning routines',
    "I'm curious about Japanese ceramic rituals, especially their tea bowls and morning routines."),
  seed('Scandinavian clothing','everyday life and honest fabrics',
    "I'm curious about Scandinavian clothing, especially its everyday life and honest fabrics."),
  seed('Japanese travel','design and architecture',
    "I'm curious about Japanese travel, especially its design and architecture."),
  seed('Scandinavian linen clothing','timeless everyday wear',
    "I'm curious about Scandinavian linen clothing, especially its timeless everyday wear."),
  seed('Contemporary Nordic travel','cabins and coastlines',
    "I'm curious about contemporary Nordic travel, especially its cabins and coastlines."),
  seed('Timeless Swedish clothing','linen layers and quiet tailoring',
    "I'm curious about timeless Swedish clothing, especially its linen layers and quiet tailoring."),
]

export const SEED_DISPLAY=(seed:InterestSeed):string=>`${seed.subject} · ${seed.direction}`
export const SUGGESTION_COUNT=4

// Four distinct seeds, never repeating the previous set. Pure and
// synchronous: no model, no fetch, injectable randomness for tests.
export function pickSuggestions(
  pool:readonly InterestSeed[]=INTEREST_SEEDS,
  exclude:readonly InterestSeed[]=[],
  count=SUGGESTION_COUNT,
  random:()=>number=Math.random,
):InterestSeed[]{
  const excluded=new Set(exclude.map(SEED_DISPLAY))
  const candidates=pool.filter(seed=>!excluded.has(SEED_DISPLAY(seed)))
  const source=candidates.length>=count?candidates:[...pool]
  const picks:InterestSeed[]=[]
  const remaining=[...source]
  while(picks.length<count&&remaining.length){
    const index=Math.floor(random()*remaining.length)
    picks.push(remaining.splice(index,1)[0])
  }
  return picks
}

// Surprise Me: deterministic rotation through eligible seeds (step 7 is
// coprime to 20, so a full cycle never repeats early), skipping whatever is
// currently shown. No model call; the caller owns the cursor.
export function drawSurprise(
  pool:readonly InterestSeed[]=INTEREST_SEEDS,
  shown:readonly InterestSeed[]=[],
  cursor=0,
):{seed:InterestSeed;cursor:number}{
  const shownDisplays=new Set(shown.map(SEED_DISPLAY))
  let next=cursor
  for(let attempt=0;attempt<pool.length;attempt++){
    next=(next+7)%pool.length
    if(!shownDisplays.has(SEED_DISPLAY(pool[next])))return {seed:pool[next],cursor:next}
  }
  return {seed:pool[next],cursor:next}
}
