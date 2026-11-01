import {expect,it,vi,afterEach} from 'vitest'
import {EDITORIAL_KNOWLEDGE_VERSION,editorialKnowledgeInstruction,editorialVoices,selectEditorialVoice} from '../shared/editorial-knowledge-v2'
import {resolveEditorialInput} from '../shared/editorial-intent'
import {generateEditorialResult} from '../worker/editorial'
import {reviewEditorialPlan,reviseEditorialPlan} from '../worker/editorial-reviewer'
import {externalFixture} from './hybrid-fixtures'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import type {ExternalAssetApprovals} from '../shared/url-policy'
import type {EditorialPlan} from '../shared/editorial'

const asset=`version-${'a'.repeat(64)}`
const sources:EditorialSource[]=[{id:`${asset}:brand_name`,assetId:asset,kind:'brand_name',label:'Brand name',value:'Northline Studio',authority:'owner_supplied_mockup',source:'content_studio'}]
const contexts:VisualContext[]=[{assetId:asset,versionId:asset,imageSha256:'b'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',uncertainty:'appearance_not_verified_fact',observations:{subjects:['seating'],materialAppearance:['fabric-like'],environments:['interior-like'],relationships:['curve-and-space']}}]
const plan:EditorialPlan={qualityVersion:3,title:'The Architecture of Attention',deck:'Light and space guide attention from foreground to background.',features:[{catalogId:'catalog-test',assetId:asset,headline:'Where Light Meets Seating',narrative:'A band of light frames the seating, while shadow separates its rounded form from the background.',observationKeys:['subjects.seating','relationships.curve-and-space'],discoveryQuestion:'How might the curve redirect attention across the surrounding space?',sourceIds:[sources[0].id],layout:'hero',motion:'still',theme:'Scandinavian'}],connections:[]}
const item={...externalFixture,id:'catalog-test',image:{...externalFixture.image,id:asset},permissions:{...externalFixture.permissions,aiAnalysis:{status:'approved' as const,evidence:'docs/TEST_ONLY.md'}}}
const approvals:ExternalAssetApprovals={[asset]:{url:item.image.externalUrl!,sourcePage:item.provenance.originalSourcePage!,displayEvidence:item.permissions.display.evidence!}}
const prefs=resolveEditorialInput({prompt:'Tell a more poetic story about everyday Scandinavian interiors',consent:true})
const response=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
afterEach(()=>vi.unstubAllGlobals())

it('selects all six voices from existing prompt text without changing category or aesthetic inference',()=>{
 const prompts:[string,string][]=[['reflective voice','Reflective'],['more intimate and human','Intimate'],['poetic story','Poetic'],['observant voice','Observant'],['curious voice','Curious'],['editorial voice','Editorial']]
 for(const [prompt,voice] of prompts){expect(selectEditorialVoice(prompt)).toBe(voice);expect(resolveEditorialInput({prompt:`Explore Scandinavian interiors in a ${prompt}`}).aesthetics).toContain('Scandinavian')}
 expect(selectEditorialVoice('Explore Scandinavian interiors')).toBe('Editorial')
 expect(Object.keys(editorialVoices)).toHaveLength(6)
 expect(editorialKnowledgeInstruction('Poetic')).toContain(EDITORIAL_KNOWLEDGE_VERSION)
})

it('keeps V1 Chief prompt unchanged when V2 is off and includes selected knowledge when on',async()=>{
 const prompts:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{prompts.push(JSON.parse(String(init.body)).messages[0].content);return response(plan)}))
 await generateEditorialResult(prefs,[item],'FAKE',contexts,[],approvals,sources,false)
 await generateEditorialResult(prefs,[item],'FAKE',contexts,[],approvals,sources,true)
 expect(prompts[0]).not.toContain(EDITORIAL_KNOWLEDGE_VERSION)
 expect(prompts[1]).toContain(EDITORIAL_KNOWLEDGE_VERSION)
 expect(prompts[1]).toContain('Selected voice Poetic')
 expect(prompts[0]).toContain('Do not quote, restate or paraphrase brand histories')
 expect(prompts[1]).not.toContain('Do not quote, restate or paraphrase brand histories')
 expect(prompts[1]).toContain('a faithful, bounded paraphrase is welcome')
 expect(prompts[1]).toContain('internal citations, never reader-facing phrasing')
})

it('passes the same selected voice to independent Review and Revision without an extra classifier call',async()=>{
 const prompts:string[]=[]
 const review={rubricVersion:'curio-editorial-standard-v1',dimensions:Object.fromEntries(['editorialQuality','discoveryValue','originality','narrativeCoherence','readability'].map(key=>[key,{score:5,reason:'Concrete, coherent visual idea.',evidenceRefs:[`feature:${asset}`]}])),magazineFeedback:'A clear editorial angle.',featureFeedback:[{assetId:asset,strengths:['Clear angle.'],issues:[]}],revisionInstructions:[]}
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));prompts.push(body.messages[0].content);return response(prompts.length===1?review:plan)}))
 await reviewEditorialPlan('FAKE',plan,sources,contexts,prefs.interests,true)
 await reviseEditorialPlan('FAKE',plan,review as never,prefs,[item],approvals,sources,contexts,true)
 expect(prompts).toHaveLength(2)
 expect(prompts.every(prompt=>prompt.includes('Selected voice Poetic')&&prompt.includes(EDITORIAL_KNOWLEDGE_VERSION))).toBe(true)
 expect(prompts[0]).toContain('An elegant but generic image description is not sufficient discovery')
 expect(prompts[0]).toContain('high-severity hard failures regardless of score')
 expect(prompts[1]).toContain('Preserve citations and all structural identities')
})
