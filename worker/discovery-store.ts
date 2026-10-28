import { z } from 'zod'
import { permissionReview } from './catalog-contracts'
import { discoveryManifest, type DiscoveryManifest, type DiscoveredContent } from '../shared/discovery'
import { catalogDigest, D1Catalog, CatalogConflict } from './catalog-store'
import { AssetStore } from './asset-store'
export const contentNodeId = async (source: string, url: string, kind: string) => `content-${await catalogDigest(JSON.stringify([source,url,kind]))}`
export async function contentFingerprint(node: Omit<DiscoveredContent,'fingerprint'|'id'>) { return catalogDigest(JSON.stringify(node)) }
export class DiscoveryStore {
  constructor(public db: D1Database) {}
  async save(input: unknown) {
    const m: DiscoveryManifest = discoveryManifest.parse(input), encoded = JSON.stringify(m)
    if (new TextEncoder().encode(encoded).length > 256000) throw new CatalogConflict('Split the bounded discovery manifest.')
    const existing = await this.db.prepare('SELECT manifest_json FROM discovery_runs WHERE id=?').bind(m.jobId).first<{manifest_json:string}>()
    if (existing) { if (existing.manifest_json !== encoded) throw new CatalogConflict('Immutable discovery run.'); return { replay: true, jobId: m.jobId } }
    if(m.sourceId!==`source-${(await catalogDigest(new URL(m.startUrl).hostname)).slice(0,40)}`)throw new CatalogConflict('Stable source identity required.')
    const seen = new Set(m.nodes.map(n=>n.id)); if(seen.size!==m.nodes.length || m.edges.some(e=>!seen.has(e.from)||!seen.has(e.to))) throw new CatalogConflict('Invalid discovery graph.')
    const priorRows=(await this.db.prepare(`SELECT n.id,n.latest_version,v.fingerprint FROM content_nodes n LEFT JOIN content_versions v ON v.id=n.latest_version WHERE n.id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify([...seen])).all<{id:string;latest_version:string;fingerprint:string}>()).results
    const rows = []
    for (const node of m.nodes) {
      const { id, fingerprint, ...data }=node
      if(id!==await contentNodeId(m.sourceId,node.url,node.kind) || fingerprint!==await contentFingerprint(data)) throw new CatalogConflict('Invalid content identity/fingerprint.')
      const prior = priorRows.find(n=>n.id===id)
      const unchanged=prior?.fingerprint===fingerprint
      const version=unchanged?prior!.latest_version:`content-v-${await catalogDigest(JSON.stringify([id,fingerprint,m.jobId]))}`
      rows.push({id,url:node.url,kind:node.kind,fingerprint,version,json:JSON.stringify(node),state:!prior?'added':unchanged?'unchanged':'updated'})
    }
    await new D1Catalog(this.db).ingest({schemaVersion:1,sources:[{id:m.sourceId,name:new URL(m.startUrl).hostname,entryUrl:new URL(m.startUrl).origin+'/',kind:'gallery',issueUrl:'https://github.com/pipekoder/curio/issues/5'}],candidates:[]},'local-discovery-operator')
    // Bounded JSON batches preserve Workers Free subrequest budget and atomic graph snapshots.
    const r=JSON.stringify(rows), statements=[
      this.db.prepare('INSERT INTO discovery_runs VALUES(?,?,?,?,?,?)').bind(m.jobId,m.sourceId,m.startUrl,m.observedAt,m.status,encoded),
      this.db.prepare(`INSERT INTO content_nodes(id,source_id,original_url,kind) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.url'),json_extract(value,'$.kind') FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING`).bind(m.sourceId,r),
      this.db.prepare(`INSERT INTO content_versions SELECT json_extract(value,'$.version'),json_extract(value,'$.id'),json_extract(value,'$.fingerprint'),json_extract(value,'$.json'),? FROM json_each(?) WHERE true ON CONFLICT(id) DO NOTHING`).bind(m.observedAt,r),
      this.db.prepare(`UPDATE content_nodes SET latest_version=json_extract(j.value,'$.version'),availability='active' FROM json_each(?) j WHERE content_nodes.id=json_extract(j.value,'$.id')`).bind(r),
      this.db.prepare(`INSERT INTO content_sightings SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.version'),json_extract(value,'$.state') FROM json_each(?)`).bind(m.jobId,r),
      this.db.prepare(`INSERT INTO content_edges SELECT ?,json_extract(value,'$.from'),json_extract(value,'$.to'),json_extract(value,'$.relation') FROM json_each(?)`).bind(m.jobId,JSON.stringify(m.edges)),
    ]
    if (m.status==='complete') {
      statements.push(this.db.prepare(`INSERT INTO content_sightings SELECT ?,n.id,n.latest_version,'removed' FROM content_nodes n WHERE n.source_id=? AND n.latest_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,'$.id')=n.id) AND EXISTS(SELECT 1 FROM content_sightings s JOIN discovery_runs d ON d.id=s.run_id WHERE s.node_id=n.id AND d.scope_url=? AND d.status='complete')`).bind(m.jobId,m.sourceId,r,m.startUrl))
      statements.push(this.db.prepare(`UPDATE content_nodes SET availability='removed' WHERE id IN(SELECT node_id FROM content_sightings WHERE run_id=? AND state='removed')`).bind(m.jobId))
    }
    statements.push(this.db.prepare(`INSERT INTO content_sightings SELECT ?,n.id,n.latest_version,'inaccessible' FROM content_nodes n WHERE n.source_id=? AND n.latest_version IS NOT NULL AND n.original_url IN(SELECT json_extract(value,'$.url') FROM json_each(?) WHERE json_extract(value,'$.status')='inaccessible') ON CONFLICT(run_id,node_id) DO UPDATE SET state='inaccessible'`).bind(m.jobId,m.sourceId,JSON.stringify(m.pages)))
    statements.push(this.db.prepare(`UPDATE content_nodes SET availability='inaccessible' WHERE source_id=? AND original_url IN(SELECT json_extract(value,'$.url') FROM json_each(?) WHERE json_extract(value,'$.status')='inaccessible')`).bind(m.sourceId,JSON.stringify(m.pages)))
    if(statements.length>50)throw new CatalogConflict('Discovery batch exceeds D1 budget.')
    await this.db.batch(statements)
    return {jobId:m.jobId,replay:false,states:rows.map(x=>({nodeId:x.id,versionId:x.version,state:x.state})),rightsGranted:false}
  }
  async list(cursor='',limit=20) {
    z.string().max(80).parse(cursor); z.number().int().min(1).max(50).parse(limit)
    return (await this.db.prepare(`SELECT n.*,v.content_json,(SELECT json_group_array(json_object('purpose',r.purpose,'status',r.status)) FROM content_reviews r WHERE r.version_id=v.id) AS reviews FROM content_nodes n JOIN content_versions v ON v.id=n.latest_version WHERE n.id>? ORDER BY n.id LIMIT ?`).bind(cursor,limit).all()).results
  }
  async get(versionId:string) {
    const row=await this.db.prepare('SELECT v.*,n.source_id,n.original_url,n.latest_version,n.availability FROM content_versions v JOIN content_nodes n ON n.id=v.node_id WHERE v.id=?').bind(versionId).first<{id:string;source_id:string;original_url:string;latest_version:string;availability:string;content_json:string}>()
    if(!row)return null
    const edges=(await this.db.prepare('SELECT * FROM content_edges WHERE from_id=? OR to_id=? ORDER BY rowid DESC LIMIT 100').bind((await this.db.prepare('SELECT node_id FROM content_versions WHERE id=?').bind(versionId).first<{node_id:string}>())!.node_id,(await this.db.prepare('SELECT node_id FROM content_versions WHERE id=?').bind(versionId).first<{node_id:string}>())!.node_id).all()).results
    const reviews=(await this.db.prepare('SELECT * FROM content_reviews WHERE version_id=? ORDER BY sequence').bind(versionId).all()).results
    return {...row,edges,reviews}
  }
  async review(input:unknown) {
    const r=z.strictObject({versionId:z.string().max(80),purpose:z.enum(['display','ai_analysis','edits']),status:z.enum(['pending','approved','rejected','blocked']),evidence:permissionReview.shape.evidence,reviewer:z.string().min(1).max(200)}).parse(input)
    if(!await this.get(r.versionId) || r.status==='approved'&&!r.evidence)throw new CatalogConflict('Exact content and review evidence required.')
    await this.db.prepare(`INSERT INTO content_reviews(version_id,purpose,status,evidence,reviewer,reviewed_at) VALUES(?,?,?,?,?,?)`).bind(r.versionId,r.purpose,r.status,r.evidence,r.reviewer,new Date().toISOString()).run()
    if(r.status!=='approved'){
      const linked=await this.db.prepare('SELECT asset_version FROM content_catalog_links WHERE content_version=?').bind(r.versionId).first<{asset_version:string}>()
      if(linked){const grant=await this.db.prepare('SELECT revision,rights_holder FROM asset_permissions WHERE version_id=? AND purpose=?').bind(linked.asset_version,r.purpose).first<{revision:number;rights_holder:string|null}>();if(grant)await new D1Catalog(this.db).review(linked.asset_version,{purpose:r.purpose,status:r.status,evidence:r.evidence,reviewer:r.reviewer,rightsHolder:grant.rights_holder,expectedRevision:grant.revision})}
    }
    // Content review never grants an image catalog permission. Existing independent grants stay authoritative.
    return {reviewed:true,catalogRightsGranted:false}
  }
  async promote(versionId:string) {
    const row=await this.get(versionId); if(!row||row.latest_version!==versionId||row.availability!=='active')throw new CatalogConflict('Active exact content version required.')
    const linked=await this.db.prepare('SELECT asset_version FROM content_catalog_links WHERE content_version=?').bind(versionId).first<{asset_version:string}>()
    if(linked)return{versionId:linked.asset_version,contentVersion:versionId,reused:true,permissionsUnchanged:true,aiCalls:0}
    const node=JSON.parse(row.content_json) as DiscoveredContent
    if(!node.image)throw new CatalogConflict('Only images enter Asset Intelligence; text remains attributed review content.')
    const parent=await this.db.prepare(`SELECT v.content_json FROM content_edges e JOIN content_nodes n ON n.id=e.from_id JOIN content_versions v ON v.id=n.latest_version WHERE e.to_id=? AND e.relation='illustrates' ORDER BY e.rowid DESC LIMIT 1`).bind(node.id).first<{content_json:string}>()
    const context=parent?JSON.parse(parent.content_json) as DiscoveredContent:null
    const sourcePage=context?.url??node.url
    const imageUrl=new URL(node.image.url);imageUrl.hash=''
    const result=await new AssetStore(this.db).import({sources:[],items:[{
      candidate:{sourceId:row.source_id,imageUrl:imageUrl.href,versionKey:`discovery-${versionId.slice(-40)}`,sourcePage,retrievedAt:new Date().toISOString(),sha256:node.image.sha256,width:node.image.width,height:node.image.height,alt:node.image.alt?.slice(0,1000)??null,attribution:node.attribution?.slice(0,1000)??null,sourceType:'editorial_support',provenance:{discoveredFrom:sourcePage,notes:`Persisted discovery ${versionId}; no inferred rights.`}},
      publisher:{name:(context?.title??new URL(sourcePage).hostname).slice(0,500),campaign:context?.title?.slice(0,500)??null,description:(node.description??context?.description)?.slice(0,500)??null,alt:node.image.alt?.slice(0,500)??null,sourcePage,hints:{categories:[],aesthetics:[],tags:[]}},
      access:node.image.access==='reachable'&&node.image.sha256&&node.image.mime?{status:'reachable',transport:'discovery_get',httpStatus:200,contentType:node.image.mime}:{status:'unverified',transport:'owner_metadata',httpStatus:null,contentType:null},
    }]})
    const assetVersion=result.records[0].versionId
    await this.db.prepare('INSERT INTO content_catalog_links VALUES(?,?) ON CONFLICT(content_version) DO NOTHING').bind(versionId,assetVersion).run()
    return {versionId:assetVersion,contentVersion:versionId,permissions:'pending',aiCalls:0}
  }
}
