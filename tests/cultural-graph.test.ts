import {it,expect,vi} from 'vitest'
import {evaluateRelationshipCandidates,museRelationshipCandidates,relationshipsForTopic} from '../worker/cultural-graph'
import {CULTURAL_EVIDENCE_VERSION,validateCulturalEvidence} from '../shared/cultural-evidence'

const version=`version-${'a'.repeat(64)}`,passage=`passage:${'b'.repeat(32)}`
const pack=()=>validateCulturalEvidence({version:CULTURAL_EVIDENCE_VERSION,id:'pack:graph',createdAt:'2026-11-02T00:00:00.000Z',assetVersionIds:[version],sourceIds:['source:one'],sources:[{id:'source:one',canonicalUrl:'https://example.org/article',origin:'https://example.org',retrievedAt:'2026-11-02T00:00:00.000Z',sha256:'c'.repeat(64),author:null,publication:null,publishedAt:null,rights:'approved_for_paraphrase',verification:'operator_reviewed'}],passages:[{id:passage,sourceId:'source:one',text:'A reviewed passage.',documentSha256:'c'.repeat(64),start:0,end:19}],claims:[{id:'claim:one',text:'A reviewed claim.',kind:'factual',assetVersionIds:[version],passageIds:[passage],status:'reviewed',conflict:null}],relationships:[{id:'relation:one',from:'object:chair',to:'movement:functionalism',type:'documented',claimIds:['claim:one'],confidence:.8}],status:'approved',reviewRevision:1,reviewHistory:[{revision:1,action:'approve',at:'2026-11-02T00:00:00.000Z',actor:'catalog-operator'}]},[version])
const candidate=(polarity:'supports'|'contradicts')=>({from:'object:chair',to:'movement:functionalism',type:'documented',claimIds:['claim:one'],confidence:.8,polarity})
it('deduplicates candidates, exposes conflicts and never auto-approves',()=>{
  const result=evaluateRelationshipCandidates([candidate('supports'),candidate('supports')],pack())
  expect(result).toMatchObject({approved:false,conflicts:[]});expect(result.candidates).toHaveLength(1)
  expect(evaluateRelationshipCandidates([candidate('supports'),candidate('contradicts')],pack()).conflicts).toHaveLength(1)
  expect(()=>evaluateRelationshipCandidates([{...candidate('supports'),claimIds:['claim:missing']}],pack())).toThrow()
  expect(relationshipsForTopic(pack(),'chair')).toHaveLength(1)
})
it('reserves before one mocked Muse candidate call',async()=>{
  const reserve=vi.fn(async()=>true),fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify([candidate('supports')])}}]}))) as unknown as typeof fetch
  expect((await museRelationshipCandidates(pack(),'mock-key',reserve,fetcher)).approved).toBe(false)
  expect(reserve).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledOnce()
  await expect(museRelationshipCandidates(pack(),'mock-key',async()=>false,fetcher)).rejects.toThrow('budget')
  await expect(museRelationshipCandidates({...pack(),claims:[{...pack().claims[0],status:'pending'}]},'mock-key',reserve,fetcher)).rejects.toThrow('not reviewed')
  expect(fetcher).toHaveBeenCalledOnce()
})
