// @vitest-environment node
import {afterEach,beforeEach,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {mediaApi} from '../worker/media-api'
import {activePrincipleInstruction,articleRevisionFeedback,generationVersion,listRecentArticles,saveFeedback,feedbackHistory,listPrinciples,updatePrinciple} from '../worker/editorial-feedback'

let mf:Miniflare,db:D1Database
const token='owner-only-test-token-more-than-32-characters',origin='https://curio.example.com',asset=`version-${'a'.repeat(64)}`,articleId=`article-${asset}`,jobId=`article-job-${'b'.repeat(64)}`
const article={id:articleId,headline:'A room for reading',deck:'An editorial angle.',narrative:'A chair anchors the room.',heroAssetId:asset}
beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database
 for(const file of ['0007_article_edition_jobs.sql','0008_editorial_feedback.sql','0009_editorial_revisions.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 await db.prepare('INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,result_json,created_at,updated_at) VALUES(?,?,?,\'completed\',?,?,?)').bind(jobId,'ip','input',JSON.stringify({articleEdition:{articles:[article]}}),1,1).run()
})
afterEach(async()=>mf?.dispose())
it('authenticates owner, verifies exact article version, and isolates article-specific feedback',async()=>{
 const version=await generationVersion(article),env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:origin,CATALOG_DB:db,MEDIA_BUCKET:{},EDITORIAL_FEEDBACK_ENABLED:'true'} as never
 const body=JSON.stringify({jobId,articleId,generationVersion:version,decision:'revise',categories:['Story Coherence'],text:'Develop the brand story.',saveAsPrinciple:false})
 const headers={Origin:origin,'CF-Connecting-IP':'192.0.2.10',Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
 expect((await mediaApi.request(`${origin}/editorial/feedback`,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body},env)).status).toBe(403)
 expect((await mediaApi.request(`${origin}/editorial/feedback`,{method:'POST',headers:{...headers,Origin:'https://other.example'},body},env)).status).toBe(403)
 expect((await mediaApi.request(`${origin}/editorial/feedback`,{method:'POST',headers,body:body.replace(version,`generation-${'0'.repeat(64)}`)},env)).status).toBe(409)
 expect((await mediaApi.request(`${origin}/editorial/feedback`,{method:'POST',headers,body},env)).status).toBe(201)
 expect(await feedbackHistory(db,articleId)).toHaveLength(1)
 expect(await articleRevisionFeedback(db,[articleId])).toEqual([{articleId,decision:'revise',feedback:'Develop the brand story.'}])
 expect(await articleRevisionFeedback(db,[`article-version-${'c'.repeat(64)}`])).toEqual([])
 expect(await listRecentArticles(db)).toMatchObject([{id:articleId,generationVersion:version}])
 expect((await listPrinciples(db)).length).toBe(1)
})
it('keeps feedback-derived principles draft until separately approved and enabled',async()=>{
 await saveFeedback(db,{jobId,articleId,generationVersion:await generationVersion(article),decision:'revise',categories:['Reader Interest'],text:'Give the reader a concrete question.',saveAsPrinciple:true})
 const draft=(await listPrinciples(db)).find(row=>row.id!=='EF-001')!
 expect(draft).toMatchObject({approved:0,enabled:0})
 expect(await activePrincipleInstruction(db)).not.toContain('concrete question')
 await expect(updatePrinciple(db,draft.id as string,{enabled:true})).rejects.toThrow('Approve')
 await updatePrinciple(db,draft.id as string,{approved:true,enabled:true})
 expect(await activePrincipleInstruction(db)).toContain('concrete question')
 await updatePrinciple(db,draft.id as string,{guidance:'Ask a stronger question.'})
 expect(await activePrincipleInstruction(db)).not.toContain('Ask a stronger question')
})
