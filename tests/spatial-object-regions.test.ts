import {describe,expect,it,vi} from 'vitest'
import {boxToPercent,fetchObjectRegions,isVersionId,mergeHotspots,regionAnchor} from '../src/spatial/object-regions'

// Contract-shaped fixture (docs/sam-object-discovery-contract.md). The
// version ID is synthetic and test-only; no Production result is implied.
const versionId=`version-${'a'.repeat(64)}`
const region=()=>({id:'cap-1:sam-1',box:{x:0.1,y:0.2,width:0.3,height:0.25},label:'Curved seat',editorialDetail:'A short human-reviewed observation of the curved seat.',product:null,provenance:{origin:'sam_detection',model:'sam-3.1',uncertainty:'model_estimate_not_identity',reviewed:true},confidence:0.9})
const payload=()=>({catalogId:'test-catalog-01',assetId:versionId,width:800,height:600,regions:[region()]})
const okJson=(json:unknown)=>({ok:true,json:async()=>json}) as Response

describe('object regions client',()=>{
  it('gates requests on exact version IDs',()=>{
    expect(isVersionId(versionId)).toBe(true)
    for(const id of ['curio-owner-08-v1','demo-curio-owner-08-v1','',`version-${'a'.repeat(63)}`,`version-${'g'.repeat(64)}`,'version-UPPER'])expect(isVersionId(id)).toBe(false)
  })

  it('returns validated regions for exact-version exhibits',async()=>{
    const fetch=vi.fn(async()=>okJson(payload()))
    const data=await fetchObjectRegions(versionId,fetch as unknown as typeof globalThis.fetch)
    expect(fetch).toHaveBeenCalledOnce()
    expect(data?.regions).toHaveLength(1)
    expect(data?.regions[0].label).toBe('Curved seat')
  })

  it('never requests for demo or malformed IDs',async()=>{
    const fetch=vi.fn(async()=>okJson(payload()))
    await expect(fetchObjectRegions('curio-owner-08-v1',fetch as unknown as typeof globalThis.fetch)).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('hides gracefully on HTTP errors, mismatch, drift and empty sets',async()=>{
    const run=async(json:unknown,ok=true,fetchImpl?:()=>Promise<Response>)=>{
      const fallback=async()=>({ok,json:async()=>json}) as Response
      return fetchObjectRegions(versionId,(fetchImpl??fallback) as unknown as typeof globalThis.fetch)
    }
    expect(await run(null,false)).toBeNull()
    expect(await run({error:'gone'},false)).toBeNull()
    expect(await run({...payload(),regions:[]})).toBeNull()
    expect(await run({...payload(),assetId:`version-${'b'.repeat(64)}`})).toBeNull()
    expect(await run({...payload(),regions:[{...region(),box:{x:0,y:0,width:0,height:0.1}}]})).toBeNull()
    expect(await run({...payload(),regions:[{...region(),provenance:{...region().provenance,reviewed:false}}]})).toBeNull()
    expect(await run({unexpected:'shape'})).toBeNull()
    expect(await run(null,true,async()=>{throw Error('offline')})).toBeNull()
  })

  it('maps normalized boxes to clamped percentages',()=>{
    expect(boxToPercent({x:0.1,y:0.2,width:0.3,height:0.4})).toEqual({left:'10%',top:'20%',width:'30%',height:'40%'})
    expect(boxToPercent({x:-0.5,y:0,width:2,height:1})).toEqual({left:'0%',top:'0%',width:'100%',height:'100%'})
  })

  it('anchors SAM boxes at their clamped centers',()=>{
    expect(regionAnchor({x:0.1,y:0.2,width:0.3,height:0.25})).toEqual({x:0.25,y:0.325})
    expect(regionAnchor({x:0.95,y:0.95,width:0.2,height:0.2})).toEqual({x:0.98,y:0.98})
  })

  it('keeps exact authored points and drops a SAM duplicate of the same object',()=>{
    const placed=mergeHotspots([{id:'authored-1',x:0.25,y:0.325}],[
      {id:'sam-1',box:{x:0.1,y:0.2,width:0.3,height:0.25}},
      {id:'sam-2',box:{x:0.55,y:0.5,width:0.2,height:0.2}},
    ])
    expect(placed.map(mark=>mark.id)).toEqual(['authored-1','sam-2'])
    expect(placed[0]).toMatchObject({x:0.25,y:0.325,authored:true})
    expect(placed[1]).toMatchObject({x:0.65,y:0.6,authored:false})
  })

  it('nudges stacked markers apart deterministically',()=>{
    const box={x:0.4,y:0.4,width:0.2,height:0.2}
    const first=mergeHotspots([],[{'id':'a',box},{'id':'b',box}])
    expect(first).toHaveLength(2)
    expect(first[0]).toMatchObject({x:0.5,y:0.5})
    expect(Math.hypot(first[1].x-first[0].x,first[1].y-first[0].y)).toBeGreaterThanOrEqual(0.045)
    expect(mergeHotspots([],[{'id':'a',box},{'id':'b',box}])).toEqual(first)
  })
})
