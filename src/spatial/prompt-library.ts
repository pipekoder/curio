// Static curated interest seeds: exactly 20 approved {subject, direction}
// pairs. Display text preserves the specified wording exactly; each seed
// maps to a hand-written natural sentence for the prompt field. Selection is
// client-only logic over this eligible content — never an AI call.
export type InterestSeed={subject:string;direction:string;sentence:string}

const seed=(subject:string,direction:string,sentence:string):InterestSeed=>({subject,direction,sentence})

export const INTEREST_SEEDS:readonly InterestSeed[]=[
  // Interior (4)
  seed('Scandinavian furniture','craftsmanship and everyday living',
    "I'm curious about Scandinavian furniture, especially its craftsmanship and connection to everyday living."),
  seed('Warm minimalism','natural materials and atmosphere',
    "I'm curious about warm minimalism, especially its natural materials and atmosphere."),
  seed('Vintage interiors','objects with history and character',
    "I'm curious about vintage interiors, especially objects with history and character."),
  seed('Contemporary living spaces','architecture and cultural influence',
    "I'm curious about contemporary living spaces, especially their architecture and cultural influence."),
  // Art (4)
  seed('Contemporary sculpture','form, texture and emotion',
    "I'm curious about contemporary sculpture, especially its form, texture and emotion."),
  seed('Abstract art','color and visual expression',
    "I'm curious about abstract art, especially its color and visual expression."),
  seed('Photography','places, memory and perspective',
    "I'm curious about photography, especially places, memory and perspective."),
  seed('Art and everyday objects','unexpected creative connections',
    "I'm curious about art and everyday objects, especially their unexpected creative connections."),
  // Fashion (4)
  seed('Contemporary fashion','personal identity and expression',
    "I'm curious about contemporary fashion, especially personal identity and expression."),
  seed('Timeless wardrobe pieces','silhouettes and craftsmanship',
    "I'm curious about timeless wardrobe pieces, especially their silhouettes and craftsmanship."),
  seed('Jewelry and adornment','symbolism and cultural traditions',
    "I'm curious about jewelry and adornment, especially their symbolism and cultural traditions."),
  seed('Textiles and fabrics','techniques and creative heritage',
    "I'm curious about textiles and fabrics, especially their techniques and creative heritage."),
  // Lifestyle (4)
  seed('Slow living','everyday rituals and meaningful objects',
    "I'm curious about slow living, especially everyday rituals and meaningful objects."),
  seed('Food and table culture','design and shared experiences',
    "I'm curious about food and table culture, especially design and shared experiences."),
  seed('Nature-inspired living','materials and sensory experiences',
    "I'm curious about nature-inspired living, especially materials and sensory experiences."),
  seed('Contemporary wellbeing','spaces, habits and lifestyles',
    "I'm curious about contemporary wellbeing, especially spaces, habits and lifestyles."),
  // Travel (4)
  seed('Japanese cities','architecture and everyday culture',
    "I'm curious about Japanese cities, especially their architecture and everyday culture."),
  seed('Mediterranean destinations','craftsmanship and local traditions',
    "I'm curious about Mediterranean destinations, especially their craftsmanship and local traditions."),
  seed('Scandinavian landscapes','design, nature and ways of living',
    "I'm curious about Scandinavian landscapes, especially their design, nature and ways of living."),
  seed('Hidden urban places','independent culture and creative communities',
    "I'm curious about hidden urban places, especially their independent culture and creative communities."),
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
