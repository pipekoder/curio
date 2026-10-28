// @vitest-environment node
import {expect,it,vi,afterEach} from 'vitest'
import {inspectNormSam,renderNormInspection} from '../dev/norm-replay'
import {normGeometryRecord} from '../dev/norm-asset'
import {readFileSync,existsSync} from 'node:fs'
vi.setConfig({testTimeout:30000})
async function syntheticCapture(){
 const ad=await normGeometryRecord()
 return {origin:'meta',responseValid:true,output:{adId:ad.id,assetId:ad.image.id,width:1600,height:1201,source:'sam_detection',model:'sam-3.1',regions:Array.from({length:7},(_,i)=>({id:`sam-${i+1}`,detailId:'norm-local-detail',box:{x:.1+i*.01,y:.5,width:.3,height:.2},confidence:null,uncertainty:'model_estimate_not_identity'}))}}
}
afterEach(()=>vi.unstubAllGlobals())
it('preserves all seven SYNTHETIC boxes, keeps the owner-identified chair and left fragment separate, and never calls a model',async()=>{
 const send=vi.fn();vi.stubGlobal('fetch',send)
 const capture=await syntheticCapture(), before=JSON.stringify(capture)
 const replay=await inspectNormSam(capture)
 expect(replay.grouping.raw).toEqual(capture.output.regions)
 expect(replay.grouping.objects).toHaveLength(7)
 expect(replay.report).toMatchObject({armchairSeparate:true,leftSofaSeparate:true,modelCalls:0,rawBoxesPreserved:true})
 expect(JSON.stringify(capture)).toBe(before)
 expect(send).not.toHaveBeenCalled()
})
it('permits reviewed fragments and suppression while refusing protected/relabelled/missing/failed captures',async()=>{
 const capture=await syntheticCapture()
 const replay=await inspectNormSam(capture,{'sam-2':{objectKey:'reviewed-sofa'},'sam-3':{objectKey:'reviewed-sofa'},'sam-7':{suppress:true}})
 expect(replay.grouping.objects.find(o=>o.memberIds.includes('sam-2'))?.memberIds).toEqual(['sam-2','sam-3'])
 expect(replay.grouping.suppressedIds).toEqual(['sam-7']);expect(replay.grouping.raw).toHaveLength(7)
 for(const hints of [{'sam-1':{objectKey:'sofa'}},{'sam-4':{suppress:true}},{'sam-2':{objectKey:'owner-armchair'}},{'sam-99':{suppress:true}}])await expect(inspectNormSam(capture,hints)).rejects.toThrow()
 await expect(inspectNormSam({...capture,responseValid:false})).rejects.toThrow()
 await expect(inspectNormSam({...capture,origin:'mock'})).rejects.toThrow()
 await expect(inspectNormSam({...capture,output:{...capture.output,regions:capture.output.regions.slice(1)}})).rejects.toThrow()
 await expect(inspectNormSam({...capture,output:{...capture.output,assetId:'different-image'}})).rejects.toThrow()
})
const privateFile=process.env.CURIO_NORM_TEST_FILE
const privateIt=privateFile&&existsSync(privateFile)?it:it.skip
privateIt('renders a private standalone inspection with exact JPEG and clearly SYNTHETIC boxes for offline adapter testing only',async()=>{
 const send=vi.fn();vi.stubGlobal('fetch',send)
 const result=await renderNormInspection(await syntheticCapture(),{},new Uint8Array(readFileSync(privateFile!)))
 expect(result.html).toContain("default-src 'none'")
 expect(result.html).toContain('data:image/jpeg;base64,')
 expect(result.html).not.toContain('<script')
 expect(result.report.rawCount).toBe(7)
 expect(send).not.toHaveBeenCalled()
})
privateIt('writes byte-identical SYNTHETIC capture and owner-private offline inspection artifacts without network',async()=>{
 const {mkdtemp,writeFile,readFile,stat,rm}=await import('node:fs/promises')
 const {tmpdir}=await import('node:os'),{join}=await import('node:path')
 const script='../scripts/replay-norm-sam.mjs', {replay}=await import(script)
 const root=await mkdtemp(join(tmpdir(),'curio-private-replay-test-'))
 const send=vi.fn(()=>{throw Error('No network in replay')});vi.stubGlobal('fetch',send)
 try{
  const raw=JSON.stringify(await syntheticCapture(),null,2),capture=join(root,'synthetic-sam-fixture.json'),out=join(root,'inspection')
  await writeFile(capture,raw,{mode:0o600})
  const result=await replay([`--capture=${capture}`,`--image=${privateFile}`,`--out=${out}`,...(process.env.CHROMIUM_PATH?['--screenshots']:[])])
  expect(result).toMatchObject({regions:7,modelCalls:0,armchairSeparate:true})
  expect(await readFile(join(out,'source-capture.json'),'utf8')).toBe(raw)
  expect((await stat(join(out,'inspection.html'))).mode&0o777).toBe(0o600)
  if(process.env.CHROMIUM_PATH)expect((await stat(join(out,'inspection-mobile.png'))).mode&0o777).toBe(0o600)
  expect(send).not.toHaveBeenCalled()
 }finally{await rm(root,{recursive:true,force:true})}
})
