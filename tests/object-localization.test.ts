// @vitest-environment node
import {it,expect} from 'vitest'
import {rankObjectCandidates,selectLocalizationCandidate,localizationConcept,conceptDetail,samConceptBody,combineLocalizationCaptures} from '../shared/object-localization'
import {understanding} from '../worker/asset-contracts'
import {mockUnderstanding} from '../worker/asset-classifier'
const observed={objects:['pendant lamp','side table','framed wall art','armchair'],editorialRelevance:.8,objectCandidates:localizationConcept.options.map((concept,objectIndex)=>({concept,objectIndex,visualConfidence:.8,editorialRelevance:.8}))}
it('ranks a bounded Muse-derived set by intent and evidenced visual/editorial relevance',()=>{
 for(const concept of localizationConcept.options){const result=selectLocalizationCandidate(observed,`Explore ${concept}`);expect(result.concept).toBe(concept);expect(result.ranked.length).toBeLessThanOrEqual(3);expect(result.maxRequests).toBe(1);expect(result.detailId).toBe(conceptDetail(concept))}
 expect(selectLocalizationCandidate(observed,'Explore lighting').concept).toBe('lamp')
})
it('keeps old structured object observations reusable without inventing candidates or extra Muse calls',()=>{
 expect(rankObjectCandidates({objects:['armchair'],editorialRelevance:.8},'seating')[0]).toMatchObject({concept:'seating',source:'existing_muse_object_label'})
 expect(rankObjectCandidates({objects:['table lamp'],editorialRelevance:.8},'tables').map(c=>c.concept)).toEqual(['lamp'])
 expect(()=>selectLocalizationCandidate({objects:[],editorialRelevance:.8},'find a lamp')).toThrow()
 expect(()=>selectLocalizationCandidate(observed,'lamps','invented product')).toThrow()
})
it('rejects unsupported, weak, out-of-range and unbounded candidate evidence',()=>{
 expect(rankObjectCandidates({...observed,objectCandidates:[{concept:'lamp',objectIndex:3,visualConfidence:1,editorialRelevance:1}]},'lamp')).toEqual([])
 expect(rankObjectCandidates({...observed,objectCandidates:[{concept:'lamp',objectIndex:0,visualConfidence:.1,editorialRelevance:1}]},'lamp')).toEqual([])
 expect(()=>rankObjectCandidates({...observed,objectCandidates:[{concept:'lamp',objectIndex:99,visualConfidence:1,editorialRelevance:1}]},'lamp')).toThrow()
 expect(()=>rankObjectCandidates(observed,'a'.repeat(1001))).toThrow()
 expect(()=>rankObjectCandidates({...observed,objectCandidates:Array(5).fill(observed.objectCandidates[0])},'lamp')).toThrow()
 const base=mockUnderstanding(`version-${'a'.repeat(64)}`)
 expect(understanding.parse({...base,...observed}).objectCandidates).toHaveLength(4)
 expect(understanding.parse(base).objectCandidates).toBeUndefined()
})
it('uses exactly one noun phrase and image per SAM request; no batch field or arbitrary instructions',()=>{
 for(const concept of localizationConcept.options){const body=samConceptBody(concept,'data:image/jpeg;base64,TEST');expect(body.model).toBe('sam-3.1');expect(body.input).toHaveLength(1);expect(body.input[0].content).toEqual([{type:'input_text',text:concept},{type:'input_image',image_url:'data:image/jpeg;base64,TEST'}])}
 expect(()=>samConceptBody(['lamp','table'],'data:image/jpeg;base64,TEST')).toThrow()
})
it('preserves cross-concept identity and raw geometry, flags overlap without forced merging',()=>{
 const capture=(concept:'lamp'|'table')=>({assetId:'asset-test',versionId:`version-${'a'.repeat(64)}`,imageSha256:'b'.repeat(64),concept,result:{adId:'test',assetId:'asset-test',width:1600,height:1201,source:'sam_detection' as const,model:'sam-3.1' as const,regions:[{id:'sam-1',detailId:conceptDetail(concept),box:{x:.2,y:.2,width:.4,height:.4},confidence:null,uncertainty:'model_estimate_not_identity' as const}]}})
 const a=capture('lamp'),b=capture('table'),before=JSON.stringify([a,b]),combined=combineLocalizationCaptures([a,b])
 expect(combined.regions.map(r=>r.id)).toEqual(['loc-lamp-sam-1','loc-table-sam-1'])
 expect(new Set(combined.regions.map(r=>r.identityKey)).size).toBe(2)
 expect(combined.regions.map(r=>r.rawId)).toEqual(['sam-1','sam-1'])
 expect(combined.overlaps[0].decision).toBe('remain_separate_pending_review')
 expect(JSON.stringify([a,b])).toBe(before);expect(combined.raw[0].result.regions).toEqual(a.result.regions)
 expect(()=>combineLocalizationCaptures([a,{...b,imageSha256:'c'.repeat(64)}])).toThrow()
 expect(()=>combineLocalizationCaptures([a,a])).toThrow()
 expect(combineLocalizationCaptures([]).regions).toEqual([])
})
it('maps positive MOCK boxes for lamps, tables, wall art and seating without asserting live detections',async()=>{
 const {normGeometryRecord}=await import('../dev/norm-asset')
 const {normalizeSamResult}=await import('../worker/sam-client')
 const ad=await normGeometryRecord()
 for(const concept of localizationConcept.options){
  const result=normalizeSamResult({media:'image',outcome:{status:'completed'},revision:1,diagnostics:[],rawOutput:'',records:[{kind:'box',order:0,objectId:'1',left:100,top:200,right:500,bottom:700}]},ad,conceptDetail(concept))
  expect(result.regions[0]).toMatchObject({id:'sam-1',detailId:conceptDetail(concept),box:{x:100/1600,y:200/1201,width:400/1600,height:500/1201},uncertainty:'model_estimate_not_identity'})
 }
})
