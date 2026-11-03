import { editorialSources, type EditorialSource } from '../shared/editorial-sources'

type SourceRow = {
  version_id:string; brand_name:string; brand_story:string; brand_description:string; country:string|null;
  product_name:string; product_description:string; category:string; materials_json:string; price_minor:number|null; currency:string|null;
  campaign_name:string|null; campaign_description:string|null
}
const clean=(value:unknown)=>typeof value==='string'?value.trim():''
const source=(row:SourceRow,kind:EditorialSource['kind'],label:string,value:string):EditorialSource=>({id:`${row.version_id}:${kind}`,assetId:row.version_id,kind,label,value,authority:'owner_supplied_mockup',source:'content_studio'})

// Content Studio input is owner-supplied mockup context, never independent
// verification. The model receives it separately from visual observations and
// may only cite these stable IDs; the UI renders the stored values verbatim.
export async function loadEditorialSources(db:D1Database,versionIds:readonly string[],bounds:{maxSources:number;maxBytes:number}={maxSources:120,maxBytes:48_000}){
  if(!versionIds.length)return[]
  const rows=(await db.prepare(`SELECT m.version_id,b.name AS brand_name,b.story AS brand_story,b.description AS brand_description,b.country,
    p.name AS product_name,p.description AS product_description,p.category,p.materials_json,p.price_minor,p.currency,
    c.name AS campaign_name,c.description AS campaign_description
    FROM media_objects m JOIN media_product_images pi ON pi.version_id=m.version_id
    JOIN media_products p ON p.id=pi.product_id JOIN media_brands b ON b.id=p.brand_id
    LEFT JOIN media_campaign_images ci ON ci.version_id=m.version_id LEFT JOIN media_campaigns c ON c.id=ci.campaign_id
    WHERE m.active=1 AND m.version_id IN(SELECT value FROM json_each(?))
    AND trim(p.name)<>'' AND trim(b.name)<>''`).bind(JSON.stringify(versionIds)).all<SourceRow>()).results
  // One version can have several product/campaign links. Source IDs encode
  // only version + kind, so conflicting rows would otherwise overwrite facts.
  // Exclude ambiguous versions instead of presenting an arbitrary last row.
  const grouped=new Map<string,SourceRow[]>()
  for(const row of rows)grouped.set(row.version_id,[...(grouped.get(row.version_id)??[]),row])
  const unambiguous=rows.filter(row=>{
    const peers=grouped.get(row.version_id)??[]
    return peers.every(peer=>JSON.stringify(peer)===JSON.stringify(row))
  })
  const values=unambiguous.flatMap(row=>{
    const result:EditorialSource[]=[source(row,'brand_name','Brand name',row.brand_name),source(row,'product_name','Product name',row.product_name)]
    if(clean(row.product_description))result.push(source(row,'product_description','Product description',row.product_description))
    if(clean(row.category))result.push(source(row,'product_category','Product category',row.category))
    if(clean(row.brand_story))result.push(source(row,'brand_story','Brand story',row.brand_story))
    if(clean(row.brand_description))result.push(source(row,'brand_description','Brand description',row.brand_description))
    if(clean(row.country))result.push(source(row,'brand_country','Brand country',row.country!))
    try{const materials=JSON.parse(row.materials_json) as unknown;if(Array.isArray(materials)&&materials.length)result.push(source(row,'product_materials','Owner-supplied material notes',materials.map(String).join(', ')))}catch{/* malformed legacy metadata is not a source */}
    if(row.price_minor!==null&&row.currency)result.push(source(row,'product_price','Owner-supplied mockup price',`${(row.price_minor/100).toFixed(2)} ${row.currency}`))
    if(clean(row.campaign_name))result.push(source(row,'campaign_name','Campaign name',row.campaign_name!))
    if(clean(row.campaign_description))result.push(source(row,'campaign_description','Campaign description',row.campaign_description!))
    return result
  })
  const parsed=editorialSources.parse([...new Map(values.map(value=>[value.id,value])).values()])
  // Keep owner-supplied context bounded before it can become model input. A
  // catalog record that exceeds this limit is excluded from the pilot rather
  // than truncated into a misleading factual source.
  if(parsed.length>bounds.maxSources||new TextEncoder().encode(JSON.stringify(parsed)).byteLength>bounds.maxBytes)throw Error('Editorial sources exceed the input limit.')
  return parsed
}

export function parsePilotVersions(value:string|undefined){
  if(!value)return null
  const ids=value.split(',').map(id=>id.trim()).filter(Boolean)
  return ids.length===6&&new Set(ids).size===6&&ids.every(id=>/^version-[a-f0-9]{64}$/.test(id))?ids:null
}
