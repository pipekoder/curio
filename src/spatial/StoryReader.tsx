import {useEffect,useRef,useState} from 'react'
import type {StagedExhibit} from './staging'
import type {StagedPlan} from './edition'
import Sources from './Sources'

// In-place editorial reading: the compact Story card expands into a larger
// reading surface without leaving the promenade. Content is composed only
// from already-staged exhibit fields — never fabricated. Page scroll locks
// while open so the camera and active exhibit stay put; the WebGL scene is
// untouched (the hero image is the same approved asset in a 2D layer).
export default function StoryReader({exhibit,plan,index,total,onClose,onInspect}:{
  exhibit:StagedExhibit;plan:StagedPlan|null;index:number;total:number;
  onClose:()=>void;onInspect:(assetId:string)=>void
}){
  const dialogRef=useRef<HTMLDivElement>(null)
  const headingRef=useRef<HTMLHeadingElement>(null)
  // Story artwork that fails to load is dropped, never broken-image icons:
  // revoked or missing media fails closed per the article contract.
  const [hidden,setHidden]=useState<readonly string[]>([])
  const storyImages=exhibit.article?.storyImages.filter(image=>!hidden.includes(image.assetId))
  useEffect(()=>{
    document.documentElement.style.overflow='hidden'
    headingRef.current?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();onClose();return}
      if(event.key==='Tab'){
        const root=dialogRef.current
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
      document.getElementById('spatial-read-story')?.focus()
    }
  },[onClose])
  const paragraphs=exhibit.narrative.split(/\n\n+/).map(paragraph=>paragraph.trim()).filter(Boolean)
  return <div className="spatial-story-backdrop" onClick={onClose}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="spatial-story-title" className="spatial-story" onClick={event=>event.stopPropagation()}>
      <button type="button" className="spatial-story-close" onClick={onClose} aria-label="Close story and return to exhibition">×</button>
      <p className="spatial-eyebrow">Story · Exhibit {index+1} of {total}</p>
      <h2 id="spatial-story-title" ref={headingRef} tabIndex={-1}>{exhibit.title}</h2>
      {exhibit.article&&<p className="spatial-story-deck">{exhibit.article.deck}</p>}
      {storyImages
        ?storyImages.map(image=>(
          <figure key={image.assetId} className="spatial-story-hero">
            <img src={image.image} alt={image.alt} onError={()=>setHidden(failed=>failed.includes(image.assetId)?failed:[...failed,image.assetId])}/>
            <figcaption className="spatial-story-brand">{image.brandName}</figcaption>
            <figcaption className="spatial-fine">{image.attribution} · {image.rights}</figcaption>
          </figure>
        ))
        :<figure className="spatial-story-hero">
          <img src={exhibit.image} alt={`Artwork for ${exhibit.title}`}/>
        </figure>}
      {paragraphs.map(paragraph=><p key={paragraph.slice(0,48)}>{paragraph}</p>)}
      {exhibit.thread&&<p className="spatial-story-thread">{exhibit.thread}</p>}
      {!exhibit.article&&<p className="spatial-fine">{exhibit.attribution} · {exhibit.rights}</p>}
      {exhibit.hotspots.length>0&&<button type="button" onClick={()=>onInspect(exhibit.assetId)}>Explore object details →</button>}
      <p className="spatial-fine">Scroll to read · Press Esc to return to the exhibition.</p>
      <Sources exhibit={exhibit} plan={plan}/>
    </div>
  </div>
}
