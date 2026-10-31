import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'

const baseline=JSON.parse(readFileSync('tests/fixtures/intervals-of-stillness-live.json','utf8')) as {title:string;deck:string;features:{headline:string;narrative:string;discoveryQuestion:string}[];observedResult:{source:string;retrieval:string;latencyMs:number;totalTokens:number;reservedUnits:number}}

it('preserves the owner-supplied live editorial text without filling missing plan fields',()=>{
 expect(baseline.title).toBe('Intervals of Stillness')
 expect(baseline.deck).toBe('Three quiet interiors where shadow, curve, and interval teach the eye to linger a little longer.')
 expect(baseline.features.map(feature=>feature.headline)).toEqual(['A Room That Breathes In Curves','What We Carry Through Light','Shelter Found In The Interval'])
 expect(baseline.features[0].narrative).toContain('The appearance here appears fabric-like in one interval and appears stone-like in another')
 expect(baseline.features[2].discoveryQuestion).toBe('Follow the sheltered path in the image — what waits past the brightest point?')
 expect(baseline.observedResult).toEqual({source:'meta',retrieval:'d1',latencyMs:13094,totalTokens:15707,reservedUnits:4})
 expect(baseline.features.every(feature=>!('assetId' in feature)&&!('reviewScore' in feature))).toBe(true)
})

it('records reproducible qualitative signals without inventing Reviewer scores or model evidence',()=>{
 const narratives=baseline.features.map(feature=>feature.narrative.toLowerCase())
 expect(narratives.every(text=>/light|shadow/.test(text))).toBe(true)
 expect(narratives.filter(text=>/appears|appearance/.test(text))).toHaveLength(2)
 expect(narratives[0]).toContain('appearance here appears')
 expect(baseline.features.every(feature=>feature.discoveryQuestion.endsWith('?'))).toBe(true)
})
