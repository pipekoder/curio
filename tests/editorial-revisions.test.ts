// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {saveFeedback,generationVersion} from '../worker/editorial-feedback'
import {requestArticleRevision,listArticleVersions,decideArticleVersion,approvedArticleVersions} from '../worker/editorial-revisions'
import {mediaApi} from '../worker/media-api'
import {revisionEvidence} from '../worker/editorial-revision-evidence'
import {reviseArticleWithConfirmation} from '../worker/editorial-articles'
import {reserveInference} from '../worker/inference-budget'

vi.mock('../worker/editorial-revision-evidence',()=>({revisionEvidence:vi.fn(async()=>({items:[],sources:[],contexts:[]}))}))
vi.mock('../worker/editorial-articles',()=>({reviseArticleWithConfirmation:vi.fn(async(_env,_edition,articleId,_feedback,_items,_sources,_contexts,onAttempt)=>{onAttempt?.();onAttempt?.();return {article:{..._edition.articles.find((row:{id:string})=>row.id===articleId)!,narrative:`Revised narrative ${vi.mocked(reviseArticleWithConfirmation).mock.calls.length}`},reviewStatus:'confirmed'}})}))
vi.mock('../worker/inference-budget',()=>({reserveInference:vi.fn(async()=>({allowed:true})),finishInference:vi.fn(async()=>{})}))
let mf:Miniflare,db:D1Database
const origin='https://curio.example.com',token='owner-only-token-longer-than-32-characters',jobId=`article-job-${'b'.repeat(64)}`,asset=`version-${'a'.repeat(64)}`,articleId=`article-${asset}`
const article={id:articleId,headline:'A Room',deck:'An editorial deck',narrative:'Original narrative',heroAssetId:asset,images:[{catalogId:'catalog-a',assetId:asset,brandName:'Owner Studio',brandSourceId:`${asset}:brand_name`,productSourceIds:[]},{catalogId:'catalog-b',assetId:`version-${'c'.repeat(64)}`,brandName:'Owner Studio',brandSourceId:`version-${'c'.repeat(64)}:brand_name`,productSourceIds:[]}],sourceIds:[`${asset}:brand_name`,`version-${'c'.repeat(64)}:brand_name`]}
const env=()=>({CATALOG_DB:db,MEDIA_BUCKET:{},INFERENCE_BUDGET:{},META_API_KEY:'test-key',META_SPARK_MODEL:'muse-spark-1.3',MAGAZINE_AI_ENABLED:'true',EDITORIAL_REVIEW_ENABLED:'true',EDITORIAL_FEEDBACK_ENABLED:'true',CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin}) as never
beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database
 for(const file of ['0007_article_edition_jobs.sql','0008_editorial_feedback.sql','0009_editorial_revisions.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 await db.prepare("INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,result_json,created_at,updated_at) VALUES(?,?,?,'completed',?,?,?)").bind(jobId,'ip','input',JSON.stringify({articleEdition:{version:'curio-editorial-article-v1',title:'A Title',deck:'A Deck',articles:[article]}}),1,1).run()
 vi.mocked(revisionEvidence).mockClear();vi.mocked(reviseArticleWithConfirmation).mockReset();vi.mocked(reviseArticleWithConfirmation).mockImplementation(async(_env,_edition,articleId,_feedback,_items,_sources,_contexts,onAttempt)=>{onAttempt?.();onAttempt?.();return {article:{..._edition.articles.find((row:{id:string})=>row.id===articleId)!,narrative:`Revised narrative ${vi.mocked(reviseArticleWithConfirmation).mock.calls.length}`},reviewStatus:'confirmed'}});vi.mocked(reserveInference).mockReset();vi.mocked(reserveInference).mockResolvedValue({allowed:true} as never)
})
afterEach(async()=>mf?.dispose())
const feedback=async(version:string,text='Please revise this article.')=>saveFeedback(db,{jobId,articleId,generationVersion:version,decision:'revise',categories:['Story Coherence'],text,saveAsPrinciple:false})
it('keeps saving feedback inference-free, then revises only through explicit owner request with exact version ownership',async()=>{
 const original=await generationVersion(article),saved=await feedback(original)
 expect(reviseArticleWithConfirmation).not.toHaveBeenCalled()
 expect(reserveInference).not.toHaveBeenCalled()
 const wrongJob=`article-job-${'d'.repeat(64)}`
 await expect(requestArticleRevision(env(),{jobId:wrongJob,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow()
 await expect(requestArticleRevision(env(),{jobId,articleId,parentVersion:`generation-${'0'.repeat(64)}`,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow('version changed')
 expect(reserveInference).not.toHaveBeenCalled()
 const result=await requestArticleRevision(env(),{jobId,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')
 expect(result).toMatchObject({parentVersion:original,reviewStatus:'confirmed',modelCalls:2,reservedUnits:4})
 expect((await db.prepare('SELECT result_json FROM article_edition_jobs WHERE id=?').bind(jobId).first<{result_json:string}>())?.result_json).toContain('Original narrative')
 await decideArticleVersion(env(),{jobId,articleId,versionId:result.versionId,decision:'approve'})
 expect((await approvedArticleVersions(db,jobId,{version:'curio-editorial-article-v1',title:'A Title',deck:'A Deck',articles:[article]})).edition.articles[0].narrative).toContain('Revised narrative')
 expect((await listArticleVersions(db,jobId,articleId)).versions).toMatchObject([{versionId:original,reviewStatus:'original'},{versionId:result.versionId,parentVersion:original,feedbackId:saved.id,reviewStatus:'confirmed'}])
 await expect(requestArticleRevision(env(),{jobId,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow('version changed')
 expect(reviseArticleWithConfirmation).toHaveBeenCalledTimes(1)
 const nextFeedback=await feedback(result.versionId,'Revise the revised article.')
 const second=await requestArticleRevision(env(),{jobId,articleId,parentVersion:result.versionId,feedbackId:nextFeedback.id,consent:true},'192.0.2.1')
 const thirdFeedback=await feedback(second.versionId,'Try a third revision.')
 await expect(requestArticleRevision(env(),{jobId,articleId,parentVersion:second.versionId,feedbackId:thirdFeedback.id,consent:true},'192.0.2.1')).rejects.toThrow('Revision limit')
 expect(reviseArticleWithConfirmation).toHaveBeenCalledTimes(2)
})
it('requires operator authentication and records an explicit preferred version separately from immutable text',async()=>{
 const original=await generationVersion(article),headers={Origin:origin,'CF-Connecting-IP':'192.0.2.2','Content-Type':'application/json',Authorization:`Bearer ${token}`}
 const input={jobId,articleId,parentVersion:original,feedbackId:crypto.randomUUID(),consent:true}
 expect((await mediaApi.request(`${origin}/editorial/revisions`,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body:JSON.stringify(input)},env())).status).toBe(403)
 expect((await mediaApi.request(`${origin}/editorial/revisions`,{method:'POST',headers,body:JSON.stringify(input)},env())).status).toBe(409)
 expect(reserveInference).not.toHaveBeenCalled()
 await decideArticleVersion(env(),{jobId,articleId,versionId:original,decision:'approve'})
 expect((await listArticleVersions(db,jobId,articleId)).versions[0].ownerDecision).toBe('approve')
 await decideArticleVersion(env(),{jobId,articleId,versionId:original,decision:'reject'})
 expect((await listArticleVersions(db,jobId,articleId)).versions[0].ownerDecision).toBe('reject')
})

it('never persists an unconfirmed revision or reuses feedback from another job',async()=>{
 const original=await generationVersion(article),saved=await feedback(original)
 const anotherJob=`article-job-${'e'.repeat(64)}`
 await db.prepare("INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,result_json,created_at,updated_at) VALUES(?,?,?,'completed',?,?,?)").bind(anotherJob,'ip2','input2',JSON.stringify({articleEdition:{version:'curio-editorial-article-v1',title:'A Title',deck:'A Deck',articles:[article]}}),2,2).run()
 await expect(requestArticleRevision(env(),{jobId:anotherJob,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow('Matching Revise feedback')
 expect(reserveInference).not.toHaveBeenCalled()
 vi.mocked(reviseArticleWithConfirmation).mockRejectedValueOnce(new Error('high-severity factual issue'))
 await expect(requestArticleRevision(env(),{jobId,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow('did not pass')
 expect((await listArticleVersions(db,jobId,articleId)).versions).toHaveLength(1)
 expect((await db.prepare('SELECT state FROM editorial_article_revision_attempts WHERE job_id=?').bind(jobId).first<{state:string}>())?.state).toBe('failed')
})
it('denied budget does not consume a model attempt or create a revised version',async()=>{
 const original=await generationVersion(article),saved=await feedback(original)
 vi.mocked(reserveInference).mockResolvedValueOnce({allowed:false} as never)
 await expect(requestArticleRevision(env(),{jobId,articleId,parentVersion:original,feedbackId:saved.id,consent:true},'192.0.2.1')).rejects.toThrow('budget')
 expect(reviseArticleWithConfirmation).not.toHaveBeenCalled()
 expect((await db.prepare('SELECT COUNT(*) AS n FROM editorial_article_revision_attempts').first<{n:number}>())?.n).toBe(0)
})
