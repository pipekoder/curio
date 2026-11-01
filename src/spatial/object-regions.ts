import {z} from 'zod'

// Frontend copy of the reviewed-SAM-objects read contract
// (docs/sam-object-discovery-contract.md). Approved regions arrive only
// through GET /api/catalog/object-regions/:versionId for exact version
// IDs. Anything else (ineligible ID, 404, 503, network failure, schema
// drift, empty set) resolves to null and the caller renders nothing.
export const VERSION_ID=/^version-[a-f0-9]{64}$/
export function isVersionId(assetId:string):boolean{
  return VERSION_ID.test(assetId)
}

const fraction=z.number().min(0).max(1)
const regionBox=z.strictObject({x:fraction,y:fraction,width:fraction,height:fraction})
const regionProduct=z.strictObject({id:z.string().min(1).max(100),name:z.string().min(1).max(120),kind:z.literal('owner_mockup')})
const region=z.strictObject({
  id:z.string().min(1).max(120),
  box:regionBox,
  label:z.string().min(1).max(120),
  editorialDetail:z.string().min(1).max(2000),
  product:regionProduct.nullable(),
  provenance:z.strictObject({origin:z.literal('sam_detection'),model:z.string().min(1).max(60),uncertainty:z.string().min(1).max(120),reviewed:z.literal(true)}),
  confidence:z.number().min(0).max(1).nullable(),
})
const regionsResponse=z.strictObject({
  catalogId:z.string().min(1).max(100),
  assetId:z.string().min(1).max(100),
  width:z.number().positive().max(20000),
  height:z.number().positive().max(20000),
  regions:z.array(region).max(40),
})
export type ObjectRegion=z.infer<typeof region>
export type ObjectRegions={width:number;height:number;regions:ObjectRegion[]}

export async function fetchObjectRegions(assetId:string,fetchImpl:typeof fetch=fetch):Promise<ObjectRegions|null>{
  if(!isVersionId(assetId))return null
  try{
    const response=await fetchImpl(`/api/catalog/object-regions/${assetId}`,{signal:AbortSignal.timeout(10000)})
    if(!response.ok)return null
    const parsed=regionsResponse.safeParse(await response.json())
    if(!parsed.success||parsed.data.assetId!==assetId)return null
    const regions=parsed.data.regions.filter(candidate=>candidate.box.width>0&&candidate.box.height>0)
    if(!regions.length)return null
    return {width:parsed.data.width,height:parsed.data.height,regions}
  }catch{
    return null
  }
}

// Normalized box -> CSS percentages. The discovery image renders uncropped
// at natural aspect, so percentages track every responsive size exactly.
export function boxToPercent(box:{x:number;y:number;width:number;height:number}):{left:string;top:string;width:string;height:string}{
  const percent=(value:number)=>`${Math.min(100,Math.max(0,value*100))}%`
  return {left:percent(box.x),top:percent(box.y),width:percent(box.width),height:percent(box.height)}
}
