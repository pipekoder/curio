// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {advanceLongform,LongformJobStore,type LongformModel} from '../worker/longform-editorial'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
let mf:Miniflare,store:LongformJobStore
const version=`version-${'a'.repeat(64)}`
const sources=Array.from({length:4},(_,i)=>({id:`source-${i+1}`,kind:'brand_product' as const,assetVersionId:version,text:`Reviewed fictional source ${i+1}.`,verified:true as const,rightsApproved:true as const,digest:'b'.repeat(64)}))
const input={prompt:'Explore distinct design ideas across four objects',voice:'Editorial',knowledgeVersion:'v2.1',sources}
const longText=(index:number)=>Array.from({length:400},(_,i)=>`detail${index}-${i}`).join(' ')
const outline={title:'Four Ways to Understand Everyday Objects',thesis:'Each object invites a different question about everyday human choices and design.',sections:Array.from({length:4},(_,i)=>({id:`section-${i+1}`,heading:`A Distinct Editorial Section ${i+1}`,purpose:`Develop a distinct, evidence-supported design idea for object ${i+1}.`,sourceIds:[`source-${i+1}`]}))}
beforeEach(async()=>{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],telemetry:{enabled:false}}));const db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;await db.exec(readFileSync('migrations/0006_longform_jobs.sql','utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '));store=new LongformJobStore(db)})
afterEach(async()=>mf.dispose())
it('persists resumable checkpoints, validates the word target and completes only after independent review',async()=>{
 const model:LongformModel={outline:vi.fn(async()=>outline),draft:vi.fn(async(_input,_outline,section)=>({text:longText(Number(section.id.at(-1))),sourceIds:section.sourceIds})),reviewSection:vi.fn(async()=>({decision:'PASS',hardFailure:false,findings:[]})),revise:vi.fn(),reviewWhole:vi.fn(async()=>({decision:'PASS',hardFailure:false,findings:[]}))}
 const created=await store.create(input),cached=await store.create(input);expect(cached.id).toBe(created.id)
 let job=created;for(let i=0;i<10;i++){job=await advanceLongform(store,created.id,model,async()=>true);expect((await store.load(created.id))?.revision).toBe(i+1)}
 expect(job.state).toMatchObject({phase:'complete',wordCount:1600,modelCalls:10})
 expect(model.outline).toHaveBeenCalledTimes(1);expect(model.draft).toHaveBeenCalledTimes(4);expect(model.reviewSection).toHaveBeenCalledTimes(4);expect(model.reviewWhole).toHaveBeenCalledTimes(1)
 expect((await advanceLongform(store,created.id,model,async()=>true)).revision).toBe(10)
})
it('fails closed on unavailable budget or unsupported section citations without retries',async()=>{
 const job=await store.create(input),model:LongformModel={outline:vi.fn(async()=>outline),draft:vi.fn(async()=>({text:longText(1),sourceIds:['unapproved']})),reviewSection:vi.fn(),revise:vi.fn(),reviewWhole:vi.fn()}
 const noBudget=await advanceLongform(store,job.id,model,async()=>false)
 expect(noBudget.state.phase).toBe('failed');expect(model.outline).not.toHaveBeenCalled()
 const other=await store.create({...input,prompt:'A different editorial question'})
 await advanceLongform(store,other.id,model,async()=>true)
 const failed=await advanceLongform(store,other.id,model,async()=>true)
 expect(failed.state).toMatchObject({phase:'failed',modelCalls:2})
 expect(model.draft).toHaveBeenCalledTimes(1)
})
