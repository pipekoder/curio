import { catalogItem, type CatalogItem } from '../shared/catalog'
import { imageDimensions } from './asset-classifier'
import { CatalogConflict } from './catalog-store'
import { CatalogPublications } from './catalog-publications'
import { mediaLinkInput, mediaMetadataUpdate, studioImport, type StudioImport } from './media-contracts'
import type {z} from 'zod'

// Keep every accepted original within the existing Muse/SAM data-url envelope.
// Larger owner originals can be resized before import without adding a hidden
// derivative pipeline or silently changing their identity.
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024
export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp'
const evidence = 'docs/MEDIA_STUDIO.md'
const sourceId = 'owner-media-studio'
const now = () => new Date().toISOString()
const safeId = (prefix: string, value: string) => `${prefix}-${value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'item'}`
const extension: Record<MediaMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function sha256(bytes: Uint8Array) {
  const input=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input)), value => value.toString(16).padStart(2, '0')).join('')
}
export function sniffImage(bytes: Uint8Array, declared: string) {
  const mime: MediaMime | null = bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
    : bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
      : bytes.length >= 30 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP' ? 'image/webp' : null
  if (!mime || mime !== declared) throw new CatalogConflict('Image bytes do not match the declared JPG, PNG or WebP type.')
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  if(mime==='image/jpeg'&&(bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9))throw new CatalogConflict('JPEG data is incomplete.')
  if(mime==='image/png'){
    let offset=8,sawData=false,sawEnd=false
    while(offset+12<=bytes.length){const length=view.getUint32(offset),kind=view.getUint32(offset+4);if(offset+length+12>bytes.length)break;if(kind===0x49444154&&length)sawData=true;if(kind===0x49454e44){sawEnd=length===0&&offset+12===bytes.length;break}offset+=length+12}
    if(!sawData||!sawEnd)throw new CatalogConflict('PNG data is incomplete.')
  }
  if(mime==='image/webp'&&view.getUint32(4,true)+8!==bytes.length)throw new CatalogConflict('WebP data is incomplete.')
  const [width, height] = imageDimensions(bytes, mime)
  if (width > 4096 || height > 4096 || width * height > 4_000_000) throw new CatalogConflict('Image dimensions exceed the 4 megapixel AI transport limit.')
  return { mime, width, height }
}

type MediaRow = { version_id: string; asset_id: string; r2_key: string; filename: string; sha256: string; byte_size: number; width: number; height: number; mime_type: MediaMime; image_type: 'product'|'brand'|'campaign'|'editorial'; active: number; deleted_at: string|null }

export class MediaStore {
  constructor(private db: D1Database, private bucket: R2Bucket, private origin: string) {}

  async createBatch(sourceText = '', sourceJson: unknown = null) {
    const id = crypto.randomUUID(), stamp = now()
    await this.db.prepare(`INSERT INTO media_import_batches(id,source_text,source_json,status,created_at,updated_at) VALUES(?,?,?,'draft',?,?)`).bind(id, sourceText, sourceJson === null ? null : JSON.stringify(sourceJson), stamp, stamp).run()
    return id
  }

  async upload(file: File, batchId?: string) {
    if (!file.name || file.name.length > 255 || file.size < 32 || file.size > MEDIA_MAX_BYTES) throw new CatalogConflict('Image must be between 32 bytes and 2 MiB with a valid filename.')
    const bytes = new Uint8Array(await file.arrayBuffer()), image = sniffImage(bytes, file.type), hash = await sha256(bytes)
    if (await this.db.prepare('SELECT version_id FROM media_objects WHERE sha256=?').bind(hash).first()) throw new CatalogConflict('This exact image is already in the Media Bank.')
    if (batchId && !await this.db.prepare('SELECT id FROM media_import_batches WHERE id=?').bind(batchId).first()) throw new CatalogConflict('Unknown import batch.')
    const assetId = `asset-${hash}`, versionId = `version-${hash}`, key = `originals/${hash.slice(0, 2)}/${hash}.${extension[image.mime]}`
    const mediaUrl = `${this.origin}/api/media/${versionId}`, stamp = now(), contentId = `content-media-${hash}`, contentVersion = `content-v-media-${hash}`
    await this.bucket.put(key, bytes, { httpMetadata: { contentType: image.mime }, customMetadata: { assetId, versionId, sha256: hash, originalFilename: file.name } })
    try {
      const catalog = this.catalogRecord({ version_id: versionId, asset_id: assetId, r2_key: key, filename: file.name, sha256: hash, byte_size: bytes.length, width: image.width, height: image.height, mime_type: image.mime, image_type: 'editorial', active: 1, deleted_at: null })
      const statements = [
        this.db.prepare(`INSERT INTO brand_sources(id,name,entry_url,kind,issue_url,created_at) VALUES(?,? ,?,'individual_urls','https://github.com/pipekoder/curio/issues/8',?) ON CONFLICT(id) DO NOTHING`).bind(sourceId, 'Curio owner media studio', `${this.origin}/internal/media`, stamp),
        this.db.prepare('INSERT INTO catalog_assets(id,image_url,created_at) VALUES(?,?,?)').bind(assetId, mediaUrl, stamp),
        this.db.prepare(`INSERT INTO asset_versions(id,asset_id,version_key,manifest_hash,sha256,width,height,alt,attribution,source_type,provenance_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,'synthetic_concept',?,?)`).bind(versionId, assetId, `r2-${hash}`, hash, hash, image.width, image.height, file.name, 'Curio owner-created mockup', JSON.stringify({ discoveredFrom: `${this.origin}/internal/media`, notes: 'Owner-created mockup uploaded through the private Content Studio.' }), stamp),
        this.db.prepare('INSERT INTO asset_discoveries(version_id,source_id,source_page,retrieved_at) VALUES(?,?,?,?)').bind(versionId, sourceId, `${this.origin}/internal/media`, stamp),
        ...(['display','ai_analysis','edits'] as const).map(purpose => this.db.prepare(`INSERT INTO asset_permissions(version_id,purpose,status,evidence,rights_holder,reviewer,reviewed_at,revision) VALUES(?,?,'approved',?,'pipekoder','media-studio-owner',?,1)`).bind(versionId, purpose, evidence, stamp)),
        this.db.prepare(`INSERT INTO source_identity_reviews VALUES(?,?,'Curio mockup studio',?,'media-studio-owner',?) ON CONFLICT(source_id) DO NOTHING`).bind(sourceId, 'brand-curio-mockup-studio', evidence, stamp),
        this.db.prepare('INSERT INTO publisher_metadata(version_id,source_id,publisher_name,description,publisher_alt,hints_json,source_page,observed_at) VALUES(?,?,?,?,?,?,?,?)').bind(versionId, sourceId, 'Curio mockup studio', 'Owner-created mockup editorial image.', file.name, JSON.stringify({ categories: ['home'], aesthetics: ['Quiet Luxury'], tags: ['mockup'] }), `${this.origin}/internal/media`, stamp),
        this.db.prepare(`INSERT INTO asset_access_checks(version_id,status,transport,http_status,content_type,checked_at) VALUES(?,'reachable','private_r2',200,?,?)`).bind(versionId, image.mime, stamp),
        this.db.prepare('INSERT INTO reader_asset_reviews VALUES(?,?,?,?,?,?,?,?)').bind(versionId, sourceId, catalog.image.alt, 'Curio owner-created mockup', `${this.origin}/internal/media`, evidence, 'media-studio-owner', stamp),
        this.db.prepare(`INSERT INTO content_nodes(id,source_id,original_url,kind,latest_version,availability) VALUES(?,?,?,'image',?,'active')`).bind(contentId, sourceId, mediaUrl, contentVersion),
        this.db.prepare('INSERT INTO content_versions VALUES(?,?,?,?,?)').bind(contentVersion, contentId, hash, JSON.stringify({ id: contentId, kind: 'image', url: mediaUrl, title: file.name, description: 'Owner-created mockup media.', attribution: 'Curio owner-created mockup', image: { url: mediaUrl, sha256: hash, width: image.width, height: image.height, mime: image.mime } }), stamp),
        ...(['display','ai_analysis','edits'] as const).map(purpose => this.db.prepare(`INSERT INTO content_reviews(version_id,purpose,status,evidence,reviewer,reviewed_at) VALUES(?,?,'approved',?,'media-studio-owner',?)`).bind(contentVersion, purpose, evidence, stamp)),
        this.db.prepare('INSERT INTO content_catalog_links VALUES(?,?)').bind(contentVersion, versionId),
        this.db.prepare('INSERT INTO media_objects(version_id,asset_id,batch_id,r2_key,filename,sha256,byte_size,width,height,mime_type,image_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(versionId, assetId, batchId ?? null, key, file.name, hash, bytes.length, image.width, image.height, image.mime, 'editorial', stamp),
        this.db.prepare('INSERT INTO catalog_publications VALUES(?,?,?,?)').bind(versionId, JSON.stringify(catalog), 'media-studio-owner', stamp),
      ]
      await this.db.batch(statements)
      return { assetId, versionId, filename: file.name, sha256: hash, width: image.width, height: image.height, mimeType: image.mime, imageType: 'editorial', r2Key: key, duplicate: false, aiAvailable: true, readerAvailable: true, editorialReady:false }
    } catch (error) {
      // A concurrent upload of the same fingerprint may have committed after
      // our initial duplicate check. Never delete the object backing that row.
      if(!await this.db.prepare('SELECT 1 FROM media_objects WHERE sha256=?').bind(hash).first())await this.bucket.delete(key)
      throw error
    }
  }

  async import(input: unknown) {
    const data: StudioImport = studioImport.parse(input), stamp = now(), batchId = data.batchId ?? await this.createBatch(data.sourceText, data)
    if (data.batchId && !await this.db.prepare('SELECT id FROM media_import_batches WHERE id=?').bind(batchId).first()) throw new CatalogConflict('Unknown import batch.')
    const brands = new Map<string,string>(), products: { id:string; name:string }[] = [], campaigns: { id:string; name:string }[] = []
    for (const brand of data.brands) {
      const brandId = brand.id ?? safeId('brand', brand.name); brands.set(brand.name.toLowerCase(), brandId)
      await this.db.prepare(`INSERT INTO media_brands(id,name,story,description,website,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET story=excluded.story,description=excluded.description,website=excluded.website,country=excluded.country,updated_at=excluded.updated_at`).bind(brandId,brand.name,brand.story,brand.description,brand.website||null,brand.country,stamp,stamp).run()
    }
    for (const product of data.products) {
      let brandId = brands.get(product.brand.toLowerCase()) ?? (await this.db.prepare('SELECT id FROM media_brands WHERE name=? COLLATE NOCASE').bind(product.brand).first<{id:string}>())?.id
      if (!brandId) { brandId=safeId('brand',product.brand); await this.db.prepare(`INSERT INTO media_brands(id,name,created_at,updated_at) VALUES(?,?,?,?)`).bind(brandId,product.brand,stamp,stamp).run() }
      const productId = product.id ?? safeId('product', `${product.brand}-${product.name}`); products.push({id:productId,name:product.name})
      await this.db.prepare(`INSERT INTO media_products(id,brand_id,name,description,category,materials_json,price_minor,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(brand_id,name) DO UPDATE SET description=excluded.description,category=excluded.category,materials_json=excluded.materials_json,price_minor=excluded.price_minor,currency=excluded.currency,updated_at=excluded.updated_at`).bind(productId,brandId,product.name,product.description,product.category,JSON.stringify(product.materials),product.price===null?null:Math.round(product.price*100),product.currency,stamp,stamp).run()
      for (const filename of product.imageFilenames) await this.linkFilename(filename,{imageType:'product',productId,brandId,campaignId:null},product.lifestyleTags)
    }
    for (const campaign of data.campaigns) {
      const brandId=campaign.brand?brands.get(campaign.brand.toLowerCase())??(await this.db.prepare('SELECT id FROM media_brands WHERE name=? COLLATE NOCASE').bind(campaign.brand).first<{id:string}>())?.id??null:null
      const campaignId=campaign.id??safeId('campaign',`${campaign.brand??'curio'}-${campaign.name}`); campaigns.push({id:campaignId,name:campaign.name})
      await this.db.prepare(`INSERT INTO media_campaigns(id,brand_id,name,description,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET brand_id=excluded.brand_id,name=excluded.name,description=excluded.description,updated_at=excluded.updated_at`).bind(campaignId,brandId,campaign.name,campaign.description,stamp,stamp).run()
      for(const filename of campaign.imageFilenames)await this.linkFilename(filename,{imageType:'campaign',productId:null,brandId,campaignId},[])
    }
    const unmatched=(await this.db.prepare(`SELECT filename,version_id FROM media_objects WHERE active=1 AND NOT EXISTS(SELECT 1 FROM media_product_images p WHERE p.version_id=media_objects.version_id) AND NOT EXISTS(SELECT 1 FROM media_brand_images b WHERE b.version_id=media_objects.version_id) AND NOT EXISTS(SELECT 1 FROM media_campaign_images c WHERE c.version_id=media_objects.version_id) ORDER BY created_at DESC LIMIT 200`).all()).results
    await this.db.prepare(`UPDATE media_import_batches SET source_text=?,source_json=?,status='ready',results_json=?,errors_json='[]',updated_at=? WHERE id=?`).bind(data.sourceText,JSON.stringify(data),JSON.stringify({brands:brands.size,products:products.length,campaigns:campaigns.length}),stamp,batchId).run()
    return {batchId,brands:[...brands.values()],products,campaigns,unmatched}
  }

  async link(versionId: string, input: unknown) { return this.linkVersion(versionId, mediaLinkInput.parse(input), []) }
  private async linkFilename(filename:string,input:{imageType:'product'|'brand'|'campaign'|'editorial';productId:string|null;brandId:string|null;campaignId:string|null},tags:readonly string[]){
    const matches=(await this.db.prepare('SELECT version_id FROM media_objects WHERE lower(filename)=lower(?) AND active=1').bind(filename).all<{version_id:string}>()).results
    if(matches.length===1)await this.linkVersion(matches[0].version_id,input,tags)
  }
  private async linkVersion(versionId:string,input:{imageType:'product'|'brand'|'campaign'|'editorial';productId?:string|null;brandId?:string|null;campaignId?:string|null},tags:readonly string[]){
    const media=await this.get(versionId);if(!media||!media.active)throw new CatalogConflict('Unknown or inactive media version.')
    const requested=[
      {kind:'product',table:'media_products',id:input.productId},
      {kind:'brand',table:'media_brands',id:input.brandId},
      {kind:'campaign',table:'media_campaigns',id:input.campaignId},
    ].filter((item):item is {kind:string;table:string;id:string}=>Boolean(item.id))
    for(const item of requested)if(!await this.db.prepare(`SELECT 1 FROM ${item.table} WHERE id=?`).bind(item.id).first())throw new CatalogConflict(`Unknown ${item.kind} assignment.`)
    const changed=input.imageType==='editorial'?['product','brand','campaign']:[...new Set([input.imageType,...requested.map(item=>item.kind)])]
    const clear=changed.map(kind=>this.db.prepare(`DELETE FROM media_${kind}_images WHERE version_id=?`).bind(versionId))
    await this.db.batch([
      ...clear,
      ...(input.productId?[this.db.prepare(`INSERT INTO media_product_images(product_id,version_id,role) VALUES(?,?,'primary')`).bind(input.productId,versionId)]:[]),
      ...(input.brandId?[this.db.prepare('INSERT INTO media_brand_images(brand_id,version_id) VALUES(?,?)').bind(input.brandId,versionId)]:[]),
      ...(input.campaignId?[this.db.prepare('INSERT INTO media_campaign_images(campaign_id,version_id) VALUES(?,?)').bind(input.campaignId,versionId)]:[]),
      this.db.prepare('UPDATE media_objects SET image_type=? WHERE version_id=?').bind(input.imageType,versionId),
    ])
    const catalog=await this.refreshCatalog(versionId,tags)
    const assignments=await this.db.prepare(`SELECT
      (SELECT group_concat(product_id) FROM media_product_images WHERE version_id=?) AS product_ids,
      (SELECT group_concat(brand_id) FROM media_brand_images WHERE version_id=?) AS brand_ids,
      (SELECT group_concat(campaign_id) FROM media_campaign_images WHERE version_id=?) AS campaign_ids`).bind(versionId,versionId,versionId).first()
    return {linked:true,versionId,catalogId:catalog.id,assignments}
  }

  async updateMetadata(input:z.infer<typeof mediaMetadataUpdate>){
    const stamp=now(),affected=new Set<string>()
    if(input.brand&&!await this.db.prepare('SELECT id FROM media_brands WHERE id=?').bind(input.brand.id).first())throw new CatalogConflict('Unknown brand metadata record.')
    if(input.product&&!await this.db.prepare('SELECT id FROM media_products WHERE id=?').bind(input.product.id).first())throw new CatalogConflict('Unknown product metadata record.')
    if(input.brand){
      await this.db.prepare(`UPDATE media_brands SET story=COALESCE(?,story),description=COALESCE(?,description),updated_at=? WHERE id=?`).bind(input.brand.story??null,input.brand.description??null,stamp,input.brand.id).run()
      const versions=(await this.db.prepare(`SELECT version_id FROM media_brand_images WHERE brand_id=? UNION SELECT pi.version_id FROM media_product_images pi JOIN media_products p ON p.id=pi.product_id WHERE p.brand_id=? UNION SELECT ci.version_id FROM media_campaign_images ci JOIN media_campaigns c ON c.id=ci.campaign_id WHERE c.brand_id=?`).bind(input.brand.id,input.brand.id,input.brand.id).all<{version_id:string}>()).results
      versions.forEach(row=>affected.add(row.version_id))
    }
    if(input.product){
      await this.db.prepare('UPDATE media_products SET description=?,updated_at=? WHERE id=?').bind(input.product.description,stamp,input.product.id).run()
      const versions=(await this.db.prepare('SELECT version_id FROM media_product_images WHERE product_id=?').bind(input.product.id).all<{version_id:string}>()).results
      versions.forEach(row=>affected.add(row.version_id))
    }
    for(const versionId of affected)await this.refreshCatalog(versionId)
    return {updated:true,affectedVersions:[...affected]}
  }

  private async refreshCatalog(versionId:string,tags?:readonly string[]){
    let retained=tags
    if(!retained){
      const publication=await this.db.prepare('SELECT catalog_json FROM catalog_publications WHERE version_id=?').bind(versionId).first<{catalog_json:string}>()
      try{const value=publication?JSON.parse(publication.catalog_json) as {lifestyleTags?:unknown}:null;retained=Array.isArray(value?.lifestyleTags)?value.lifestyleTags.filter((item):item is string=>typeof item==='string'):[]}catch{retained=[]}
    }
    const catalog=await this.catalogForVersion(versionId,retained)
    await this.db.prepare('UPDATE catalog_publications SET catalog_json=?,reviewed_at=? WHERE version_id=?').bind(JSON.stringify(catalog),now(),versionId).run()
    await this.db.prepare('UPDATE reader_asset_reviews SET alt=?,attribution=?,reviewed_at=? WHERE version_id=?').bind(catalog.image.alt,catalog.provenance.attribution,now(),versionId).run()
    await this.db.prepare('UPDATE publisher_metadata SET publisher_name=?,campaign_title=?,description=?,hints_json=? WHERE version_id=?').bind(catalog.advertiser?.name??'Curio mockup studio',catalog.campaign.title,catalog.description,JSON.stringify({categories:[catalog.category],aesthetics:catalog.lifestyleTags,tags:catalog.discoverableObjects.map(o=>o.label)}),versionId).run()
    return catalog
  }

  async list() {
    const media=(await this.db.prepare(`SELECT m.*,group_concat(DISTINCT p.product_id) AS product_ids,group_concat(DISTINCT b.brand_id) AS brand_ids,group_concat(DISTINCT c.campaign_id) AS campaign_ids,
      EXISTS(SELECT 1 FROM media_product_images ready_link JOIN media_products ready_product ON ready_product.id=ready_link.product_id JOIN media_brands ready_brand ON ready_brand.id=ready_product.brand_id WHERE ready_link.version_id=m.version_id AND trim(ready_product.name)<>'' AND trim(ready_product.description)<>'' AND trim(ready_brand.name)<>'' AND (trim(ready_brand.story)<>'' OR trim(ready_brand.description)<>'')) AS editorial_ready
      FROM media_objects m LEFT JOIN media_product_images p ON p.version_id=m.version_id LEFT JOIN media_brand_images b ON b.version_id=m.version_id LEFT JOIN media_campaign_images c ON c.version_id=m.version_id GROUP BY m.version_id ORDER BY m.created_at DESC LIMIT 500`).all()).results
    const brands=(await this.db.prepare('SELECT * FROM media_brands ORDER BY name LIMIT 500').all()).results, products=(await this.db.prepare('SELECT * FROM media_products ORDER BY name LIMIT 1000').all()).results, campaigns=(await this.db.prepare('SELECT * FROM media_campaigns ORDER BY name LIMIT 500').all()).results
    return {media,brands,products,campaigns,limits:{maxBytes:MEDIA_MAX_BYTES,accepted:['image/jpeg','image/png','image/webp']},inferenceTriggered:false}
  }
  async get(versionId:string){return this.db.prepare('SELECT * FROM media_objects WHERE version_id=?').bind(versionId).first<MediaRow>()}
  async bytes(versionId:string,publicRead=false){
    const row=await this.get(versionId);if(!row||!row.active)throw new CatalogConflict('Media is unavailable.')
    if(publicRead){
      // Match the public catalog's complete, current-version eligibility check.
      // A stale publication row alone cannot authorize delivery of R2 bytes.
      const published=await new CatalogPublications(this.db).list('',1,[versionId])
      if(!published.items.some(item=>item.image.id===versionId))throw new CatalogConflict('Media is not published.')
    }
    const object=await this.bucket.get(row.r2_key);if(!object)throw new CatalogConflict('Media bytes are unavailable.')
    return {row,object}
  }
  async remove(versionId:string){
    const row=await this.get(versionId);if(!row)throw new CatalogConflict('Unknown media version.')
    const stamp=now();await this.db.batch([this.db.prepare('UPDATE media_objects SET active=0,deleted_at=? WHERE version_id=?').bind(stamp,versionId),this.db.prepare('UPDATE catalog_assets SET archived_at=? WHERE id=?').bind(stamp,row.asset_id),this.db.prepare(`UPDATE asset_permissions SET status='blocked',reviewer='media-studio-owner',reviewed_at=?,revision=revision+1 WHERE version_id=?`).bind(stamp,versionId),this.db.prepare('DELETE FROM catalog_publications WHERE version_id=?').bind(versionId)]);await this.bucket.delete(row.r2_key);return{deleted:true,versionId}
  }

  async catalogForVersion(versionId:string,tags:readonly string[]=[]){const media=await this.get(versionId);if(!media)throw new CatalogConflict('Unknown media version.');return this.catalogRecord(media,await this.db.prepare(`SELECT p.*,b.name AS brand_name FROM media_product_images pi JOIN media_products p ON p.id=pi.product_id JOIN media_brands b ON b.id=p.brand_id WHERE pi.version_id=? LIMIT 1`).bind(versionId).first<Record<string,unknown>>(),tags)}
  private catalogRecord(media:MediaRow,product?:Record<string,unknown>|null,tags:readonly string[]=[]):CatalogItem{
    const brand=product?.brand_name?String(product.brand_name):null,name=product?.name?String(product.name):media.filename.replace(/\.[^.]+$/,''),category=product?.category==='fashion'||product?.category==='travel'?product.category:'home',description=product?.description?String(product.description):'Owner-created mockup editorial image managed in Curio Content Studio.',materials=product?.materials_json?JSON.parse(String(product.materials_json)) as string[]:[]
    const objects=(materials.length?materials:['primary object']).slice(0,10)
    return catalogItem.parse({id:`catalog-${media.asset_id.slice(6,46)}`,category,name:name.slice(0,80),description:description.slice(0,200),lifestyleTags:tags.length?tags:['Quiet Luxury'],sourceType:'synthetic_concept',advertiser:brand?{name:brand,verification:'unverified',evidence:null}:null,campaign:{title:'Curio owner-created mockup',reference:evidence},image:{id:media.version_id,path:null,externalUrl:`${this.origin}/api/media/${media.version_id}`,fallbackPath:null,alt:`Owner-created mockup: ${name}`.slice(0,500),width:media.width,height:media.height,role:'supplied_image'},provenance:{origin:'owner_supplied',sourceUrl:`${this.origin}/internal/media`,originalSourcePage:`${this.origin}/internal/media`,evidence,attribution:'Curio owner-created mockup',modifications:[]},licensing:{status:'cleared',rightsHolder:'pipekoder',evidence},permissions:{display:{status:'approved',evidence},aiAnalysis:{status:'approved',evidence},edits:{status:'approved',evidence}},verifiedBrandLink:null,discoverableObjects:objects.map((value,index)=>({id:`detail-${index}`,label:value,description:'Fictional mockup metadata supplied by the owner.',grounding:'catalog_metadata',productIdentity:null}))})
  }
}
