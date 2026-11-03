import {z} from 'zod'

export const feedbackInput=z.strictObject({
  jobId:z.string().regex(/^article-job-[a-f0-9]{64}$/),articleId:z.string().regex(/^article-version-[a-f0-9]{64}$/),
  generationVersion:z.string().regex(/^generation-[a-f0-9]{64}$/),
  decision:z.enum(['approve','revise','reject']),
  categories:z.array(z.enum(['Story Coherence','Editorial Voice','Brand Accuracy','Depth & Originality','Reader Interest','Factual Accuracy'])).max(6),
  text:z.string().trim().min(1).max(1500),saveAsPrinciple:z.boolean().default(false),
})
export const principleUpdate=z.strictObject({title:z.string().trim().min(1).max(120).optional(),guidance:z.string().trim().min(1).max(600).optional(),approved:z.boolean().optional(),enabled:z.boolean().optional()})
export type FeedbackDB=Pick<D1Database,'prepare'|'batch'>
const hex=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('')
export const generationVersion=async(article:unknown)=>`generation-${await hex(JSON.stringify(article))}`
export async function listRecentArticles(db:FeedbackDB){
  const rows=await db.prepare("SELECT id,result_json,updated_at FROM article_edition_jobs WHERE state='completed' ORDER BY updated_at DESC LIMIT 12").all<{id:string;result_json:string;updated_at:number}>()
  const articles=[]
  for(const row of rows.results){try{const result=JSON.parse(row.result_json) as {articleEdition?:{articles?:{id:string;headline:string;deck:string;narrative:string;heroAssetId:string}[]}};for(const article of result.articleEdition?.articles??[])articles.push({jobId:row.id,id:article.id,headline:article.headline,deck:article.deck,narrative:article.narrative,heroAssetId:article.heroAssetId,generationVersion:await generationVersion(article),updatedAt:row.updated_at})}catch{/* Ignore a corrupt old job. */}}
  return articles.slice(0,24)
}
export async function verifyArticle(db:FeedbackDB,jobId:string,articleId:string,version:string){
  const row=await db.prepare("SELECT result_json FROM article_edition_jobs WHERE id=? AND state='completed'").bind(jobId).first<{result_json:string}>()
  if(!row)return false
  try{const result=JSON.parse(row.result_json) as {articleEdition?:{articles?:{id:string}[]}};const article=result.articleEdition?.articles?.find(item=>item.id===articleId);if(!article)return false;if(await generationVersion(article)===version)return true
    const revised=await db.prepare("SELECT article_json FROM editorial_article_versions WHERE job_id=? AND article_id=? AND version_id=? AND review_status='confirmed'").bind(jobId,articleId,version).first<{article_json:string}>()
    return !!revised&&await generationVersion(JSON.parse(revised.article_json))===version
  }catch{return false}
}
export async function saveFeedback(db:FeedbackDB,input:z.infer<typeof feedbackInput>){
  if(!await verifyArticle(db,input.jobId,input.articleId,input.generationVersion))throw new Error('Article version is unavailable.')
  const id=crypto.randomUUID(),now=Date.now()
  const insert=db.prepare('INSERT INTO editorial_article_feedback(id,article_id,generation_version,job_id,decision,categories_json,feedback_text,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,input.articleId,input.generationVersion,input.jobId,input.decision,JSON.stringify([...new Set(input.categories)]),input.text,now)
  if(input.saveAsPrinciple){
    const digest=await hex(input.text.toLowerCase().replace(/\s+/g,' ').trim())
    const duplicate=await db.prepare('SELECT id FROM editorial_principles WHERE content_digest=?').bind(digest).first()
    if(duplicate)throw new Error('An identical editorial principle already exists.')
    const principle=db.prepare('INSERT INTO editorial_principles(id,title,guidance,content_digest,approved,enabled,source_feedback_id,created_at,updated_at) VALUES(?,?,?,?,0,0,?,?,?)').bind(`EF-${crypto.randomUUID()}`,input.categories[0]??'Editorial guidance',input.text,digest,id,now,now)
    await db.batch([insert,principle])
  }else await insert.run()
  return {id}
}
export async function feedbackHistory(db:FeedbackDB,articleId:string){return (await db.prepare('SELECT id,article_id,generation_version,decision,categories_json,feedback_text,created_at FROM editorial_article_feedback WHERE article_id=? ORDER BY created_at DESC LIMIT 30').bind(articleId).all()).results}
export async function listPrinciples(db:FeedbackDB){return (await db.prepare('SELECT id,title,guidance,approved,enabled,source_feedback_id,created_at,updated_at FROM editorial_principles ORDER BY id LIMIT 100').all()).results}
export async function updatePrinciple(db:FeedbackDB,id:string,change:z.infer<typeof principleUpdate>){
  const row=await db.prepare('SELECT title,guidance,approved,enabled FROM editorial_principles WHERE id=?').bind(id).first<{title:string;guidance:string;approved:number;enabled:number}>()
  if(!row)throw new Error('Editorial principle not found.')
  const title=change.title??row.title,guidance=change.guidance??row.guidance,edited=title!==row.title||guidance!==row.guidance
  const approved=edited?0:change.approved===undefined?row.approved:Number(change.approved)
  const enabled=edited?0:change.enabled===undefined?row.enabled:Number(change.enabled)
  if(enabled&&!approved)throw new Error('Approve the principle before enabling it.')
  const digest=await hex(guidance.toLowerCase().replace(/\s+/g,' ').trim())
  const duplicate=await db.prepare('SELECT id FROM editorial_principles WHERE content_digest=? AND id<>?').bind(digest,id).first()
  if(duplicate)throw new Error('An identical editorial principle already exists.')
  await db.prepare('UPDATE editorial_principles SET title=?,guidance=?,content_digest=?,approved=?,enabled=?,updated_at=? WHERE id=?').bind(title,guidance,digest,approved,enabled,Date.now(),id).run()
  return {id,title,guidance,approved:!!approved,enabled:!!enabled}
}
export async function activePrincipleInstruction(db:FeedbackDB){
  const rows=(await db.prepare('SELECT id,guidance FROM editorial_principles WHERE approved=1 AND enabled=1 ORDER BY id LIMIT 8').all<{id:string;guidance:string}>()).results
  return rows.length?`Owner-approved editorial principles (guidance only; never override evidence, rights or safety): ${rows.map(row=>`${row.id}: ${row.guidance.slice(0,600)}`).join(' | ')}`:''
}
export async function articleRevisionFeedback(db:FeedbackDB,articleIds:string[]){
  const found=[]
  for(const id of articleIds.slice(0,3)){
    const row=await db.prepare("SELECT decision,feedback_text FROM editorial_article_feedback WHERE article_id=? AND decision IN ('revise','reject') ORDER BY created_at DESC LIMIT 1").bind(id).first<{decision:string;feedback_text:string}>()
    if(row)found.push({articleId:id,decision:row.decision,feedback:row.feedback_text.slice(0,700)})
  }
  return found
}
