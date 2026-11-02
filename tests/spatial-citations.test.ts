import {describe,expect,it} from 'vitest'
import {parseStagedPlan} from '../src/spatial/edition'
import {
  CITATIONS_VERSION,CULTURAL_EVIDENCE_V3,citationsForFeature,fetchCitations,featureHasCitedClaims,
} from '../src/spatial/citations'

const feature={
  catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',
  headline:'A closer look: Ochre Arc Chair',narrative:'A subjective visual reading of drawn forms.',
  layout:'hero',motion:'still',theme:'Quiet Luxury',
} as const
const plan={title:'A testing promenade',deck:'Two grounded exhibits.',features:[feature]}

const citationsResponse={
  version:CITATIONS_VERSION,
  features:[{
    featureIndex:0,catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',
    headline:'A closer look: Ochre Arc Chair',
    citations:[{
      claimId:'claim:ritual',sourceId:'source:example:claim:ritual',
      narrativeText:'An approved editorial comparison about an everyday ritual.',
      claimKind:'comparison',evidenceStatus:'operator_reviewed',reviewStatus:'approved',
      sources:[{
        sourceId:'source:example',passageId:'passage:example',
        canonicalUrl:'https://example.org/article',publication:'Example Review',
        support:{kind:'reviewed_paraphrase',text:'An approved editorial comparison about an everyday ritual.'},
      }],
    }],
  }],
}
const fetchJson=(status:number,json:unknown)=>(
  async ()=>({ok:status>=200&&status<300,json:async()=>json})
) as unknown as typeof fetch

describe('staged plan adapter',()=>{
  it('parses V2.1 plans exactly as the strict contract',()=>{
    expect(parseStagedPlan(plan)).toEqual(plan)
  })
  it('carries V3 evidence fields opaquely without weakening known fields',()=>{
    const v3={...plan,culturalEvidenceVersion:CULTURAL_EVIDENCE_V3,
      features:[{...feature,culturalClaims:[{sourceId:'source:example'}]}]}
    const parsed=parseStagedPlan(v3)
    expect(parsed.culturalEvidenceVersion).toBe(CULTURAL_EVIDENCE_V3)
    expect(parsed.features[0].culturalClaims).toEqual([{sourceId:'source:example'}])
    expect(parsed.features[0].headline).toBe(feature.headline)
  })
  it('still rejects malformed known fields and unknown non-V3 keys',()=>{
    expect(()=>parseStagedPlan({...plan,title:''})).toThrow()
    expect(()=>parseStagedPlan({...plan,features:[{...feature,headline:'<bad>'}]})).toThrow()
    expect(()=>parseStagedPlan({...plan,sneaky:'nope'})).toThrow()
    expect(()=>parseStagedPlan({...plan,features:[{...feature,sneaky:'nope'}]})).toThrow()
    expect(()=>parseStagedPlan(null)).toThrow()
  })
})

describe('citations lookup',()=>{
  it('returns validated citations for a reviewed response',async()=>{
    const response=await fetchCitations(plan,fetchJson(200,citationsResponse))
    expect(response?.version).toBe(CITATIONS_VERSION)
    const citations=citationsForFeature(response!,{featureIndex:0,catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1'})
    expect(citations).toHaveLength(1)
    expect(citations![0].sources[0].publication).toBe('Example Review')
  })
  it('matches citations to the exact exhibit, not a neighbor',async()=>{
    const response=await fetchCitations(plan,fetchJson(200,citationsResponse))
    expect(citationsForFeature(response!,{featureIndex:1,catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1'})).toBeNull()
    expect(citationsForFeature(response!,{featureIndex:0,catalogId:'other',assetId:'curio-owner-08-v1'})).toBeNull()
    expect(citationsForFeature(response!,{featureIndex:0,catalogId:'demo-curio-owner-08-v1',assetId:'other'})).toBeNull()
  })
  it('fails closed on HTTP errors, bad versions, unapproved status, and bad links',async()=>{
    expect(await fetchCitations(plan,fetchJson(404,{error:'gone'}))).toBeNull()
    expect(await fetchCitations(plan,fetchJson(503,{error:'disabled'}))).toBeNull()
    expect(await fetchCitations(plan,fetchJson(200,{...citationsResponse,version:'wrong'}))).toBeNull()
    const unapproved=structuredClone(citationsResponse)
    unapproved.features[0].citations[0].reviewStatus='pending'
    expect(await fetchCitations(plan,fetchJson(200,unapproved))).toBeNull()
    const badLink=structuredClone(citationsResponse)
    badLink.features[0].citations[0].sources[0].canonicalUrl='javascript:alert(1)'
    expect(await fetchCitations(plan,fetchJson(200,badLink))).toBeNull()
    const offline=(async()=>{throw new Error('offline')}) as unknown as typeof fetch
    expect(await fetchCitations(plan,offline)).toBeNull()
  })
  it('gates the Sources affordance on the V3 marker plus bound claims',()=>{
    const v3={...plan,culturalEvidenceVersion:CULTURAL_EVIDENCE_V3,
      features:[{...feature,culturalClaims:[{sourceId:'source:example'}]}]}
    expect(featureHasCitedClaims(v3,0)).toBe(true)
    expect(featureHasCitedClaims(v3,1)).toBe(false)
    expect(featureHasCitedClaims(plan,0)).toBe(false)
    expect(featureHasCitedClaims({...plan,culturalEvidenceVersion:CULTURAL_EVIDENCE_V3,features:[feature]},0)).toBe(false)
    expect(featureHasCitedClaims(null,0)).toBe(false)
  })
})
