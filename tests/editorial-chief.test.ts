import {afterEach,expect,it,vi} from 'vitest'
import {evaluateChiefEditor,chiefEditorText} from '../shared/editorial-chief'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import {parsePilotVersions} from '../worker/editorial-sources'
import {generateEditorialResult} from '../worker/editorial'
import {externalFixture} from './hybrid-fixtures'
import type {ExternalAssetApprovals} from '../shared/url-policy'

const asset=`version-${'a'.repeat(64)}`
const sources:EditorialSource[]=[
 {id:`${asset}:brand_name`,assetId:asset,kind:'brand_name',label:'Brand name',value:'Northline Studio',authority:'owner_supplied_mockup',source:'content_studio'},
 {id:`${asset}:product_description`,assetId:asset,kind:'product_description',label:'Product description',value:'Owner supplied fictional seating concept.',authority:'owner_supplied_mockup',source:'content_studio'},
]
const contexts:VisualContext[]=[{assetId:asset,versionId:asset,imageSha256:'b'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',uncertainty:'appearance_not_verified_fact',observations:{subjects:['seating','lighting'],materialAppearance:['fabric-like'],environments:['interior-like'],relationships:['light-and-shadow','curve-and-space']}}]
const plan={qualityVersion:3,title:'The Architecture of Attention',deck:'Light and space guide attention from foreground to background.',features:[{catalogId:'catalog-test',assetId:asset,headline:'Where Light Meets Seating',narrative:'A band of light frames the seating, while shadow separates its rounded form from the background.',observationKeys:['subjects.seating','relationships.light-and-shadow'],discoveryQuestion:'How might the curve redirect attention across the surrounding space?',sourceIds:sources.map(source=>source.id),layout:'hero',motion:'still',theme:'Scandinavian'}],connections:[]}
afterEach(()=>vi.unstubAllGlobals())

it('accepts natural, source-cited visual storytelling without a closed vocabulary',()=>{
 expect(chiefEditorText('A band of light frames the seating, while shadow changes the rhythm.')).toBe(true)
 expect(evaluateChiefEditor(plan,contexts,sources)).toBeNull()
})

it('rejects invented commerce, unsupported observations, source identities in prose and cross-asset citations',()=>{
 expect(evaluateChiefEditor({...plan,features:[{...plan.features[0],narrative:'Buy this award-winning seating form now.'}]},contexts,sources)).toBe('unsafe_editorial_language')
 expect(evaluateChiefEditor({...plan,title:'Northline Studio and the Architecture of Attention'},contexts,sources)).toBe('factual_source_in_prose')
 expect(evaluateChiefEditor({...plan,features:[{...plan.features[0],observationKeys:['subjects.architecture']}]},contexts,sources)).toBe('unsupported_observation')
 expect(evaluateChiefEditor({...plan,features:[{...plan.features[0],sourceIds:['missing:source']}]},contexts,sources)).toBe('unsupported_source')
})

it('requires exactly six unique exact-version pilot IDs',()=>{
 const ids=Array.from({length:6},(_,index)=>`version-${String(index).repeat(64)}`)
 expect(parsePilotVersions(ids.join(','))).toEqual(ids)
 expect(parsePilotVersions(ids.slice(0,5).join(','))).toBeNull()
 expect(parsePilotVersions([...ids.slice(0,5),ids[0]].join(','))).toBeNull()
 expect(parsePilotVersions('asset-not-a-version')).toBeNull()
})

it('sends facts and observations as separate bounded inputs in one Chief Editor request',async()=>{
 const item={...externalFixture,id:'catalog-test',image:{...externalFixture.image,id:asset},permissions:{...externalFixture.permissions,aiAnalysis:{status:'approved' as const,evidence:'docs/TEST_ONLY.md'}}}
 const approvals:ExternalAssetApprovals={[asset]:{url:item.image.externalUrl!,sourcePage:item.provenance.originalSourcePage!,displayEvidence:item.permissions.display.evidence!}}
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content)
  expect(body.model).toBe('muse-spark-1.3');expect(body.messages[0].content).toContain('Chief Editor policy v1')
  expect(input.factualSources).toEqual(sources);expect(input.catalog[0].visualContext).toEqual(contexts[0])
  expect(input.catalog[0]).not.toHaveProperty('name');expect(input.catalog[0]).not.toHaveProperty('description');expect(input).not.toHaveProperty('visualVocabulary')
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],usage:{prompt_tokens:200,completion_tokens:100,total_tokens:300}})
 });vi.stubGlobal('fetch',send)
 const prefs={interests:'light and attention',aesthetics:['Scandinavian' as const],allocations:{home:100,fashion:0,travel:0},mode:'Focused' as const,consent:true}
 const result=await generateEditorialResult(prefs,[item],'FAKE',contexts,[],approvals,sources)
 expect(result.plan).toEqual(plan);expect(result.measurement.usage?.totalTokens).toBe(300);expect(send).toHaveBeenCalledOnce()
})
