import {it,expect} from 'vitest'
import {rankLexicalSources,reciprocalRankFusion} from '../worker/cultural-ranking'
import type {ResearchSource} from '../worker/cultural-research'

const row=(id:string,relevance:number,excerpt:string,sourceQuality=.8):ResearchSource=>({id,url:`https://example.org/${id}`,origin:'https://example.org',retrievedAt:'2026-11-02T00:00:00.000Z',sha256:'a'.repeat(64),excerpt,passage:{id:`passage:${'b'.repeat(32)}`,start:0,end:excerpt.length,documentSha256:'a'.repeat(64),textSha256:'c'.repeat(64)},relevance,sourceQuality,quoteMatch:null,verification:'pending',rights:'pending',attribution:{author:null,publishedAt:null}})
it('uses deterministic RRF only with two meaningful lexical rankings',()=>{
  expect(reciprocalRankFusion([['a','b'],['b','a']],new Set(['a','b'])).map(row=>row.id)).toEqual(['a','b'])
  const ranked=rankLexicalSources('Scandinavian furniture',[row('a',.9,'Scandinavian furniture and daily life'),row('b',.8,'Furniture in Scandinavian interiors')])
  expect(ranked.mode).toBe('lexical_rrf')
  expect(ranked.results.map(row=>row.id)).toEqual(['a','b'])
  expect(rankLexicalSources('Scandinavian furniture',[row('a',.9,'Scandinavian furniture'),row('b',.8,'Scandinavian furniture',.1)],.5).mode).toBe('lexical_only')
})
it('reports lexical-only when no phrase ranking exists',()=>{
  const ranked=rankLexicalSources('Japanese minimalism',[row('a',.9,'Minimalism in Japanese interiors'),row('b',.7,'Japan and minimal design')])
  expect(ranked.mode).toBe('lexical_only')
})
