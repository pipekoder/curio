import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import type {StagedHotspot} from './staging'
import {fetchObjectRegions,mergeHotspots,type ObjectRegion} from './object-regions'

// Verified-object discovery on one editorial image: dot markers for
// approved SAM regions merged with exact authored points, and one compact
// anchored popover. Selection never refetches and never infers; anything
// unreviewed, revoked or failed simply leaves no marker behind.
// The popover renders in a body portal with viewport-fixed positioning so
// ancestor overflow never clips it: it sits beside its hotspot, flips
// left/right when space runs out, and clamps fully inside the viewport.
// Narrow screens get a bottom sheet through the stylesheet instead.
export default function ObjectDiscovery({assetId,image,alt,authored,caption,initialSelectedId=null,onConsumeSpotlight,className,loading,width,height}:{
  assetId:string;image:string;alt:string;authored:readonly StagedHotspot[];caption?:{brand:string;fine:string};
  initialSelectedId?:string|null;onConsumeSpotlight?:()=>void;className?:string;loading?:'lazy'|'eager';width?:number;height?:number
}){
  const [regions,setRegions]=useState<ObjectRegion[]|null>(null)
  const [selected,setSelected]=useState<string|null>(initialSelectedId)
  const [failed,setFailed]=useState(false)
  const popoverId=useId()
  const closeRef=useRef<HTMLButtonElement>(null)
  const popRef=useRef<HTMLDivElement>(null)
  const markers=useRef(new Map<string,HTMLButtonElement>())
  const [frame,setFrame]=useState<{left:number;top:number}|null>(null)
  useEffect(()=>{
    let alive=true
    void fetchObjectRegions(assetId).then(data=>{if(alive)setRegions(data?.regions??[])})
    return ()=>{alive=false}
  },[assetId])
  useEffect(()=>{
    if(initialSelectedId){setSelected(initialSelectedId);onConsumeSpotlight?.()}
  },[initialSelectedId,onConsumeSpotlight])
  // Viewport placement runs before paint so the card never flashes at a
  // stale spot, then tracks resizes and scrolls while it stays open.
  useLayoutEffect(()=>{
    if(!selected)return
    const place=()=>{
      const marker=markers.current.get(selected)
      const pop=popRef.current
      const vw=window.innerWidth,vh=window.innerHeight,margin=12,gap=14
      const w=Math.min(Math.max(pop?.offsetWidth||300,200),320,Math.max(vw-margin*2,200))
      const h=Math.max(pop?.offsetHeight||240,120)
      const r=marker?.getBoundingClientRect()
      const cx=r?r.left+r.width/2:vw/2,cy=r?r.top+r.height/2:vh/2,hw=r?r.width/2:0
      const right=cx+hw+gap
      const left=Math.min(Math.max(margin,right+w<=vw-margin?right:cx-hw-gap-w),Math.max(margin,vw-margin-w))
      const top=Math.min(Math.max(margin,cy-h/2),Math.max(margin,vh-margin-h))
      setFrame({left:Math.round(left),top:Math.round(top)})
    }
    place()
    window.addEventListener('resize',place)
    window.addEventListener('scroll',place,true)
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
  },[selected])
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
    {mark&&detail&&createPortal(<>
      <div className="object-catcher" aria-hidden="true" onClick={()=>setSelected(null)}/>
      <div id={popoverId} ref={popRef} role="dialog" aria-label={sam?.label??authoredDetail!.productName} className="object-popover is-floating"
        style={{'--pop-left':`${frame?.left??12}px`,'--pop-top':`${frame?.top??12}px`} as CSSProperties}>
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
    </>,document.body)}
    </div>
    {caption&&<><figcaption className="article-brand">{caption.brand}</figcaption>
      <figcaption className="spatial-fine">{caption.fine}</figcaption></>}
  </figure>
}
