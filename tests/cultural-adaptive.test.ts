import {it,expect,vi} from 'vitest'
import {adaptiveInput,executeAdaptiveResearch} from '../worker/cultural-adaptive'
import type {ResearchSource} from '../worker/cultural-research'
import type {CulturalResearchPlan} from '../worker/cultural-planner'

const version=`version-${'a'.repeat(64)}`
const input=adaptiveInput.parse({consent:true,prompt:'Explore furniture and everyday design',assetVersionIds:[version],rounds:[['https://example.org/a'],['https://example.org/b']]})
const plan:CulturalResearchPlan={decision:'research',reason:'relevant_gap',questions:[{question:'How does furniture shape everyday life?',discipline:'design',relevance:5,evidenceNeed:4,relation:'comparison'}]}
const source=(label:string):ResearchSource=>({id:`source:${label}`,url:`https://example.org/${label}`,origin:'https://example.org',retrievedAt:'2026-11-02T00:00:00.000Z',sha256:(label==='a'?'a':'b').repeat(64),excerpt:`Furniture design in ${label}.`,passage:{id:`passage:${(label==='a'?'a':'b').repeat(32)}`,start:0,end:`Furniture design in ${label}.`.length,documentSha256:(label==='a'?'a':'b').repeat(64),textSha256:'c'.repeat(64)},relevance:.8,sourceQuality:.8,quoteMatch:null,verification:'pending',rights:'pending',attribution:{author:null,publishedAt:null}})
it('stops immediately when existing evidence is enough',async()=>{
  const retrieve=vi.fn(async()=>[source('a')])
  const result=await executeAdaptiveResearch(input,{plan:async()=>({...plan,decision:'stop_existing_evidence',reason:'sufficient',questions:[]}),retrieve})
  expect(result.status).toBe('existing_sufficient');expect(retrieve).not.toHaveBeenCalled()
})
it('runs at most two operator-supplied URL rounds and returns candidate evidence only',async()=>{
  const retrieve=vi.fn(async(_query:string,urls:string[])=>[source(urls[0].endsWith('/a')?'a':'b')])
  const result=await executeAdaptiveResearch(input,{plan:async()=>plan,retrieve})
  expect(retrieve).toHaveBeenCalledTimes(2)
  expect(result.status).toBe('candidate_review_required')
  expect(result.pack).toMatchObject({status:'candidate',assetVersionIds:[version],claims:[],relationships:[]})
})
it('narrows conflicts and insufficient evidence without approving sources',async()=>{
  const retrieve=vi.fn(async()=>[source('a')])
  expect((await executeAdaptiveResearch(input,{plan:async()=>({...plan,reason:'conflict'}),retrieve})).status).toBe('narrowed')
  expect(retrieve).toHaveBeenCalledTimes(1)
  expect((await executeAdaptiveResearch(adaptiveInput.parse({...input,rounds:[input.rounds[0]]}),{plan:async()=>plan,retrieve})).pack).toBeNull()
})
it('uses the actual fused lexical ranking to order candidate sources',async()=>{
  const retrieve=vi.fn(async(_query:string,urls:string[])=>[source(urls[0].endsWith('/a')?'a':'b')])
  const rank=vi.fn(async()=>({mode:'lexical_rrf',results:[{id:'source:b',score:.04},{id:'source:a',score:.03}]}))
  const result=await executeAdaptiveResearch(input,{plan:async()=>plan,retrieve,rank})
  expect(result.mode).toBe('lexical_rrf')
  expect(result.pack?.sourceIds).toEqual(['source:b','source:a'])
})
