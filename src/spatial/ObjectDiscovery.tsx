import {useEffect,useId,useRef,useState} from 'react'
import type {StagedHotspot} from './staging'
import {fetchObjectRegions,mergeHotspots,type ObjectRegion} from './object-regions'

// Verified-object discovery on one editorial image: dot markers for
// approved SAM regions merged with exact authored points, and one compact
// anchored popover. Selection never refetches and never infers; anything
// unreviewed, revoked or failed simply leaves no marker behind.
export default function ObjectDiscovery({assetId,image,alt,authored,caption,initialSelectedId=null,onConsumeSpotlight,className,loading,width,height}:{
  assetId:string;image:string;alt:string;authored:readonly StagedHotspot[];caption?:{brand:string;fine:string};
  initialSelectedId?:string|null;onConsumeSpotlight?:()=>void;className?:string;loading?:'lazy'|'eager';width?:number;height?:number
}){
  const [regions,setRegions]=useState<ObjectRegion[]|null>(null)
  const [selected,setSelected]=useState<string|null>(initialSelectedId)
  const [failed,setFailed]=useState(false)
  const popoverId=useId()
  const closeRef=useRef<HTMLButtonElement>(null)
  const markers=useRef(new Map<string,HTMLButtonElement>())
  useEffect(()=>{
    let alive=true
    void fetchObjectRegions(assetId).then(data=>{if(alive)setRegions(data?.regions??[])})
    return ()=>{alive=false}
  },[assetId])
  useEffect(()=>{
    if(initialSelectedId){setSelected(initialSelectedId);onConsumeSpotlight?.()}
  },[initialSelectedId,onConsumeSpotlight])
  useEffect(()=>{
    if(!selected)return
    closeRef.current?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return
      event.stopImmediatePropagation()
      setSelected(null)
      markers.current.get(selected)?.focus()
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[selected])
  if(failed)return null
  const placed=mergeHotspots(authored,regions??[])
  const bySam=new Map((regions??[]).map(region=>[region.id,region]))
  const byAuthored=new Map(authored.map(point=>[point.id,point]))
  const mark=placed.find(candidate=>candidate.id===selected)??null
  const sam=mark&&!mark.authored?bySam.get(mark.id)??null:null
  const authoredDetail=mark?.authored?byAuthored.get(mark.id)??null:null
  const detail=sam??authoredDetail
  return <figure className={`object-figure${className?` ${className}`:''}`}>
    <div className="object-frame">
    <img src={image} alt={alt} loading={loading} width={width} height={height} onError={()=>setFailed(true)}/>
    {placed.map(candidate=>{
      const pressed=candidate.id===selected
      const point=byAuthored.get(candidate.id)
      const region=bySam.get(candidate.id)
      return <button key={candidate.id} ref={el=>{if(el)markers.current.set(candidate.id,el);else markers.current.delete(candidate.id)}}
        type="button" className={`object-hotspot${pressed?' is-selected':''}`}
        style={{left:`${candidate.x*100}%`,top:`${candidate.y*100}%`}}
        aria-label={`Inspect ${point?.label??region?.label??'object'}`} aria-expanded={pressed} aria-controls={pressed?popoverId:undefined}
        onClick={()=>setSelected(pressed?null:candidate.id)}/>
    })}
    {mark&&detail&&<>
      <div className="object-catcher" aria-hidden="true" onClick={()=>setSelected(null)}/>
      <div id={popoverId} role="dialog" aria-label={sam?.label??authoredDetail!.productName} className="object-popover"
        style={{...(mark.x>0.62?{right:`calc(${(1-mark.x)*100}% + 14px)`}:{left:`calc(${mark.x*100}% + 14px)`}),
          ...(mark.y>0.5?{bottom:`calc(${(1-mark.y)*100}% - 10px)`}:{top:`calc(${mark.y*100}% - 10px)`})}}>
        <button ref={closeRef} type="button" className="object-popover-close" aria-label="Close object details"
          onClick={()=>{setSelected(null);markers.current.get(mark.id)?.focus()}}>×</button>
        <p className="spatial-eyebrow">Object</p>
        {sam
          ?sam.provenance.origin==='sam_hotspot'
            ?<><h3>{sam.product?.name??sam.label}</h3><p>{sam.editorialDetail}</p></>
            :<><h3>{sam.label}</h3>
              <p>{sam.editorialDetail}</p>
              {sam.product
                ?<p className="spatial-fine">{sam.product.name} · fictional mockup, not for sale</p>
                :<p className="spatial-fine">No product link · visual note only</p>}
              <p className="spatial-fine">Reviewed detection · approximate area, not verified product identity.</p></>
          :<><h3>{authoredDetail!.productName}</h3>
            <p>{authoredDetail!.brandName} · unverified · fictional, not for sale</p>
            <p className="spatial-fine">Demo price: ${authoredDetail!.priceUsd.toLocaleString('en-US')} USD</p>
            <ul>{authoredDetail!.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
            <p className="spatial-fine">Manually authored hotspot · no SAM inference. Material and specifications unverified.</p></>}
      </div>
    </>}
    </div>
    {caption&&<><figcaption className="article-brand">{caption.brand}</figcaption>
      <figcaption className="spatial-fine">{caption.fine}</figcaption></>}
  </figure>
}
