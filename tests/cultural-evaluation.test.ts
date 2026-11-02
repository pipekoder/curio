import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {assessCulturalSufficiency} from '../worker/cultural-planner'
import {rankLexicalSources} from '../worker/cultural-ranking'
import type {ResearchSource} from '../worker/cultural-research'

it('keeps the paired evaluation reproducible without inventing a V3 model result',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/cultural-v3-evaluation.json','utf8')) as {scenarios:{id:string;prompt:string}[];rubric:string[];method:string}
 expect(fixture.scenarios).toHaveLength(10)
 expect(new Set(fixture.scenarios.map(row=>row.id)).size).toBe(10)
 expect(fixture.scenarios.every(row=>row.prompt.length>20)).toBe(true)
 expect(fixture.rubric).toContain('citation accuracy')
 expect(fixture.method).toContain('No paid comparison has been run')
})
it('narrows when evidence remains insufficient and reports lexical-only without a phrase match',()=>{
 const plan={decision:'research' as const,reason:'relevant_gap' as const,questions:[{question:'What historical relationship is documented?',discipline:'history' as const,relevance:5,evidenceNeed:5,relation:'historical_relationship' as const}]}
 expect(assessCulturalSufficiency(plan,[{sourceId:'one',relevance:.8}],0).action).toBe('narrow')
 const source={id:'one',sourceQuality:1,relevance:.8,excerpt:'A different account of an everyday object.'} as ResearchSource
 expect(rankLexicalSources('historical relationship',[source]).mode).toBe('lexical_only')
})
