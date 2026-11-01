import {useEffect,useState} from 'react'
import {boxToPercent,fetchObjectRegions,isVersionId,type ObjectRegion} from './object-regions'

// Verified-object discovery for one exhibit image: approved SAM regions
// only, fetched for exact version IDs. Renders nothing while loading and
// nothing for ineligible, revoked, empty or failed responses, so exhibits
// without published objects keep their exact current inspection.
export default function ObjectDiscovery({assetId,image,alt}:{assetId:string;image:string;alt:string}){
  const [regions,setRegions]=useState<ObjectRegion[]|null>(null)
  const [selected,setSelected]=useState<string|null>(null)
  const [failed,setFailed]=useState(false)
  useEffect(()=>{
    if(!isVersionId(assetId))return
    let alive=true
    void fetchObjectRegions(assetId).then(data=>{if(alive&&data)setRegions(data.regions)})
    return ()=>{alive=false}
  },[assetId])
  if(failed||!regions)return null
  const active=regions.find(region=>region.id===selected)??null
  return <section className="object-discovery" aria-label="Discovered objects">
    <div className="object-figure">
      <img src={image} alt={alt} onError={()=>setFailed(true)}/>
      {regions.map(region=>{
        const pressed=region.id===selected
        return <button key={region.id} type="button" className={`object-region${pressed?' is-selected':''}`}
          style={boxToPercent(region.box)} aria-pressed={pressed} aria-label={`Inspect ${region.label}`}
          onClick={()=>setSelected(pressed?null:region.id)}/>
      })}
    </div>
    {active&&<div className="object-detail" aria-live="polite">
      <p className="spatial-eyebrow">Object</p>
      <h3>{active.label}</h3>
      <p>{active.editorialDetail}</p>
      {active.product
        ?<p className="spatial-fine">{active.product.name} · fictional mockup, not for sale</p>
        :<p className="spatial-fine">No product link · visual note only</p>}
      <p className="spatial-fine">Reviewed detection · approximate area, not verified product identity.</p>
    </div>}
  </section>
}
