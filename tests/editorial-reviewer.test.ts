import {afterEach,expect,it,vi} from 'vitest'
import {EDITORIAL_STANDARD_VERSION,editorialDimensions,editorialStandard,editorialStandardInstruction,scoreEditorialReview,type EditorialReviewOutput} from '../shared/editorial-standard'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import type {ExternalAssetApprovals} from '../shared/url-policy'
import {defaultPreferences,type EditorialPlan} from '../shared/editorial'
import {InferenceReservation} from '../worker/inference-budget'
import {EditorialReviewError,reviewEditorialPlan,reviseEditorialPlan} from '../worker/editorial-reviewer'
import {EditorialGenerationError,EditorialWorkflowBudgetError,generateEditorialResult,runEditorialWorkflow} from '../worker/editorial'
import {externalFixture} from './hybrid-fixtures'

const asset=`version-${'a'.repeat(64)}`
const sources:EditorialSource[]=[
 {id:`${asset}:brand_name`,assetId:asset,kind:'brand_name',label:'Brand name',value:'Northline Studio',authority:'owner_supplied_mockup',source:'content_studio'},
 {id:`${asset}:product_description`,assetId:asset,kind:'product_description',label:'Product description',value:'Owner supplied fictional seating concept.',authority:'owner_supplied_mockup',source:'content_studio'},
]
const contexts:VisualContext[]=[{assetId:asset,versionId:asset,imageSha256:'b'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',uncertainty:'appearance_not_verified_fact',observations:{subjects:['seating','lighting'],materialAppearance:['fabric-like'],environments:['interior-like'],relationships:['light-and-shadow','curve-and-space']}}]
const plan:EditorialPlan={qualityVersion:3,title:'The Architecture of Attention',deck:'Light and space guide attention from foreground to background.',features:[{catalogId:'catalog-test',assetId:asset,headline:'Where Light Meets Seating',narrative:'A band of light frames the seating, while shadow separates its rounded form from the background.',observationKeys:['subjects.seating','relationships.light-and-shadow'],discoveryQuestion:'How might the curve redirect attention across the surrounding space?',sourceIds:sources.map(source=>source.id),layout:'hero',motion:'still',theme:'Scandinavian'}],connections:[]}
const item={...externalFixture,id:'catalog-test',image:{...externalFixture.image,id:asset},permissions:{...externalFixture.permissions,aiAnalysis:{status:'approved' as const,evidence:'docs/TEST_ONLY.md'}}}
const approvals:ExternalAssetApprovals={[asset]:{url:item.image.externalUrl!,sourcePage:item.provenance.originalSourcePage!,displayEvidence:item.permissions.display.evidence!}}
const prefs={...defaultPreferences,interests:'light and attention',allocations:{home:100,fashion:0,travel:0},mode:'Focused' as const,consent:true}
const response=(content:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})
const review=(score:number):EditorialReviewOutput=>({rubricVersion:EDITORIAL_STANDARD_VERSION,dimensions:Object.fromEntries(editorialDimensions.map(dimension=>[dimension,{score,reason:'The edition uses concrete visual evidence and a clear editorial sequence.',evidenceRefs:[`feature:${asset}`]}])) as EditorialReviewOutput['dimensions'],magazineFeedback:'The visual argument remains coherent and gives the reader a useful path through the selected details.',featureFeedback:[{assetId:asset,strengths:['The feature connects light to spatial attention.'],issues:score>=4?[]:[{severity:'medium',code:'weak_discovery',evidenceRefs:[`feature:${asset}`],instruction:'Make the discovery question more specific to the observed curve.'}]}],revisionInstructions:score>=4?[]:['Strengthen the question using the cited curve-and-space relationship.']})
afterEach(()=>vi.unstubAllGlobals())

it('calculates PASS, REVISE and REJECT from provisional server-side weights',()=>{
 expect(scoreEditorialReview(review(5))).toEqual({score:100,decision:'PASS'})
 expect(scoreEditorialReview(review(3))).toEqual({score:60,decision:'REVISE'})
 expect(scoreEditorialReview(review(2))).toEqual({score:40,decision:'REJECT'})
 const withScores=(scores:number[])=>({...review(0),dimensions:Object.fromEntries(editorialDimensions.map((dimension,index)=>[dimension,{...review(0).dimensions[dimension],score:scores[index]}])) as EditorialReviewOutput['dimensions']})
 expect(scoreEditorialReview(withScores([4,3,4,3,3]))).toEqual({score:70,decision:'PASS'})
 expect(scoreEditorialReview(withScores([3,2,3,2,2]))).toEqual({score:50,decision:'REVISE'})
 expect(scoreEditorialReview(withScores([2,2,3,2,3]))).toEqual({score:46,decision:'REJECT'})
 expect(editorialStandard.thresholds).toEqual({pass:70,revise:50})
})

it('calibrates strong, average and weak authored examples against the shared anchors',()=>{
 const examples=[
  {label:'strong',text:'Shadow narrows the frame, then releases it into open space.',scores:[5,4,4,4,5]},
  {label:'average',text:'The image creates a visual relationship and invites another look.',scores:[3,3,3,3,3]},
  {label:'weak',text:'Discover this beautiful and perfect design for modern living.',scores:[1,1,1,1,2]},
 ]
 expect(examples.map(example=>({label:example.label,decision:scoreEditorialReview({...review(0),dimensions:Object.fromEntries(editorialDimensions.map((dimension,index)=>[dimension,{...review(0).dimensions[dimension],score:example.scores[index]}])) as EditorialReviewOutput['dimensions']}).decision}))).toEqual([{label:'strong',decision:'PASS'},{label:'average',decision:'REVISE'},{label:'weak',decision:'REJECT'}])
})

it('gives Chief Editor and independent Reviewer the exact same rubric version',async()=>{
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body)),instruction=String(body.messages[0].content)
  expect(instruction).toContain(EDITORIAL_STANDARD_VERSION)
  return instruction.includes('independent AI Editorial Reviewer')?response(review(5)):response(plan)
 });vi.stubGlobal('fetch',send)
 await generateEditorialResult(prefs,[item],'FAKE',contexts,[],approvals,sources)
 const result=await reviewEditorialPlan('FAKE',plan,sources,contexts)
 expect(result.assessment).toEqual({score:100,decision:'PASS'});expect(send).toHaveBeenCalledTimes(2)
 expect(editorialStandardInstruction).toContain(editorialStandard.evidenceKinds.editorialInterpretation)
})

it('accepts one targeted grounded revision and rejects a structural or factual regression',async()=>{
 const valid={...plan,title:'Light as a Measure of Space',features:[{...plan.features[0],narrative:'The empty interval acts like punctuation, giving the foreground form room to answer through light and shadow.'}]}
 vi.stubGlobal('fetch',vi.fn(async()=>response(valid)))
 expect((await reviseEditorialPlan('FAKE',plan,review(3),prefs,[item],approvals,sources,contexts)).value).toMatchObject({title:valid.title,features:[{narrative:valid.features[0].narrative}]})
 const unsupported={...plan,features:[{...plan.features[0],narrative:'A dark-brown leather surface anchors the foreground while light traces its rounded form.'}]}
 vi.stubGlobal('fetch',vi.fn(async()=>response(unsupported)))
 await expect(reviseEditorialPlan('FAKE',plan,review(5),prefs,[item],approvals,sources,contexts)).rejects.toMatchObject({code:'invalid_revision'})
 const changedAsset={...plan,features:[{...plan.features[0],assetId:'version-'+ 'c'.repeat(64)}]}
 vi.stubGlobal('fetch',vi.fn(async()=>response(changedAsset)))
 await expect(reviseEditorialPlan('FAKE',plan,review(3),prefs,[item],approvals,sources,contexts)).rejects.toBeInstanceOf(EditorialReviewError)
})

it('rejects reviewer evidence references that are not in the bounded input',async()=>{
 const unsafe={...review(5),dimensions:{...review(5).dimensions,editorialQuality:{...review(5).dimensions.editorialQuality,evidenceRefs:['private:raw-source-value']}}}
 vi.stubGlobal('fetch',vi.fn(async()=>response(unsafe)))
 await expect(reviewEditorialPlan('FAKE',plan,sources,contexts)).rejects.toMatchObject({code:'invalid_evidence'})
})

it('accounts for each bounded stage from an atomic reservation and fails closed at every boundary',()=>{
 const exhaustedBeforeChief=new InferenceReservation(0);expect(exhaustedBeforeChief.claim()).toBe(false)
 const exhaustedBeforeReviewer=new InferenceReservation(1);expect(exhaustedBeforeReviewer.claim()).toBe(true);expect(exhaustedBeforeReviewer.claim()).toBe(false)
 const exhaustedBeforeRevision=new InferenceReservation(2);expect(exhaustedBeforeRevision.claim()).toBe(true);expect(exhaustedBeforeRevision.claim()).toBe(true);expect(exhaustedBeforeRevision.claim()).toBe(false)
 const complete=new InferenceReservation(3);expect([complete.claim(),complete.claim(),complete.claim(),complete.claim()]).toEqual([true,true,true,false]);expect(complete.unusedUnits).toBe(0)
})

it('orchestrates PASS, REVISE and REJECT without an uncontrolled retry',async()=>{
 const measurement={latencyMs:10,usage:{inputTokens:10,outputTokens:5,cachedInputTokens:0,totalTokens:15}}
 const generate=vi.fn(async()=>({plan,measurement})),revise=vi.fn(async()=>({value:{...plan,title:'Light as a Measure of Space'},measurement})),makeReviewer=(value:EditorialReviewOutput)=>vi.fn(async()=>({value,measurement,assessment:scoreEditorialReview(value)}))
 const pass=await runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(3),true,{generate,review:makeReviewer(review(5)),revise} as never)
 expect(pass).toMatchObject({status:'pass',revised:false,measurement:{usage:{totalTokens:30}}});expect(revise).not.toHaveBeenCalled()
 const revised=await runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(3),true,{generate,review:makeReviewer(review(3)),revise} as never)
 expect(revised).toMatchObject({status:'pass',revised:true,plan:{title:'Light as a Measure of Space'},measurement:{usage:{totalTokens:45}}});expect(revise).toHaveBeenCalledOnce()
 const rejected=await runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(3),true,{generate,review:makeReviewer(review(2)),revise} as never)
 expect(rejected.status).toBe('rejected');expect(generate).toHaveBeenCalledTimes(3);expect(revise).toHaveBeenCalledOnce()
})

it('does not review a plan that fails the deterministic hard gate and fails closed on revision errors',async()=>{
 const reviewer=vi.fn(),revision=vi.fn(),hardFailure=vi.fn(async()=>{throw new EditorialGenerationError({latencyMs:1,usage:null},{code:'chief_unsupported_material',field:'features'})})
 await expect(runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(3),true,{generate:hardFailure,review:reviewer,revise:revision} as never)).rejects.toBeInstanceOf(EditorialGenerationError)
 expect(reviewer).not.toHaveBeenCalled();expect(revision).not.toHaveBeenCalled()
 const measurement={latencyMs:1,usage:null},generate=vi.fn(async()=>({plan,measurement})),reviewerRevise=vi.fn(async()=>({value:review(3),assessment:scoreEditorialReview(review(3)),measurement})),failedRevision=vi.fn(async()=>{throw new EditorialReviewError('invalid_revision',measurement)})
 await expect(runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(3),true,{generate,review:reviewerRevise,revise:failedRevision} as never)).rejects.toMatchObject({code:'invalid_revision'})
 expect(failedRevision).toHaveBeenCalledOnce()
})

it('stops before Chief, Reviewer or Revision when that reserved stage unit is unavailable',async()=>{
 const measurement={latencyMs:1,usage:null},generate=vi.fn(async()=>({plan,measurement})),reviewer=vi.fn(async()=>({value:review(3),assessment:scoreEditorialReview(review(3)),measurement})),revision=vi.fn(async()=>({value:plan,measurement})),deps={generate,review:reviewer,revise:revision} as never
 await expect(runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(0),true,deps)).rejects.toBeInstanceOf(EditorialWorkflowBudgetError);expect(generate).not.toHaveBeenCalled()
 await expect(runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(1),true,deps)).rejects.toBeInstanceOf(EditorialWorkflowBudgetError);expect(generate).toHaveBeenCalledOnce();expect(reviewer).not.toHaveBeenCalled()
 await expect(runEditorialWorkflow(prefs,[item],'FAKE',contexts,approvals,sources,new InferenceReservation(2),true,deps)).rejects.toBeInstanceOf(EditorialWorkflowBudgetError);expect(reviewer).toHaveBeenCalledOnce();expect(revision).not.toHaveBeenCalled()
})
