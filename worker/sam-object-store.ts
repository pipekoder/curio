import {z} from 'zod'
import {segmentation,type Segmentation} from '../shared/decoder'
import {CatalogPublications} from './catalog-publications'
import {isSafeHttpsUrl} from '../shared/url-policy'

const version=z.string().regex(/^version-[a-f0-9]{64}$/)
const captureId=z.string().regex(/^sam-capture-[a-f0-9]{64}$/)
const regionId=z.string().regex(/^[a-z0-9-]{1,80}$/)
const reviewInput=z.strictObject({regionId,expectedRevision:z.number().int().min(0),status:z.enum(['approved','blocked']),editorialDetail:z.string().trim().min(10).max(500).refine(value=>!/(<[^>]*>|https?:\/\/|www\.)/i.test(value)).optional(),productId:z.string().regex(/^product-[a-z0-9-]{1,70}$/).nullable().default(null),identityEvidence:z.string().trim().max(300).refine(value=>!value||isSafeHttpsUrl(value)||/^docs\/[a-zA-Z0-9/_#.-]+$/.test(value)).nullable().default(null)})
type StoredCapture={imageSha256:string;concept:string;regions:{id:string;detailId:string;box:{x:number;y:number;width:number;height:number};confidence:number|null}[]}

const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')
export class SamObjectStore {
 constructor(private db:D1Database){}
 async reusable(adId:string,versionId:string,imageSha256:string,concept:string,detailId:string){
  version.parse(versionId)
  const row=await this.db.prepare(`SELECT o.id,o.output_json,o.width,o.height FROM object_regions o JOIN media_objects m ON m.version_id=o.version_id JOIN asset_versions v ON v.id=m.version_id JOIN catalog_assets a ON a.id=v.asset_id WHERE o.version_id=? AND o.origin='sam_detection' AND m.active=1 AND m.deleted_at IS NULL AND a.archived_at IS NULL AND v.sha256=? AND v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1) ORDER BY o.created_at DESC LIMIT 20`).bind(versionId,imageSha256).all<{id:string;output_json:string;width:number;height:number}>()
  for(const item of row.results){const output=JSON.parse(item.output_json) as StoredCapture;if(output.imageSha256!==imageSha256||output.concept!==concept||output.regions.some(region=>region.detailId!==detailId))continue
   return {captureId:item.id,segmentation:segmentation.parse({adId,assetId:versionId,width:item.width,height:item.height,source:'sam_detection',model:'sam-3.1',regions:output.regions.map(region=>({...region,uncertainty:'model_estimate_not_identity'}))})}
  }
  return null
 }
 async capture(input:{versionId:string;imageSha256:string;concept:string;segmentation:Segmentation}){
  const versionId=version.parse(input.versionId),result=segmentation.parse(input.segmentation)
  if(result.source!=='sam_detection'||result.model!=='sam-3.1'||result.assetId!==versionId||! /^[a-f0-9]{64}$/.test(input.imageSha256)||!input.concept.trim())throw Error('Exact Meta capture required')
  const current=await this.db.prepare(`SELECT v.sha256,v.width,v.height FROM asset_versions v JOIN media_objects m ON m.version_id=v.id JOIN catalog_assets a ON a.id=v.asset_id JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='ai_analysis' AND p.status='approved' WHERE v.id=? AND v.sha256=? AND m.active=1 AND m.deleted_at IS NULL AND a.archived_at IS NULL AND v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)`).bind(versionId,input.imageSha256).first<{sha256:string;width:number;height:number}>()
  if(!current||current.width!==result.width||current.height!==result.height)throw Error('Stale, unapproved or mismatched image version')
  const id=`sam-capture-${await digest(JSON.stringify([versionId,input.imageSha256,input.concept,result.regions]))}`
  const output:StoredCapture={imageSha256:input.imageSha256,concept:input.concept,regions:result.regions.map(({id,detailId,box,confidence})=>({id,detailId,box,confidence}))}
  const stamp=new Date().toISOString()
  await this.db.prepare(`INSERT OR IGNORE INTO object_regions(id,version_id,origin,model,width,height,output_json,created_at) VALUES(?,?,'sam_detection','sam-3.1',?,?,?,?)`).bind(id,versionId,result.width,result.height,JSON.stringify(output),stamp).run()
  for(const region of result.regions)await this.db.prepare(`INSERT OR IGNORE INTO sam_object_reviews(capture_id,region_id,status) VALUES(?,?,'pending')`).bind(id,region.id).run()
  return {captureId:id,regionCount:result.regions.length,status:'pending_review' as const}
 }
 async review(id:string,input:unknown){
  captureId.parse(id);const r=reviewInput.parse(input)
  const row=await this.db.prepare(`SELECT o.version_id,o.output_json,m.active,m.deleted_at,v.sha256 FROM object_regions o JOIN asset_versions v ON v.id=o.version_id JOIN media_objects m ON m.version_id=v.id WHERE o.id=? AND o.origin='sam_detection'`).bind(id).first<{version_id:string;output_json:string;active:number;deleted_at:string|null;sha256:string}>()
  if(!row||row.active!==1||row.deleted_at||!JSON.parse(row.output_json).regions.some((region:{id:string})=>region.id===r.regionId)||JSON.parse(row.output_json).imageSha256!==row.sha256)throw Error('Capture unavailable')
  if(r.status==='approved'){
   const published=await new CatalogPublications(this.db).list('',1,[row.version_id])
   if(!published.items.some(item=>item.image.id===row.version_id&&item.permissions.aiAnalysis.status==='approved'))throw Error('Publication or analysis permission unavailable')
  }
  if(r.status==='approved'&&!r.editorialDetail)throw Error('Reviewed editorial detail required')
  if(r.productId){
   if(!r.identityEvidence)throw Error('Product identity evidence required')
   const linked=await this.db.prepare('SELECT 1 FROM media_product_images WHERE version_id=? AND product_id=?').bind(row.version_id,r.productId).first()
   if(!linked)throw Error('Product is not linked to this image version')
  }
  const result=await this.db.prepare(`UPDATE sam_object_reviews SET status=?,editorial_detail=?,product_id=?,identity_evidence=?,reviewer='catalog-operator',reviewed_at=?,revision=revision+1 WHERE capture_id=? AND region_id=? AND revision=?`).bind(r.status,r.status==='approved'?r.editorialDetail:null,r.status==='approved'?r.productId:null,r.status==='approved'?r.identityEvidence:null,new Date().toISOString(),id,r.regionId,r.expectedRevision).run()
  if(result.meta.changes!==1)throw Error('Stale review revision')
  return {captureId:id,regionId:r.regionId,status:r.status,revision:r.expectedRevision+1}
 }
 async published(versionId:string){
  version.parse(versionId)
  const publication=await new CatalogPublications(this.db).list('',1,[versionId])
  const item=publication.items.find(item=>item.image.id===versionId)
  if(!item||item.permissions.display.status!=='approved'||item.permissions.aiAnalysis.status!=='approved')return null
  const rows=(await this.db.prepare(`SELECT o.id,o.output_json,o.width,o.height,r.region_id,r.editorial_detail,r.product_id,r.identity_evidence,p.name AS product_name,m.sha256,m.active,m.deleted_at FROM object_regions o JOIN sam_object_reviews r ON r.capture_id=o.id JOIN media_objects m ON m.version_id=o.version_id LEFT JOIN media_products p ON p.id=r.product_id WHERE o.version_id=? AND o.origin='sam_detection' AND r.status='approved' ORDER BY o.created_at DESC LIMIT 40`).bind(versionId).all<{id:string;output_json:string;width:number;height:number;region_id:string;editorial_detail:string;product_id:string|null;identity_evidence:string|null;product_name:string|null;sha256:string;active:number;deleted_at:string|null}>()).results
  const seen=new Set<string>(),regions=[]
  for(const row of rows){
   if(row.active!==1||row.deleted_at||!row.editorial_detail)continue
   const capture=JSON.parse(row.output_json) as StoredCapture
   if(capture.imageSha256!==row.sha256||row.product_id&&!row.identity_evidence)continue
   if(row.product_id&&!await this.db.prepare('SELECT 1 FROM media_product_images WHERE version_id=? AND product_id=?').bind(versionId,row.product_id).first())continue
   const region=capture.regions.find(region=>region.id===row.region_id)
   if(!region||seen.has(row.region_id))continue
   seen.add(row.region_id)
   regions.push({id:`${row.id}:${region.id}`,box:region.box,label:item.discoverableObjects.find(detail=>detail.id===region.detailId)?.label??capture.concept,editorialDetail:row.editorial_detail,product:row.product_id?{id:row.product_id,name:row.product_name,kind:'owner_mockup'}:null,provenance:{origin:'sam_detection',model:'sam-3.1',uncertainty:'model_estimate_not_identity',reviewed:true},confidence:region.confidence})
  }
  return {catalogId:item.id,assetId:versionId,width:item.image.width,height:item.image.height,regions}
 }
}
