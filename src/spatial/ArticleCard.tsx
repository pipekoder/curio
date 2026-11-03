import {useCallback,useEffect,useRef,useState} from 'react'
import type {StagedExhibit} from './staging'
import type {StagedPlan} from './edition'
import ObjectDiscovery from './ObjectDiscovery'
import Sources from './Sources'

// One editorial reading surface in two sizes: the compact promenade card
// and the expanded overlay share this exact content and component. Artwork
// that fails to load is dropped, never broken-image icons: revoked or
// missing media fails closed per the article contract.
export default function ArticleCard({exhibit,plan,index,total,expanded,onToggle,scrollTop,spotlightId,onConsumeSpotlight}:{
  exhibit:StagedExhibit;plan:StagedPlan|null;index:number;total:number;
  expanded:boolean;onToggle:()=>void;scrollTop:{current:number};
  spotlightId:string|null;onConsumeSpotlight:()=>void
}){
  const headingRef=useRef<HTMLHeadingElement>(null)
  const scroller=useRef<HTMLElement|null>(null)
  const [hidden,setHidden]=useState<readonly string[]>([])
  const storyImages=exhibit.article?.storyImages.filter(image=>!hidden.includes(image.assetId))
  const ref=useCallback((el:HTMLElement|null)=>{
    if(scroller.current&&!el)scrollTop.current=scroller.current.scrollTop
    scroller.current=el
    if(el)el.scrollTop=Math.min(scrollTop.current,el.scrollHeight)
  },[expanded,scrollTop])
  useEffect(()=>{
    if(!expanded)return
    document.documentElement.style.overflow='hidden'
    headingRef.current?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        if((event.target as HTMLElement|null)?.closest?.('.object-popover'))return
        event.stopPropagation()
        onToggle()
        return
      }
      if(event.key==='Tab'){
        const root=scroller.current
        if(!root)return
        const focusable=[...root.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
        if(!focusable.length)return
        const first=focusable[0],last=focusable[focusable.length-1]
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
    }
    window.addEventListener('keydown',onKey)
    return ()=>{
      window.removeEventListener('keydown',onKey)
      document.documentElement.style.overflow=''
      document.getElementById('article-expand-toggle')?.focus()
    }
  },[expanded,onToggle])
  const paragraphs=exhibit.narrative.split(/\n\n+/).map(paragraph=>paragraph.trim()).filter(Boolean)
  const toggleLabel=expanded?'Collapse story':'Expand story'
  const content=<>
    <div className="article-head">
      <p className="spatial-eyebrow">Story · Exhibit {index+1} of {total}</p>
      <button type="button" id={expanded?undefined:'article-expand-toggle'} className="article-toggle"
        aria-label={toggleLabel} aria-expanded={expanded} title={toggleLabel} onClick={onToggle}>
        {expanded
          ?<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>
          :<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>}
      </button>
    </div>
    <h2 ref={headingRef} tabIndex={expanded?-1:undefined}>{exhibit.title}</h2>
    {exhibit.article&&<p className="article-deck">{exhibit.article.deck}</p>}
    <ObjectDiscovery key={exhibit.assetId} assetId={exhibit.assetId} image={exhibit.image} alt={`Artwork for ${exhibit.title}`}
      authored={exhibit.hotspots} initialSelectedId={spotlightId} onConsumeSpotlight={onConsumeSpotlight}
      caption={storyImages?.[0]?{brand:storyImages[0].brandName,fine:`${storyImages[0].attribution} · ${storyImages[0].rights}`}:undefined}/>
    {(storyImages??[]).slice(1).map(image=>(
      <figure key={image.assetId} className="article-hero">
        <img src={image.image} alt={image.alt} onError={()=>setHidden(failed=>failed.includes(image.assetId)?failed:[...failed,image.assetId])}/>
        <figcaption className="article-brand">{image.brandName}</figcaption>
        <figcaption className="spatial-fine">{image.attribution} · {image.rights}</figcaption>
      </figure>
    ))}
    <div className="article-body">
      {paragraphs.map(paragraph=><p key={paragraph.slice(0,48)}>{paragraph}</p>)}
      {exhibit.thread&&<p className="article-thread">{exhibit.thread}</p>}
      {!exhibit.article&&<p className="spatial-fine">{exhibit.attribution} · {exhibit.rights}</p>}
    </div>
    <Sources exhibit={exhibit} plan={plan}/>
  </>
  if(expanded)return <div className="spatial-story-backdrop is-expanded" onClick={onToggle}>
    <article ref={ref} role="dialog" aria-modal="true" aria-label={`${exhibit.title}, expanded story`}
      className="spatial-story is-expanded" onClick={event=>event.stopPropagation()}>
      {content}
    </article>
  </div>
  return <article ref={ref} className="spatial-rail-card rail-story">
    {content}
  </article>
}
