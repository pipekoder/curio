import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {discover,discoveryConfig} from './core'
import {SecureDiscoveryTransport} from './network'
import {DiscoveryStore} from '../worker/discovery-store'
const sources=[
 ['norm-gallery','https://normcph.presscloud.com/digitalshowroom/#/gallery'],
 ['hm-home','https://press.hm.com/image-gallery/hm-home'],
 ['hm-events','https://press.hm.com/image-gallery/events'],
 ['hm-move','https://press.hm.com/image-gallery/hm-move'],
 ['zara-press','https://www.zara.com/integration/pressapi/microsite/news/?countryiso=WW&languageiso=pt'],
 ['norm-residence','https://normcph.presscloud.com/digitalshowroom/#/gallery/Norm-Residence'],
]
const directory=resolve('.wrangler/discovery-local');await mkdir(directory,{recursive:true,mode:0o700})
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("Local discovery persistence")}}',compatibilityDate:'2026-10-26',resourcePersistencePath:directory,d1Databases:['CATALOG_DB'],telemetry:{enabled:false},outboundService:()=>{throw Error('No Worker outbound requests')}}))
try{
 const db=await mf.getD1Database('CATALOG_DB') as unknown as D1Database
 for(const [table,file]of [['brand_sources','0001_catalog.sql'],['asset_analysis_jobs','0002_asset_intelligence.sql'],['discovery_runs','0003_discovery_content.sql']])if(!await db.prepare('SELECT name FROM sqlite_master WHERE name=?').bind(table).first())await db.exec((await readFile(`migrations/${file}`,'utf8')).replace(/^--.*$/gm,'').replace(/\s+/g,' '))
 const store=new DiscoveryStore(db),reports=[]
 for(const [name,url]of sources){
  const config=discoveryConfig.parse({hosts:[new URL(url).hostname],maxPages:6,maxImages:30,maxTimeMs:20000,scrolls:2,interactions:2})
  const manifest=await discover(url,config,new SecureDiscoveryTransport(config));await store.save(manifest)
  reports.push({source:name,url,status:manifest.status,stopReasons:manifest.stopReasons,pagesVisited:manifest.pages.filter(p=>p.status==='fetched').length,pagesAttempted:manifest.pages.length,depth:manifest.metrics.maxDepth,imageCandidates:manifest.nodes.filter(n=>n.kind==='image').length,validImageUrls:manifest.nodes.filter(n=>n.image).length,verifiedImageBytes:0,thumbnailResolution:'unverified',duplicates:manifest.metrics.duplicates,imageMetadataCompleteness:null,rights:'pending_review',resources:manifest.metrics})
 }
 const observations=JSON.parse(await readFile('seeds/discovery-source-observations.json','utf8')) as {manifests:unknown[]}
 for(const manifest of observations.manifests)await store.save(manifest)
 const counts=await db.prepare('SELECT (SELECT COUNT(*) FROM brand_sources) AS sources,(SELECT COUNT(*) FROM content_nodes) AS content_nodes,(SELECT COUNT(*) FROM catalog_publications) AS publications').first()
 const report={observedAt:new Date().toISOString(),transport:'secure_operator_engine; separate web_connector shell observations',reports,localPersistence:counts,publishedRealImages:0,modelCalls:0,productionWrites:0,notes:'Connector observations preserve source/gallery metadata only. No image URL or dynamic extraction success is invented. Network policy/DNS-pinning blockers are environment limitations, not evidence the sites denied access.'}
 await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/discovery-six-source-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{await mf.dispose()}
