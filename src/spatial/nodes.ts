import {z} from 'zod'
import manifest from './nodes.manifest.json'
import {catalogItem,type CatalogItem} from '../../shared/catalog'
import {catalogNodesResponse,type CatalogNode} from './contracts'

export type NodeSource='published'|'manifest'

const publishedPage=z.strictObject({items:z.array(catalogItem),nextCursor:z.string().nullable()})

// Same-origin absolute URLs (notably /api/media/:version) collapse to their
// pathname; anything else keeps its safe HTTPS form for the image loader.
function toThumbnail(image:CatalogItem['image']):string{
  if(image.path)return image.path
  const absolute=image.externalUrl??image.fallbackPath
  if(!absolute)return ''
  try{
    if(typeof location!=='undefined'&&new URL(absolute,location.origin).origin===location.origin){
      return new URL(absolute,location.origin).pathname
    }
  }catch{/* fall through to the raw value; the contract validates it */}
  return absolute
}

// Display mapping only, no invented relationships: licensed brand records
// read as exhibits; supporting and synthetic records read as stories.
function toNode(item:CatalogItem):CatalogNode{
  return {
    assetId:item.image.id,
    kind:item.sourceType==='licensed_brand'?'exhibit':'story',
    label:item.name.slice(0,60),
    thumbnail:toThumbnail(item.image),
  }
}

// Journey source: the published catalog, paged through its cursor (bounded).
// Any failure, or an empty listing, falls back to the validated static
// manifest. The UI always labels which source served the nodes.
export async function loadCatalogNodes(fetchImpl:typeof fetch=fetch):Promise<{nodes:CatalogNode[];source:NodeSource}>{
  const fallback=()=>({nodes:catalogNodesResponse.parse(manifest),source:'manifest' as const})
  try{
    const items:CatalogItem[]=[]
    const seen=new Set<string>()
    let cursor=''
    for(let page=0;page<10&&items.length<500;page++){
      const response=await fetchImpl(`/api/catalog/published${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{signal:AbortSignal.timeout(3000)})
      if(!response.ok)throw Error(`Published catalog responded ${response.status}`)
      const parsed=publishedPage.parse(await response.json())
      for(const item of parsed.items){
        if(seen.has(item.image.id))continue
        seen.add(item.image.id)
        items.push(item)
      }
      if(!parsed.nextCursor)break
      cursor=parsed.nextCursor
    }
    if(!items.length)return fallback()
    return {nodes:catalogNodesResponse.parse(items.slice(0,500).map(toNode)),source:'published'}
  }catch{
    return fallback()
  }
}

const versionId=/^version-[a-f0-9]{64}$/

// Revalidation against the same endpoint: exact asset-version IDs the
// session already holds, in server-accepted batches of 60. Anything the
// server no longer returns — or anything the check cannot confirm — is
// absent from `eligible`, and `verified:false` fails closed when the check
// itself cannot run. Local demo IDs never match the version pattern, so
// they are never sent and never confirmed.
export async function revalidateVersions(ids:readonly string[],fetchImpl:typeof fetch=fetch):Promise<{eligible:Set<string>;verified:boolean}>{
  const exact=[...new Set(ids.filter(id=>versionId.test(id)))]
  const failed={eligible:new Set<string>(),verified:false}
  if(!exact.length)return {eligible:new Set<string>(),verified:true}
  try{
    const eligible=new Set<string>()
    for(let at=0;at<exact.length;at+=60){
      const batch=exact.slice(at,at+60)
      const response=await fetchImpl(`/api/catalog/published?ids=${batch.map(encodeURIComponent).join(',')}`,{signal:AbortSignal.timeout(3000)})
      if(!response.ok)return failed
      const parsed=publishedPage.parse(await response.json())
      for(const item of parsed.items)if(batch.includes(item.image.id))eligible.add(item.image.id)
    }
    return {eligible,verified:true}
  }catch{
    return failed
  }
}
