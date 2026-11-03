import {lazy,Suspense,useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import type {StagedArticleImage,StagedExhibit} from './staging'
import type {StagedPlan} from './edition'
import ObjectDiscovery from './ObjectDiscovery'
import {loadEditorialFont,normalizeTemplate,templateOf,type BookTemplate} from './editorial-book'
import './editorial-book.css'
const Sources=lazy(()=>import('./Sources'))
const ResearchSources=lazy(()=>import('./ResearchSources'))

// One editorial reading surface in two sizes: the compact promenade card
// and the expanded overlay share this exact content and component. Article
// exhibits render as an Editorial Book template assigned deterministically
// from the stable article ID; feature exhibits keep the existing layout
// untouched. Artwork that fails to load is dropped, never broken-image
// icons: revoked or missing media fails closed per the article contract.
export default function ArticleCard({exhibit,plan,index,total,expanded,onToggle,scrollTop,spotlightId,onConsumeSpotlight,template}:{
  exhibit:StagedExhibit;plan:StagedPlan|null;index:number;total:number;
  expanded:boolean;onToggle:()=>void;scrollTop:{current:number};
  spotlightId:string|null;onConsumeSpotlight:()=>void;template?:BookTemplate
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
  const article=exhibit.article
  useEffect(()=>{if(article)loadEditorialFont()},[article])
  const paragraphs=exhibit.narrative.split(/\n\n+/).map(paragraph=>paragraph.trim()).filter(Boolean)
  const toggleLabel=expanded?'Collapse story':'Expand story'
  const head=<div className="article-head">
    <p className="spatial-eyebrow">Story · Exhibit {index+1} of {total}</p>
    <button type="button" id={expanded?undefined:'article-expand-toggle'} className="article-toggle"
      aria-label={toggleLabel} aria-expanded={expanded} title={toggleLabel} onClick={onToggle}>
      {expanded
        ?<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>
        :<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>}
    </button>
  </div>
  if(!article){
    const content=<>
      {head}
      <h2 ref={headingRef} tabIndex={expanded?-1:undefined}>{exhibit.title}</h2>
      <ObjectDiscovery key={exhibit.assetId} assetId={exhibit.assetId} image={exhibit.image} alt={`Artwork for ${exhibit.title}`}
        authored={exhibit.hotspots} initialSelectedId={spotlightId} onConsumeSpotlight={onConsumeSpotlight}/>
      <div className="article-body">
        {paragraphs.map(paragraph=><p key={paragraph.slice(0,48)}>{paragraph}</p>)}
        {exhibit.thread&&<p className="article-thread">{exhibit.thread}</p>}
        <p className="spatial-fine">{exhibit.attribution} · {exhibit.rights}</p>
      </div>
      {plan?<Suspense fallback={null}><Sources exhibit={exhibit} plan={plan}/></Suspense>:null}
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
  const variant=normalizeTemplate(template??templateOf(article.id))
  const extras=(storyImages??[]).slice(1)
  const grouped=variant==='gallery'?extras.slice(0,2):[]
  const rest=variant==='gallery'?extras.slice(2):extras
  const hide=(assetId:string)=>setHidden(failed=>failed.includes(assetId)?failed:[...failed,assetId])
  const figure=(image:StagedArticleImage,at:number)=>(
    <figure key={`${image.assetId}-${at}`} className="article-hero eb-figure">
      <img src={image.image} alt={image.alt} width={image.width} height={image.height} loading="lazy" onError={()=>hide(image.assetId)}/>
      <figcaption className="article-brand">{image.brandName}</figcaption>
      <figcaption className="spatial-fine">{image.attribution} · {image.rights}</figcaption>
    </figure>
  )
  // Photos interleave with the narrative in order: hero opens, the next
  // photo follows the introduction, the rest spread toward the late
  // sections. Fewer paragraphs than photos appends the remainder in
  // order; no text is invented and no photo is dropped.
  const slots:ReactNode[]=[]
  if(grouped.length)slots.push(<div key="eb-group" className="eb-group">{grouped.map((image,at)=>figure(image,at))}</div>)
  rest.forEach((image,at)=>slots.push(figure(image,at+grouped.length)))
  const flow:ReactNode[]=[]
  const groups=slots.length+1
  const per=Math.max(1,Math.ceil(paragraphs.length/groups))
  let pi=0
  for(let g=0;g<groups;g++){
    const take=g<groups-1?per:paragraphs.length-pi
    for(let n=0;n<take&&pi<paragraphs.length;n++){flow.push(<p key={`p${pi}`}>{paragraphs[pi]}</p>);pi++}
    if(g<slots.length)flow.push(slots[g])
  }
  const book=<>
    {head}
    <div className="eb-hero">
      <div className="eb-headblock">
        <h2 ref={headingRef} tabIndex={expanded?-1:undefined} className="eb-headline">{exhibit.title}</h2>
        <p className="article-deck eb-deck">{article.deck}</p>
      </div>
      <div className="eb-herofigure">
        <ObjectDiscovery key={exhibit.assetId} assetId={exhibit.assetId} image={exhibit.image} alt={`Artwork for ${exhibit.title}`}
          authored={exhibit.hotspots} initialSelectedId={spotlightId} onConsumeSpotlight={onConsumeSpotlight}
          caption={storyImages?.[0]?{brand:storyImages[0].brandName,fine:`${storyImages[0].attribution} · ${storyImages[0].rights}`}:undefined}/>
      </div>
    </div>
    <div className="eb-flow">{flow}</div>
    {exhibit.thread&&<p className="article-thread eb-thread">{exhibit.thread}</p>}
    {plan?<Suspense fallback={null}><Sources exhibit={exhibit} plan={plan}/></Suspense>:null}
    {article.researchReferences?.length||article.aiDisclosure?<Suspense fallback={null}><ResearchSources references={article.researchReferences??[]} disclosure={article.aiDisclosure}/></Suspense>:null}
  </>
  const bookClass=`editorial-book is-${variant}${expanded?'':' is-compact'}`
  if(expanded)return <div className="spatial-story-backdrop is-expanded" onClick={onToggle}>
    <article ref={ref} role="dialog" aria-modal="true" aria-label={`${exhibit.title}, expanded story`}
      className={`spatial-story is-expanded ${bookClass}`} onClick={event=>event.stopPropagation()}>
      {book}
    </article>
  </div>
  return <article ref={ref} className={`spatial-rail-card rail-story ${bookClass}`}>
    {book}
  </article>
}
