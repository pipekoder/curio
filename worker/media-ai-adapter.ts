import { AssetAnalysisError, imageDimensions } from './asset-classifier'
import { sha256, type MediaMime } from './media-store'

export type R2MediaPermit = { versionId:string; assetId:string; r2Key:string; sha256:string; width:number; height:number; mime:MediaMime; analysisEvidence:string; byteSize:number }

export async function resolveR2MediaPermit(db:D1Database,versionId:string):Promise<R2MediaPermit|null>{
  const row=await db.prepare(`SELECT m.version_id,m.asset_id,m.r2_key,m.sha256,m.width,m.height,m.mime_type AS mime,m.byte_size,
    p.evidence AS analysis_evidence FROM media_objects m JOIN asset_versions v ON v.id=m.version_id JOIN catalog_assets a ON a.id=v.asset_id
    JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='ai_analysis'
    JOIN content_catalog_links l ON l.asset_version=v.id JOIN content_versions cv ON cv.id=l.content_version JOIN content_nodes n ON n.id=cv.node_id
    WHERE m.version_id=? AND m.active=1 AND m.deleted_at IS NULL AND a.archived_at IS NULL
    AND v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)
    AND p.status='approved' AND p.evidence IS NOT NULL AND n.latest_version=cv.id AND n.availability='active'
    AND COALESCE((SELECT status FROM content_reviews cr WHERE cr.version_id=cv.id AND cr.purpose='ai_analysis' ORDER BY cr.sequence DESC LIMIT 1),'pending')='approved'`).bind(versionId).first<Record<string,unknown>>()
  if(!row)return null
  return {versionId:String(row.version_id),assetId:String(row.asset_id),r2Key:String(row.r2_key),sha256:String(row.sha256),width:Number(row.width),height:Number(row.height),mime:String(row.mime) as MediaMime,analysisEvidence:String(row.analysis_evidence),byteSize:Number(row.byte_size)}
}

export async function readR2MediaData(bucket:R2Bucket,permit:R2MediaPermit,signal:AbortSignal){
  signal.throwIfAborted();const object=await bucket.get(permit.r2Key);if(!object)throw new AssetAnalysisError('invalid_media',415)
  if(object.size!==permit.byteSize||object.size>2*1024*1024)throw new AssetAnalysisError('image_too_large',415)
  const bytes=new Uint8Array(await object.arrayBuffer());signal.throwIfAborted()
  const [width,height]=imageDimensions(bytes,permit.mime);if(width!==permit.width||height!==permit.height)throw new AssetAnalysisError('image_dimensions_changed',415)
  if(await sha256(bytes)!==permit.sha256)throw new AssetAnalysisError('media_fingerprint_changed',415)
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  return `data:${permit.mime};base64,${btoa(binary)}`
}
