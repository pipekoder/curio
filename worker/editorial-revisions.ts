import {z} from 'zod'
import type {Bindings} from './index'
import type {ArticleEditionBody,EditorialArticle} from '../shared/editorial-articles'
import {editorialArticleEdition,editorialSingleArticleEdition,editorialArticle} from '../shared/editorial-articles'
import {editorialSources} from '../shared/editorial-sources'
import {generationVersion} from './editorial-feedback'
import {revisionEvidence} from './editorial-revision-evidence'
import {reviseArticleWithConfirmation} from './editorial-articles'
import {reserveInference,finishInference} from './inference-budget'

const jobIdSchema=z.string().regex(/^article-job-[a-f0-9]{64}$/)
const articleIdSchema=z.string().regex(/^article-version-[a-f0-9]{64}$/)
const versionIdSchema=z.string().regex(/^generation-[a-f0-9]{64}$/)
export const revisionInput=z.strictObject({jobId:jobIdSchema,articleId:articleIdSchema,parentVersion:versionIdSchema,feedbackId:z.uuid(),consent:z.literal(true)})
export const decisionInput=z.strictObject({jobId:jobIdSchema,articleId:articleIdSchema,versionId:versionIdSchema,decision:z.enum(['approve','reject'])})
type Job={result_json:string;updated_at:number}
type VersionRow={version_id:string;article_json:string;parent_version_id:string|null;feedback_id:string|null;review_status:'original'|'confirmed';created_at:number}
export class RevisionConflict extends Error{}
const jobResult=async(db:D1Database,id:string)=>{
 const job=await db.prepare("SELECT result_json,updated_at FROM article_edition_jobs WHERE id=? AND state='completed'").bind(id).first<Job>()
 if(!job)throw new RevisionConflict('Completed article is unavailable.')
 let data:unknown
 try{data=JSON.parse(job.result_json)}catch{throw new RevisionConflict('Completed article is unavailable.')}
 const raw=(data as {articleEdition?:unknown}).articleEdition
 const edition=(raw&&typeof raw==='object'&&'articles' in raw&&Array.isArray(raw.articles)&&raw.articles.length===1?editorialSingleArticleEdition:editorialArticleEdition).safeParse(raw)
 if(!edition.success)throw new RevisionConflict('Completed article is unavailable.')
 const research=editorialSources.safeParse((data as {researchReferences?:unknown}).researchReferences??[])
 if(!research.success)throw new RevisionConflict('Article references are unavailable.')
 return {edition:edition.data as ArticleEditionBody,research:research.data,updatedAt:job.updated_at}
}
const original=async(db:D1Database,job:string,article:string)=>{
 const saved=await jobResult(db,job),found=saved.edition.articles.find(value=>value.id===article)
 if(!found)throw new RevisionConflict('Article is not part of this edition.')
 return {...saved,article:found,version:await generationVersion(found)}
}
export async function listArticleVersions(db:D1Database,jobIdValue:string,articleIdValue:string){
 const jobId=jobIdSchema.parse(jobIdValue),articleId=articleIdSchema.parse(articleIdValue)
 const root=await original(db,jobId,articleId)
 const rows=(await db.prepare('SELECT version_id,article_json,parent_version_id,feedback_id,review_status,created_at FROM editorial_article_versions WHERE job_id=? AND article_id=? AND review_status=\'confirmed\' ORDER BY created_at,rowid LIMIT 3').bind(jobId,articleId).all<VersionRow>()).results
 const decisions=(await db.prepare('SELECT version_id,decision FROM editorial_article_decisions WHERE job_id=? AND article_id=?').bind(jobId,articleId).all<{version_id:string;decision:string}>()).results
 return {versions:[{versionId:root.version,parentVersion:null,feedbackId:null,reviewStatus:'original',article:root.article,createdAt:root.updatedAt,ownerDecision:decisions.find(row=>row.version_id===root.version)?.decision??null},...rows.map(row=>({versionId:row.version_id,parentVersion:row.parent_version_id,feedbackId:row.feedback_id,reviewStatus:row.review_status,article:JSON.parse(row.article_json) as EditorialArticle,createdAt:row.created_at,ownerDecision:decisions.find(value=>value.version_id===row.version_id)?.decision??null}))]}
}
export async function requestArticleRevision(env:Bindings,input:z.infer<typeof revisionInput>,ip:string){
 const db=env.CATALOG_DB
 if(!db||!env.MEDIA_BUCKET||!env.INFERENCE_BUDGET||!env.META_API_KEY||env.META_SPARK_MODEL!=='muse-spark-1.3'||env.MAGAZINE_AI_ENABLED!=='true'||env.EDITORIAL_REVIEW_ENABLED!=='true'||env.EDITORIAL_FEEDBACK_ENABLED!=='true')throw new RevisionConflict('Owner revision is unavailable.')
 const root=await original(db,input.jobId,input.articleId)
 const previous=(await db.prepare("SELECT version_id,article_json FROM editorial_article_versions WHERE job_id=? AND article_id=? AND review_status='confirmed' ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(input.jobId,input.articleId).first<{version_id:string;article_json:string}>())
 const latest=previous?.version_id??root.version
 if(input.parentVersion!==latest)throw new RevisionConflict('Article version changed. Refresh before revising.')
 const feedback=await db.prepare('SELECT id,decision,categories_json,feedback_text FROM editorial_article_feedback WHERE id=? AND job_id=? AND article_id=? AND generation_version=?').bind(input.feedbackId,input.jobId,input.articleId,input.parentVersion).first<{id:string;decision:string;categories_json:string;feedback_text:string}>()
 if(!feedback||feedback.decision!=='revise')throw new RevisionConflict('Matching Revise feedback is required.')
 let categories:string[]
 try{categories=JSON.parse(feedback.categories_json) as string[]}catch{throw new RevisionConflict('Feedback is unavailable.')}
 const parent=previous?editorialArticle.safeParse(JSON.parse(previous.article_json)):editorialArticle.safeParse(root.article)
 if(!parent.success)throw new RevisionConflict('Article version is unavailable.')
 const edition=structuredClone(root.edition)
 edition.articles=edition.articles.map(article=>article.id===input.articleId?parent.data:article)
 // Revalidation is before any budget reservation or provider call.
 const evidence=await revisionEvidence(env,edition,root.research)
 const now=Date.now(),attemptId=crypto.randomUUID()
 if(input.parentVersion===root.version)await db.prepare('INSERT OR IGNORE INTO editorial_article_versions(version_id,job_id,article_id,parent_version_id,feedback_id,article_json,review_status,created_at) VALUES(?,?,?,NULL,NULL,?,\'original\',?)').bind(root.version,input.jobId,input.articleId,JSON.stringify(root.article),root.updatedAt).run()
 let claimed:null|{id:string}
 try{claimed=await db.prepare(`INSERT INTO editorial_article_revision_attempts(id,job_id,article_id,parent_version_id,feedback_id,state,created_at,updated_at)
   SELECT ?,?,?,?,?, 'running',?,? WHERE
   (SELECT COUNT(*) FROM editorial_article_revision_attempts WHERE job_id=? AND article_id=?)<2
   AND NOT EXISTS(SELECT 1 FROM editorial_article_revision_attempts WHERE job_id=? AND article_id=? AND state='running')
   RETURNING id`).bind(attemptId,input.jobId,input.articleId,input.parentVersion,input.feedbackId,now,now,input.jobId,input.articleId,input.jobId,input.articleId).first<{id:string}>()}catch{throw new RevisionConflict('Revision already requested or in progress.')}
 if(!claimed)throw new RevisionConflict('Revision limit reached or another revision is in progress.')
 let reservationId:string|undefined,outcome:'completed'|'fallback'|'error'='error',attempted=0,reserved=false
 try{
  // Four units place this in the existing reviewed-editorial class. Only two
  // calls can be made; unused reserved units are never refunded.
  const budget=await reserveInference(env,ip,4)
  if(!budget.allowed)throw new RevisionConflict('Editorial inference budget unavailable.')
  reserved=true
  reservationId=budget.reservationId
  const revised=await reviseArticleWithConfirmation(env,edition,input.articleId,{id:feedback.id,text:feedback.feedback_text,categories},evidence.items,evidence.sources,evidence.contexts,()=>{attempted++})
  const currentEvidence=await revisionEvidence(env,edition,root.research)
  if(JSON.stringify(currentEvidence)!==JSON.stringify(evidence))throw new RevisionConflict('Article evidence changed during revision.')
  const currentParent=(await db.prepare("SELECT version_id FROM editorial_article_versions WHERE job_id=? AND article_id=? AND review_status='confirmed' ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(input.jobId,input.articleId).first<{version_id:string}>())?.version_id??root.version
  if(currentParent!==input.parentVersion)throw new RevisionConflict('Article version changed during revision.')
  const nextVersion=await generationVersion(revised.article)
  if(nextVersion===input.parentVersion)throw new RevisionConflict('Revision did not change the article.')
  const written=await db.batch([
   db.prepare('INSERT INTO editorial_article_versions(version_id,job_id,article_id,parent_version_id,feedback_id,article_json,review_status,created_at) VALUES(?,?,?,?,?,?,\'confirmed\',?)').bind(nextVersion,input.jobId,input.articleId,input.parentVersion,input.feedbackId,JSON.stringify(revised.article),Date.now()),
   db.prepare("UPDATE editorial_article_revision_attempts SET state='completed',result_version_id=?,updated_at=? WHERE id=? AND state='running'").bind(nextVersion,Date.now(),attemptId),
  ])
  if(written[1].meta.changes!==1)throw Error('Revision attempt changed.')
  outcome='completed'
  return {versionId:nextVersion,parentVersion:input.parentVersion,reviewStatus:'confirmed',modelCalls:attempted,reservedUnits:4}
 }catch(error){
  if(!reserved&&attempted===0)await db.prepare("DELETE FROM editorial_article_revision_attempts WHERE id=? AND state='running'").bind(attemptId).run().catch(()=>{})
  else await db.prepare("UPDATE editorial_article_revision_attempts SET state='failed',updated_at=? WHERE id=? AND state='running'").bind(Date.now(),attemptId).run().catch(()=>{})
  if(error instanceof RevisionConflict)throw error
  throw new Error('Revision or independent confirmation did not pass.')
 }finally{if(reservationId)await finishInference(env,reservationId,outcome).catch(()=>{})}
}
export async function decideArticleVersion(env:Bindings,input:z.infer<typeof decisionInput>){
 const db=env.CATALOG_DB!
 const root=await original(db,input.jobId,input.articleId)
 const valid=input.versionId===root.version||!!await db.prepare("SELECT version_id FROM editorial_article_versions WHERE job_id=? AND article_id=? AND version_id=? AND review_status='confirmed'").bind(input.jobId,input.articleId,input.versionId).first()
 if(!valid)throw new RevisionConflict('Article version is unavailable.')
 if(input.decision==='approve'){
  const selected=input.versionId===root.version?root.article:JSON.parse((await db.prepare('SELECT article_json FROM editorial_article_versions WHERE job_id=? AND article_id=? AND version_id=?').bind(input.jobId,input.articleId,input.versionId).first<{article_json:string}>())!.article_json) as EditorialArticle
  const edition=structuredClone(root.edition)
  edition.articles=edition.articles.map(article=>article.id===input.articleId?selected:article)
  try{await revisionEvidence(env,edition,root.research)}catch{throw new RevisionConflict('Current article evidence is unavailable for approval.')}
 }
 const now=Date.now()
 if(input.decision==='approve')await db.batch([
  db.prepare("DELETE FROM editorial_article_decisions WHERE job_id=? AND article_id=? AND decision='approve'").bind(input.jobId,input.articleId),
  db.prepare('INSERT INTO editorial_article_decisions(job_id,article_id,version_id,decision,decided_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id,article_id,version_id) DO UPDATE SET decision=excluded.decision,decided_at=excluded.decided_at').bind(input.jobId,input.articleId,input.versionId,input.decision,now),
 ])
 else await db.prepare('INSERT INTO editorial_article_decisions(job_id,article_id,version_id,decision,decided_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id,article_id,version_id) DO UPDATE SET decision=excluded.decision,decided_at=excluded.decided_at').bind(input.jobId,input.articleId,input.versionId,input.decision,now).run()
 return {versionId:input.versionId,decision:input.decision}
}

// Only an explicitly owner-approved, independently confirmed version may
// replace its article in the ordinary Reader response. Other stories remain
// byte-for-byte the saved originals.
export async function approvedArticleVersions(db:D1Database,jobId:string,edition:ArticleEditionBody){
 const rows=(await db.prepare(`SELECT d.article_id,d.version_id,v.article_json,v.review_status FROM editorial_article_decisions d
  LEFT JOIN editorial_article_versions v ON v.job_id=d.job_id AND v.article_id=d.article_id AND v.version_id=d.version_id
  WHERE d.job_id=? AND d.decision='approve'`).bind(jobId).all<{article_id:string;version_id:string;article_json:string|null;review_status:string|null}>()).results
 const next=structuredClone(edition),revisedIds:string[]=[]
 for(const row of rows){
  const index=next.articles.findIndex(article=>article.id===row.article_id)
  if(index<0)continue
  if(row.version_id===await generationVersion(next.articles[index]))continue
  if(row.review_status!=='confirmed'||!row.article_json)continue
  try{const candidate=editorialArticle.parse(JSON.parse(row.article_json));if(candidate.id!==row.article_id||await generationVersion(candidate)!==row.version_id)continue;next.articles[index]=candidate;revisedIds.push(candidate.id)}catch{/* Invalid historical record never enters Reader. */}
 }
 return {edition:next,revisedIds}
}
