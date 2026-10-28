import { expect,it,vi,afterEach } from 'vitest'
import { evaluateEditorialV2 } from '../shared/editorial-v2'
import { authoredVisualContext } from '../shared/visual-observations'
import { catalog } from '../shared/catalog'
import { eligibleReaderRecords,resolvePublishedLibrary } from '../shared/reader-media'
import { validateOriginalPlan } from '../shared/editorial'
import { generateEditorialResult } from '../worker/editorial'
import { externalFixture, testExternalApprovals } from './hybrid-fixtures'
import { readFileSync } from 'node:fs'
const contexts=catalog.flatMap(a=>{const v=authoredVisualContext(a);return v?[v]:[]})
const plan={qualityVersion:2 as const,title:'The Architecture of Light',deck:'Look at the shade and the space around the silhouette.',features:[
 {catalogId:'home-lamp',assetId:'asset-home-lamp-v1',headline:'How shade frames light',narrative:'The shade holds light around the rounded silhouette.',observationKeys:['subjects.lighting' as const,'relationships.light-and-shadow' as const],discoveryQuestion:'How might shadow frame the seating in another room?',layout:'hero' as const,motion:'still' as const,theme:'Scandinavian'},
 {catalogId:'home-chair',assetId:'asset-home-chair-v1',headline:'Space around seating',narrative:'The rounded seating leaves space around the silhouette.',observationKeys:['subjects.seating' as const],discoveryQuestion:'How might curves guide the eye around another surface?',layout:'split' as const,motion:'reveal' as const,theme:'Quiet Luxury'}],connections:[{fromAssetId:'asset-home-lamp-v1',toAssetId:'asset-home-chair-v1',thread:'Compare the space around the shade with the space around seating.'}]}
const prefs={interests:'light and space',aesthetics:['Scandinavian' as const],allocations:{home:100,fashion:0,travel:0},mode:'Focused' as const,consent:true}
afterEach(()=>vi.unstubAllGlobals())
it('accepts grounded natural descriptions and meaningful visual discovery',()=>{
 expect(evaluateEditorialV2(plan,contexts)).toBeNull()
 expect(validateOriginalPlan(plan,catalog,prefs)).toEqual(plan)
})
it('rejects generic prose, unsupported identity/material claims, irrelevant discoveries and fabricated evidence',()=>{
 expect(evaluateEditorialV2({...plan,title:'quiet light spacious calm'},contexts)).toBe('generic_headline')
 expect(evaluateEditorialV2({...plan,features:[{...plan.features[0],narrative:'Imagine gentle glow drifting through open space toward stillness and calm.'}]},contexts)).toBe('generic_description')
 for(const narrative of ['Designed by Norm Architects.','The seating is made of oak.','The shade appears fabric-like around light.']) expect(evaluateEditorialV2({...plan,features:[{...plan.features[0],narrative}]},contexts)).not.toBeNull()
 expect(evaluateEditorialV2({...plan,features:[{...plan.features[0],observationKeys:['subjects.seating']}]},contexts)).toBe('unsupported_observation')
 expect(evaluateEditorialV2({...plan,features:[{...plan.features[0],discoveryQuestion:'How might this feel?'}]},contexts)).toBe('irrelevant_discovery')
})
it('keeps real appearance uncertain and refuses material extrapolation',()=>{
 const f={...plan.features[0],narrative:'The shade appears paper-like around light; we cannot verify the material.'}
 expect(evaluateEditorialV2({...plan,features:[f]},contexts)).toBeNull()
 expect(evaluateEditorialV2({...plan,features:[{...f,narrative:f.narrative.replace('paper-like','wood-like')}]},contexts)).toBe('unsupported_material')
})
it('keeps the successful legacy Focused Home capture valid',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/editorial-live-home.json','utf8'))
 expect(validateOriginalPlan(fixture.plan,catalog,prefs)).toEqual(fixture.plan)
})
it('uses one validated Muse request with the versioned prompt and rejects grounded-schema violations',async()=>{
 const send=vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]}));vi.stubGlobal('fetch',send)
 expect((await generateEditorialResult(prefs,[...catalog],'FAKE',contexts)).plan.qualityVersion).toBe(2)
 expect(send).toHaveBeenCalledTimes(1)
 send.mockImplementation(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...plan,title:'quiet light spacious calm'})}}]}))
 await expect(generateEditorialResult(prefs,[...catalog],'FAKE',contexts)).rejects.toThrow('rejected')
})
it('fails closed for pending/rejected/revoked/unregistered photographs and library outages',async()=>{
 const image={...catalog[0],image:{...catalog[0].image,id:'private-photo',path:null,externalUrl:'https://assets.presscloud.com/photo.jpg'}}
 for(const status of ['pending','rejected','blocked'] as const) expect(eligibleReaderRecords([{...image,permissions:{...image.permissions,display:{status,evidence:null}}}],catalog)).toEqual(catalog)
 expect(eligibleReaderRecords([image],catalog)).toEqual(catalog)
 expect(await resolvePublishedLibrary({approvedRecords:async()=>{throw Error('not available')}},catalog)).toEqual(catalog)
 // AI/edits are independent: displaying an approved illustration never authorizes analysis.
 expect(eligibleReaderRecords([catalog[0]],catalog)[0].permissions.aiAnalysis.status).toBe('pending')
})
it('runs sanitized evaluation fixtures without treating writing examples as live evidence',()=>{
 const cases=JSON.parse(readFileSync('tests/fixtures/editorial-v2-evaluation.json','utf8')) as {field:string;text:string;expected:string}[]
 for(const c of cases){const input=c.field==='title'?{...plan,title:c.text}:{...plan,features:[{...plan.features[0],[c.field]:c.text}]};expect(evaluateEditorialV2(input,contexts)).toBe(c.expected)}
})

it('accepts an independently registered display-only photograph without enabling analysis or edits',()=>{
 const records=eligibleReaderRecords([externalFixture],catalog,testExternalApprovals)
 expect(records).toEqual([externalFixture])
 expect(records[0].permissions.aiAnalysis.status).toBe('pending')
 expect(records[0].permissions.edits.status).toBe('pending')
 expect(eligibleReaderRecords([{...externalFixture,permissions:{...externalFixture.permissions,display:{status:'blocked',evidence:null}}}],catalog,testExternalApprovals)).toEqual(catalog)
})
