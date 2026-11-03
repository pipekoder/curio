// @vitest-environment node
import {expect,it} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {editorialArticlePool} from '../worker/editorial-article-pool'
import {ANALYSIS_SPEC} from '../worker/asset-classifier'

// Production-like pool run: one fully eligible version plus one published
// but unanalyzed version with a failed Meta job. Exercises the exact #82
// review-scope retrieval, publication join, R2 checks, source lookup and
// analysis-job join that Production runs before the Chief Editor call.
const sha1='a'.repeat(64),sha2='b'.repeat(64)
const v1=`version-${sha1}`,v2=`version-${sha2}`

function catalogJson(n:number,version:string,asset:string){
  return JSON.stringify({
    id:`pool-demo-0${n}`,category:'home',name:`Pool demo piece ${n}`,description:`Owner-supplied pool demo piece ${n}.`,
    lifestyleTags:['Scandinavian'],sourceType:'editorial_support',advertiser:null,
    campaign:{title:`Pool study ${n}`,reference:null},
    image:{id:version,path:null,externalUrl:`https://example.com/assets/pool-${n}.jpg`,fallbackPath:null,alt:`Pool demo piece ${n} in soft light.`,width:800,height:600,role:'supplied_image'},
    provenance:{origin:'owner_supplied',sourceUrl:null,originalSourcePage:`https://example.com/pages/pool-${n}`,evidence:'docs/field-guide',attribution:`Pool attribution ${n}`,modifications:[]},
    licensing:{status:'cleared',rightsHolder:`Pool rights ${n}`,evidence:'docs/field-guide'},
    permissions:{
      display:{status:'approved',evidence:'docs/evidence/display'},
      aiAnalysis:{status:'approved',evidence:'docs/evidence/analysis'},
      edits:{status:'pending',evidence:null},
    },
    verifiedBrandLink:null,discoverableObjects:[],
  })
}

function seed(){
  const sqlite=new DatabaseSync(':memory:')
  for(const n of ['0001_catalog','0002_asset_intelligence','0003_discovery_content','0004_media_studio','0005_sam_object_reviews','0006_longform_jobs','0007_article_edition_jobs'])
    sqlite.exec(readFileSync(`migrations/${n}.sql`,'utf8'))
  sqlite.exec(`INSERT INTO brand_sources(id,name,entry_url,kind,issue_url,created_at) VALUES('bs-pool','Pool Brand','https://example.com/brand','gallery','https://example.com/issue','2026-01-01')`)
  sqlite.exec(`INSERT INTO source_identity_reviews(source_id,canonical_brand_id,brand_name,evidence,reviewer,reviewed_at) VALUES('bs-pool','brand-pool','Pool Brand','docs/evidence/brand','op','2026-01-01')`)
  const asset=(n:number,version:string,asset:string,sha:string)=>{
    sqlite.prepare(`INSERT INTO catalog_assets(id,image_url,created_at) VALUES(?,?,'2026-01-01')`).run(asset,`https://example.com/assets/pool-${n}.jpg`)
    sqlite.prepare(`INSERT INTO asset_versions(id,asset_id,version_key,manifest_hash,sha256,width,height,source_type,provenance_json,created_at) VALUES(?,?,?,?,?,?,?,'brand_candidate','{}','2026-01-01')`).run(version,asset,`v${n}`,`m${n}`,sha,800,600)
    sqlite.prepare(`INSERT INTO media_objects(version_id,asset_id,r2_key,filename,sha256,byte_size,width,height,mime_type,image_type,active,created_at) VALUES(?,?,?,?,?,?,?,?,'image/jpeg','product',1,'2026-01-01')`).run(version,asset,`pool/${n}.jpg`,`pool-${n}.jpg`,sha,1000+n,800,600)
    sqlite.prepare(`INSERT INTO publisher_metadata(version_id,source_id,publisher_name,hints_json,source_page,observed_at) VALUES(?,'bs-pool','Pool Press','{}','https://example.com/pages/pool-pub','2026-01-01')`).run(version)
    sqlite.prepare(`INSERT INTO asset_permissions(version_id,purpose,status,evidence,rights_holder,reviewer,reviewed_at,revision) VALUES(?,'display','approved','docs/evidence/display','Pool Rights','op','2026-01-01',0)`).run(version)
    sqlite.prepare(`INSERT INTO asset_permissions(version_id,purpose,status,evidence,rights_holder,reviewer,reviewed_at,revision) VALUES(?,'ai_analysis','approved','docs/evidence/analysis','Pool Rights','op','2026-01-01',0)`).run(version)
    sqlite.prepare(`INSERT INTO asset_access_checks(version_id,status,transport,checked_at) VALUES(?,'reachable','https','2026-01-01')`).run(version)
    sqlite.prepare(`INSERT INTO reader_asset_reviews(version_id,source_id,alt,attribution,source_page,licensing_evidence,reviewer,reviewed_at) VALUES(?,'bs-pool',?,?,?,'docs/field-guide','op','2026-01-01')`).run(version,`Pool demo piece ${n} in soft light.`,`Pool attribution ${n}`,`https://example.com/pages/pool-${n}`)
    sqlite.prepare(`INSERT INTO content_nodes(id,source_id,original_url,kind,latest_version,availability) VALUES(?,?,?,?,?,?)`).run(`node-${n}`,'bs-pool',`https://example.com/node-${n}`,'article',`cv-${n}`,'active')
    sqlite.prepare(`INSERT INTO content_versions(id,node_id,fingerprint,content_json,created_at) VALUES(?,?,'fp','{}','2026-01-01')`).run(`cv-${n}`,`node-${n}`)
    sqlite.prepare(`INSERT INTO content_catalog_links(content_version,asset_version) VALUES(?,?)`).run(`cv-${n}`,version)
    sqlite.prepare(`INSERT INTO content_reviews(version_id,purpose,status,evidence,reviewer,reviewed_at) VALUES(?,'display','approved','docs/evidence/content','op','2026-01-01')`).run(`cv-${n}`)
    sqlite.prepare(`INSERT INTO content_reviews(version_id,purpose,status,evidence,reviewer,reviewed_at) VALUES(?,'ai_analysis','approved','docs/evidence/content','op','2026-01-01')`).run(`cv-${n}`)
    sqlite.prepare(`INSERT INTO catalog_publications(version_id,catalog_json,reviewer,reviewed_at) VALUES(?,?,?,?)`).run(version,catalogJson(n,version,asset),'op','2026-01-01')
  }
  asset(1,v1,'asset-pool-1',sha1)
  asset(2,v2,'asset-pool-2',sha2)
  sqlite.exec(`INSERT INTO media_brands(id,name,story,description,created_at,updated_at) VALUES('brand-pool','Pool Brand','A quiet pool story.','Pool brand description.','2026-01-01','2026-01-01')`)
  sqlite.exec(`INSERT INTO media_products(id,brand_id,name,description,category,materials_json,created_at,updated_at) VALUES('product-pool','brand-pool','Pool Chair','A quiet chair for soft rooms.','home','[]','2026-01-01','2026-01-01')`)
  sqlite.exec(`INSERT INTO media_product_images(product_id,version_id,role) VALUES('product-pool','${v1}','primary'),('product-pool','${v2}','gallery')`)
  sqlite.prepare(`INSERT INTO asset_intelligence(id,version_id,model,origin,output_json,created_at) VALUES(?,?,?,?,?,?)`).run('int-pool-1',v1,'muse-spark-1.3','meta',JSON.stringify({
    versionId:v1,imageSha256:sha1,categoryScores:{home:0.9,fashion:0.1,travel:0.1},
    aestheticScores:{'Japanese Wabi-Sabi':0.1,'Gaudí / Catalan Modernism':0.1,'Scandinavian':0.8,'French Style':0.1,'British Vintage & Eclectic':0.1,'Quiet Luxury':0.2,'Urban Creative':0.1,'Nature & Outdoor':0.1},
    tags:['quiet'],objects:['chair'],colors:['oak'],
    observations:{subjects:['seating'],materialAppearance:['wood-like'],environments:['interior-like'],relationships:['light-and-shadow']},
    mood:'Calm.',composition:'Centered.',editorialThemes:['quiet rooms'],editorialRelevance:0.8,
  }),'2026-01-01')
  sqlite.prepare(`INSERT INTO asset_analysis_jobs(cache_key,version_id,image_sha256,model,spec,origin,permission_revision,claim_token,lease_until,intelligence_id,updated_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('job-pool-1',v1,sha1,'muse-spark-1.3',ANALYSIS_SPEC,'meta',0,'claim-1',Date.now()+60000,'int-pool-1','2026-01-01','succeeded')
  sqlite.prepare(`INSERT INTO asset_analysis_jobs(cache_key,version_id,image_sha256,model,spec,origin,permission_revision,claim_token,lease_until,error_code,updated_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('job-pool-2',v2,sha2,'muse-spark-1.3',ANALYSIS_SPEC,'meta',0,'claim-2',Date.now()-1000,'analysis_failed','2026-01-01','failed')
  return sqlite
}

const d1=(sqlite:DatabaseSync)=>({
  prepare:(sql:string)=>{
    const run=(params:unknown[])=>({
      first:async()=>(sqlite.prepare(sql).get(...params as never[]) as Record<string,unknown>|undefined)??null,
      all:async()=>({results:sqlite.prepare(sql).all(...params as never[]) as Record<string,unknown>[]}),
      run:async()=>sqlite.prepare(sql).run(...params as never[]),
    })
    return {bind:(...params:unknown[])=>run(params),...run([])}
  },
}) as unknown as D1Database

it('stages the analyzed version and classifies the failed job without throwing',async()=>{
  const sqlite=seed()
  const sizes=new Map([[`pool/1.jpg`,1001],[`pool/2.jpg`,1002]])
  const shas=new Map([[`pool/1.jpg`,sha1],[`pool/2.jpg`,sha2]])
  const env={
    CATALOG_DB:d1(sqlite),
    MEDIA_BUCKET:{head:async(key:string)=>sizes.has(key)?{size:sizes.get(key),customMetadata:{sha256:shas.get(key),versionId:key==='pool/1.jpg'?v1:v2}}:null},
    CATALOG_PUBLIC_ENABLED:'true',
  } as never
  const pool=await editorialArticlePool(env,{interests:'quiet light and soft rooms',aesthetics:['Scandinavian'],allocations:{home:100,fashion:0,travel:0},mode:'Balanced',consent:true})
  expect(pool.eligibleCount).toBe(1)
  expect(pool.items.map(item=>item.image.id)).toEqual([v1])
  expect(pool.preparation?.failed).toBe(1)
  expect(pool.preparation?.exclusions.analysis_failed).toBe(1)
  expect(pool.preparation?.rankedCount).toBe(2)
})
