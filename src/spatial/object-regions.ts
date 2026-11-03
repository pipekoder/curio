import {z} from 'zod'

// Frontend copy of the SAM-objects read contract
// (docs/sam-object-discovery-contract.md). Approved regions arrive only
// through GET /api/catalog/object-regions/:versionId for exact version
// IDs, either human-reviewed (`sam_detection`) or automatic catalog
// hotspots (`sam_hotspot`, system-validated, never human-reviewed).
// Anything else (ineligible ID, 404, 503, network failure, schema drift,
// empty set) resolves to null and the caller renders nothing.
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
  provenance:z.strictObject({origin:z.union([z.literal('sam_detection'),z.literal('sam_hotspot')]),model:z.string().min(1).max(60),uncertainty:z.string().min(1).max(120),reviewed:z.boolean()}).refine(provenance=>(provenance.origin==='sam_detection')===provenance.reviewed),
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

// Interactive hotspots: a SAM box collapses to its stable center anchor
// while authored points keep their exact placement. A SAM anchor landing
// on an authored point is a duplicate of the same object and is dropped;
// near neighbors nudge apart so small markers stay tappable. Pure and
// deterministic for unit coverage.
export type HotspotAnchor={x:number;y:number}
export type MergedHotspot={id:string;x:number;y:number;authored:boolean}
const clampPoint=(value:number)=>Math.min(0.98,Math.max(0.02,value))
const NEAR_SAME=0.06,NEAR_GAP=0.045
export function regionAnchor(box:{x:number;y:number;width:number;height:number}):HotspotAnchor{
  return {x:clampPoint(box.x+box.width/2),y:clampPoint(box.y+box.height/2)}
}
export function mergeHotspots(authored:readonly {id:string;x:number;y:number}[],sam:readonly {id:string;box:{x:number;y:number;width:number;height:number}}[]):MergedHotspot[]{
  const placed:MergedHotspot[]=[]
  const push=(mark:MergedHotspot)=>{
    let x=mark.x,y=mark.y
    for(let attempt=0;attempt<8&&placed.some(other=>Math.hypot(x-other.x,y-other.y)<NEAR_GAP);attempt++){
      x+=NEAR_GAP
      if(x>0.98){x=0.02;y=clampPoint(y+NEAR_GAP)}
    }
    placed.push({id:mark.id,x,y,authored:mark.authored})
  }
  for(const point of authored)push({id:point.id,x:clampPoint(point.x),y:clampPoint(point.y),authored:true})
  for(const region of sam){
    const anchor=regionAnchor(region.box)
    if(placed.some(other=>other.authored&&Math.hypot(anchor.x-other.x,anchor.y-other.y)<NEAR_SAME))continue
    push({id:region.id,...anchor,authored:false})
  }
  return placed
}
