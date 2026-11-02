// @vitest-environment node
import {readFileSync} from 'node:fs'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import app from '../worker/index'
import {MediaStore} from '../worker/media-store'
import {runClassification,mockUnderstanding} from '../worker/asset-classifier'
import {CatalogPublications} from '../worker/catalog-publications'
import {culturalEvidenceKey,passageProofKey} from '../worker/cultural-evidence-store'
import {CULTURAL_EVIDENCE_VERSION} from '../shared/cultural-evidence'
import type {EditorialPlan} from '../shared/editorial'

vi.setConfig({testTimeout:20000,hookTimeout:20000})
const origin='https://curio.test',sha='a'.repeat(64),passageId=`passage:${'b'.repeat(32)}`
let mf:Miniflare,db:D1Database,bucket:R2Bucket,media:MediaStore,versionId:string,plan:EditorialPlan,pack:Record<string,unknown>
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('')
const env=()=>({CATALOG_DB:db,MEDIA_BUCKET:bucket,CATALOG_PUBLIC_ENABLED:'true',CULTURAL_INTELLIGENCE_V3_ENABLED:'true',PUBLIC_APP_ORIGIN:origin})
const post=(value:unknown=plan,headers:Record<string,string>={})=>app.request(`${origin}/api/editorial/citations`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify({plan:value})},env() as never)
const putPack=async()=>bucket.put(await culturalEvidenceKey([versionId]),JSON.stringify(pack))

beforeEach(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-26',d1Databases:['CATALOG_DB'],r2Buckets:['MEDIA_BUCKET'],telemetry:{enabled:false}}))
 db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database;bucket=await mf.getR2Bucket('MEDIA_BUCKET') as unknown as R2Bucket
 for(const file of ['0001_catalog.sql','0002_asset_intelligence.sql','0003_discovery_content.sql','0004_media_studio.sql'])await db.exec(readFileSync(`migrations/${file}`,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 media=new MediaStore(db,bucket,origin)
 const filename='02_ceramic_vase.png',upload=await media.upload(new File([readFileSync(`public/editorial/discover/${filename}`)],filename,{type:'image/png'}));versionId=upload.versionId
 await media.import({sourceText:'Owner mockup',brands:[{name:'Test Studio',story:'A fictional brand story for tests.'}],products:[{brand:'Test Studio',name:'Vessel Study',description:'A fictional vessel for editorial tests.',category:'home',materials:[],imageFilenames:[filename],lifestyleTags:['Scandinavian']}],campaigns:[]})
 await runClassification({versionId,mode:'meta',retryFailed:false,consent:true},{CATALOG_DB:db,MEDIA_BUCKET:bucket,ASSET_AI_ENABLED:'true',META_SPARK_MODEL:'muse-spark-1.3',META_API_KEY:'TEST'} as never,'192.0.2.1',{reserve:vi.fn(async()=>({allowed:true,retryAfter:0})),classify:vi.fn(async()=>({...mockUnderstanding(versionId),imageSha256:upload.sha256,observations:{subjects:['lighting' as const],materialAppearance:[],environments:[],relationships:[]}}))})
 const item=(await new CatalogPublications(db).list('',6,[versionId])).items[0]
 const claimText='A reviewed cultural comparison connects this vessel to everyday rituals.'
 const passageText='A test passage describing an everyday ritual around a vessel.'
 pack={version:CULTURAL_EVIDENCE_VERSION,id:'pack:public-test',createdAt:'2026-11-02T00:00:00.000Z',assetVersionIds:[versionId],sourceIds:['source:public-test'],sources:[{id:'source:public-test',canonicalUrl:'https://example.org/ritual',origin:'https://example.org',retrievedAt:'2026-11-02T00:00:00.000Z',sha256:sha,author:null,publication:'Example Review',publishedAt:null,rights:'approved_for_paraphrase',verification:'operator_reviewed'}],passages:[{id:passageId,sourceId:'source:public-test',text:passageText,documentSha256:sha,start:0,end:passageText.length}],claims:[{id:'claim:ritual',text:claimText,kind:'comparison',assetVersionIds:[versionId],passageIds:[passageId],status:'reviewed',conflict:null}],relationships:[],status:'approved',reviewRevision:1,reviewHistory:[{revision:1,action:'approve',at:'2026-11-02T00:00:00.000Z',actor:'catalog-operator'}]}
 await bucket.put(passageProofKey(passageId),JSON.stringify({id:passageId,sourceId:'source:public-test',url:'https://example.org/ritual',documentSha256:sha,textSha256:await digest(passageText),start:0,end:passageText.length}))
 await putPack()
 const sourceId=`${versionId}:cultural_claim:claim:ritual`,narrative=`${claimText} The visible form invites another question.`
 plan={qualityVersion:3,culturalEvidenceVersion:CULTURAL_EVIDENCE_VERSION,title:'An Everyday Study of Ritual',deck:'A grounded exploration of an everyday vessel and its context.',features:[{catalogId:item.id,assetId:versionId,headline:'The Vessel and the Ritual',narrative,observationKeys:['subjects.lighting'],discoveryQuestion:'What does this daily practice help us notice?',sourceIds:[`${versionId}:brand_name`,sourceId],culturalClaims:[{sourceId,narrativeText:claimText}],layout:'hero',motion:'still',theme:item.lifestyleTags[0]}],connections:[]}
})
afterEach(async()=>mf.dispose())

it('returns a bounded, rights-aware public citation without private pack metadata',async()=>{
 const response=await post();expect(response.status).toBe(200)
 expect(response.headers.get('Cache-Control')).toBe('no-store')
 const body=await response.json() as {version:string;features:{citations:{sources:{support:{kind:string;text:string}}[]}[]}[]}
 expect(body).toMatchObject({version:'curio-public-citations-v1',features:[{catalogId:plan.features[0].catalogId,assetId:versionId,citations:[{claimId:'claim:ritual',evidenceStatus:'operator_reviewed',reviewStatus:'approved',sources:[{canonicalUrl:'https://example.org/ritual',publication:'Example Review',support:{kind:'reviewed_paraphrase',text:'A reviewed cultural comparison connects this vessel to everyday rituals.'}}]}]}]})
 expect(JSON.stringify(body)).not.toContain('reviewHistory')
 expect(JSON.stringify(body)).not.toContain('A test passage describing')
 const reviewedSource=(pack.sources as Record<string,unknown>[])[0];reviewedSource.rights='approved_for_quotation';await putPack()
 const quoted=await (await post()).json() as {features:{citations:{sources:{support:{kind:string;text:string}}[]}[]}[]}
 expect(quoted.features[0].citations[0].sources[0].support).toEqual({kind:'approved_excerpt',text:'A test passage describing an everyday ritual around a vessel.'})
 const noClaims={...plan,culturalEvidenceVersion:undefined,features:[{...plan.features[0],sourceIds:[`${versionId}:brand_name`],culturalClaims:undefined}]}
 expect(await (await post(noClaims)).json()).toMatchObject({version:'curio-public-citations-v1',features:[]})
})
it('fails closed on missing claims, invalid source URLs, revoked review, stale versions and cross-origin requests',async()=>{
 const disabled=await app.request(`${origin}/api/editorial/citations`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({plan})},{...env(),CULTURAL_INTELLIGENCE_V3_ENABLED:'false'} as never)
 expect(disabled.status).toBe(503)
 expect((await post(plan,{Origin:'https://evil.example'})).status).toBe(403)
 const extra=await app.request(`${origin}/api/editorial/citations`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({plan,prompt:'private prompt should not be accepted'})},env() as never)
 expect(extra.status).toBe(400)
 expect((await post({...plan,features:[{...plan.features[0],culturalClaims:[{sourceId:'missing',narrativeText:'A reviewed cultural comparison'}]}]})).status).toBe(404)
 expect((await post({...plan,features:[{...plan.features[0],assetId:`version-${'c'.repeat(64)}`}]})).status).toBe(404)
 const original=structuredClone(pack)
 const source=(pack.sources as Record<string,unknown>[])[0]
 source.canonicalUrl='https://127.0.0.1/private';await putPack();expect((await post()).status).toBe(404)
 pack=structuredClone(original);(pack.sources as Record<string,unknown>[])[0].rights='pending';await putPack();expect((await post()).status).toBe(404)
 pack={...original,status:'rejected',reviewRevision:2,reviewHistory:[...(original.reviewHistory as unknown[]),{revision:2,action:'revoke',at:'2026-11-02T01:00:00.000Z',actor:'catalog-operator'}]};await putPack();expect((await post()).status).toBe(404)
 pack=original;await putPack();await media.remove(versionId);expect((await post()).status).toBe(404)
})
