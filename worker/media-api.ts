import { Hono, type Handler, type MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'hono/utils/buffer'
import { z } from 'zod'
import { boundedText } from './meta'
import { CatalogConflict } from './catalog-store'
import { MediaStore, MEDIA_MAX_BYTES } from './media-store'
import { mediaMetadataUpdate, parseStudioText } from './media-contracts'
import { allowedOperatorOrigin } from './operator-origin'
import type { Bindings } from './index'
import {feedbackInput,principleUpdate,listRecentArticles,saveFeedback,feedbackHistory,listPrinciples,updatePrinciple} from './editorial-feedback'
import {revisionInput,decisionInput,listArticleVersions,requestArticleRevision,decideArticleVersion,RevisionConflict} from './editorial-revisions'

const versionId = z.string().regex(/^version-[a-f0-9]{64}$/)
export const mediaApi = new Hono<{ Bindings: Bindings }>()

export const mediaOperatorAuth:MiddlewareHandler<{Bindings:Bindings}>=async (c,next) => {
  c.header('Cache-Control','no-store')
  const env=c.env??{},token=env.CATALOG_OPERATOR_TOKEN,auth=c.req.header('Authorization')??''
  if(env.CATALOG_OPERATOR_ENABLED!=='true'||!env.CATALOG_DB||!env.MEDIA_BUCKET||!token||token.length<32||!env.PUBLIC_APP_ORIGIN)return c.json({status:'media_studio_unavailable'},503)
  if(auth.length>512||!await timingSafeEqual(auth,`Bearer ${token}`)||!allowedOperatorOrigin(c.req.raw,env.PUBLIC_APP_ORIGIN)||!c.req.header('CF-Connecting-IP')||c.req.header('CF-Connecting-IP')!.length>64)return c.json({error:'Operator access required.'},403)
  await next()
}
mediaApi.use('*',mediaOperatorAuth)
mediaApi.onError((error,c)=>{
  if(error instanceof RevisionConflict)return c.json({error:error.message},409)
  if(error instanceof CatalogConflict)return c.json({error:error.message},409)
  if(error instanceof z.ZodError||error instanceof SyntaxError)return c.json({error:'Invalid Media Studio input.'},400)
  if(error instanceof RangeError)return c.json({error:error.message},413)
  return c.json({error:'Media Studio operation unavailable.'},503)
})
const store=(env:Bindings)=>new MediaStore(env.CATALOG_DB!,env.MEDIA_BUCKET!,env.PUBLIC_APP_ORIGIN!)
const json=async(request:Request,max=150000)=>{let value:string;try{value=await boundedText(request.body,max)}catch{throw new RangeError(`Request exceeds ${Math.floor(max/1000)} KiB.`)}return JSON.parse(value) as unknown}

export const mediaRoot:Handler<{Bindings:Bindings}>=async c=>c.json(await store(c.env).list())
mediaApi.get('/',mediaRoot)
const feedbackAvailable=(env:Bindings)=>env.EDITORIAL_FEEDBACK_ENABLED==='true'&&!!env.CATALOG_DB
mediaApi.get('/editorial/articles',async c=>feedbackAvailable(c.env)?c.json({articles:await listRecentArticles(c.env.CATALOG_DB!)}):c.json({error:'Editorial feedback unavailable.'},503))
mediaApi.get('/editorial/feedback/:articleId',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  const id=z.string().regex(/^article-version-[a-f0-9]{64}$/).parse(c.req.param('articleId'))
  return c.json({feedback:await feedbackHistory(c.env.CATALOG_DB!,id)})
})
mediaApi.post('/editorial/feedback',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  try{return c.json(await saveFeedback(c.env.CATALOG_DB!,feedbackInput.parse(await json(c.req.raw,5000))),201)}
  catch(error){if(error instanceof Error&&/Article version|identical editorial/.test(error.message))return c.json({error:error.message},409);throw error}
})
mediaApi.get('/editorial/principles',async c=>feedbackAvailable(c.env)?c.json({principles:await listPrinciples(c.env.CATALOG_DB!)}):c.json({error:'Editorial feedback unavailable.'},503))
mediaApi.patch('/editorial/principles/:id',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  try{return c.json(await updatePrinciple(c.env.CATALOG_DB!,c.req.param('id'),principleUpdate.parse(await json(c.req.raw,3000))))}
  catch(error){if(error instanceof Error&&/Editorial principle|Approve the principle|identical editorial/.test(error.message))return c.json({error:error.message},409);throw error}
})
mediaApi.get('/editorial/versions/:jobId/:articleId',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  return c.json(await listArticleVersions(c.env.CATALOG_DB!,c.req.param('jobId'),c.req.param('articleId')))
})
mediaApi.post('/editorial/revisions',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  const input=revisionInput.parse(await json(c.req.raw,3000))
  return c.json(await requestArticleRevision(c.env,input,c.req.header('CF-Connecting-IP')!),201)
})
mediaApi.post('/editorial/decisions',async c=>{
  if(!feedbackAvailable(c.env))return c.json({error:'Editorial feedback unavailable.'},503)
  return c.json(await decideArticleVersion(c.env,decisionInput.parse(await json(c.req.raw,2000))))
})
mediaApi.post('/batches',async c=>{const input=z.strictObject({sourceText:z.string().max(100000).default('')}).parse(await json(c.req.raw));return c.json({batchId:await store(c.env).createBatch(input.sourceText)},201)})
mediaApi.post('/parse',async c=>{const input=z.strictObject({sourceText:z.string().max(100000)}).parse(await json(c.req.raw));return c.json(parseStudioText(input.sourceText))})
mediaApi.post('/imports',async c=>c.json(await store(c.env).import(await json(c.req.raw)),201))
mediaApi.post('/uploads',async c=>{
  const length=Number(c.req.header('Content-Length')??0);if(!Number.isFinite(length)||length<=0||length>MEDIA_MAX_BYTES+65536)throw new RangeError('Upload exceeds the 2 MiB image limit.')
  if(!c.req.header('Content-Type')?.toLowerCase().startsWith('multipart/form-data;'))return c.json({error:'Multipart image upload required.'},415)
  const form=await c.req.formData(),file=form.get('file'),batch=form.get('batchId')
  if(!(file instanceof File))return c.json({error:'One image file is required.'},400)
  return c.json(await store(c.env).upload(file,typeof batch==='string'&&batch?z.uuid().parse(batch):undefined),201)
})
mediaApi.patch('/assets/:id',async c=>c.json(await store(c.env).link(versionId.parse(c.req.param('id')),await json(c.req.raw))))
mediaApi.patch('/metadata',async c=>c.json(await store(c.env).updateMetadata(mediaMetadataUpdate.parse(await json(c.req.raw)))))
mediaApi.delete('/assets/:id',async c=>c.json(await store(c.env).remove(versionId.parse(c.req.param('id')))))
mediaApi.get('/assets/:id/file',async c=>{
  const {row,object}=await store(c.env).bytes(versionId.parse(c.req.param('id')))
  return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.byte_size),'Content-Disposition':`inline; filename="${row.filename.replace(/["\\]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}})
})

export async function publicMedia(request:Request,env:Bindings,version:string){
  try{const {row,object}=await store(env).bytes(versionId.parse(version),true);const etag=`"${row.sha256}"`;if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'no-store'}});return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.byte_size),ETag:etag,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})}catch{return new Response(JSON.stringify({error:'Media unavailable.'}),{status:404,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
}
