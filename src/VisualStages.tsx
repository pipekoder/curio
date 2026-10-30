import {useEffect,useReducer,useRef,useState,type RefObject} from 'react'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialEdition} from '../shared/editorial'
import CatalogImage from './CatalogImage'
import LivingAdvertisement from './LivingAdvertisement'
import {demoMediaFor} from './editorial-demo-media'
import {readerSegmentation} from '../shared/decoder'
import {initialReaderInteraction,readerInteraction} from './reader-interaction'

const media=(file:string)=>`/editorial/${file}`

/** The request has started. No synthetic percentage or provisional model text is shown. */
export function VisualGenerate({prompt,consent,edition}: {prompt:string;consent:boolean;edition:EditorialEdition|null}) {
 return <section className={`visual-stage visual-generate${edition?' is-assembled':''}`} aria-label="Composing your magazine" aria-busy={!edition}>
  <header className="visual-stage-label"><span>02</span><div>Generate<small>Composing your personalized magazine</small></div></header>
  <span className="visual-stage-brand">curio.</span>
  <div className="visual-pending" role="status">{edition?'Edition ready · opening your magazine':'Composing your magazine…'}<i aria-hidden="true"/></div>
  <div className="visual-assembly" aria-hidden="true">
  <svg className="visual-stage-orbits" viewBox="0 0 451 543" aria-hidden="true"><ellipse cx="225" cy="431" rx="195" ry="38"/><ellipse cx="225" cy="431" rx="157" ry="27"/><circle cx="225" cy="431" r="112"/></svg>
  <div className="visual-gen-plane gen-plane-left"><img src={media('generate/03_arched_interior.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-leftmost"><img src={media('generate/14_generate_coast.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-left-inner"><img src={media('generate/15_generate_table.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-back"><img src={media('generate/07_sculptural_living_room.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-right"><img src={media('generate/13_generate_vase.png')} alt=""/></div>
  <div className="visual-gen-cover"><small>CURIO / PERSONAL EDITION</small><strong>{edition?.plan.title??<>Your<br/>next issue</>}</strong><p>{edition?.plan.deck??prompt}</p><span>{edition?'ISSUE READY':'COMPOSING'}</span></div>
  <div className="visual-gen-categories" aria-hidden="true">OBJECTS <span>SPACES</span><span>PEOPLE</span><span>IDEAS</span> CULTURE</div>
  </div>
  <p className="visual-ai-disclosure">{edition?edition.source==='meta'?'Validated Meta editorial plan.':'Curio-authored edition · AI not used.':consent?'Meta AI requested with consent; fallback remains available.':'No AI requested; composing an authored edition.'}</p>
 </section>
}

export function VisualReader({edition,pool,headingRef,onStory,onCollect,onRefine,onCollection,saveMessage}: {edition:EditorialEdition;pool:readonly CatalogItem[];headingRef:RefObject<HTMLHeadingElement|null>;onStory:(ad:CatalogItem,thread?:{detail:string;relationship:string})=>void;onCollect:(ad:CatalogItem)=>void;onRefine:()=>void;onCollection:()=>void;saveMessage?:string}) {
 const features=edition.plan.features.flatMap(feature=>{const ad=pool.find(a=>a.id===feature.catalogId&&a.image.id===feature.assetId);return ad?[{feature,ad}]:[]})
 const [interaction,dispatch]=useReducer(readerInteraction,undefined,()=>{const page=Number(new URLSearchParams(window.location.search).get('page'));return {...initialReaderInteraction,featureIndex:Number.isInteger(page)&&page>=1&&page<=features.length?page-1:0}})
 const {featureIndex:currentIndex,detailOpen,exploring}=interaction
 const hotspotRef=useRef<HTMLButtonElement>(null)
 const readerRef=useRef<HTMLElement>(null)
 const [revealHost,setRevealHost]=useState<HTMLElement|null>(null)
 const [focusTrace,setFocusTrace]=useState<{x1:number;y1:number;x2:number;y2:number}|null>(null)
 useEffect(()=>{headingRef.current?.focus()},[headingRef,currentIndex])
 useEffect(()=>{if(!detailOpen||window.innerWidth>640)return;const frame=requestAnimationFrame(()=>{const detail=readerRef.current?.querySelector<HTMLElement>('.chair-demo-detail');if(!detail)return;const top=window.scrollY+detail.getBoundingClientRect().top-window.innerHeight*.72;window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});return()=>cancelAnimationFrame(frame)},[detailOpen])
 useEffect(()=>{if(window.location.pathname!=='/explore')return;const url=new URL(window.location.href);if(currentIndex)url.searchParams.set('page',String(currentIndex+1));else url.searchParams.delete('page');window.history.replaceState(window.history.state,'',url)},[currentIndex])
 useEffect(()=>{
  const section=document.getElementById('reader-sequence');if(!section||typeof IntersectionObserver==='undefined')return
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target)}}),{threshold:.12})
  section.querySelectorAll('.reader-chapter').forEach(node=>observer.observe(node))
  return()=>observer.disconnect()
 },[edition.plan])
 useEffect(()=>{
  const root=readerRef.current;if(!root)return;
  const update=()=>{
   const selected=root.querySelector<HTMLElement>('.chair-demo-hotspot[aria-expanded="true"],.image-hotspot[aria-expanded="true"]');
   const detail=root.querySelector<HTMLElement>('.chair-demo-detail,.editorial-reveal');
   if(!selected||!detail){setFocusTrace(null);return}
   const a=selected.getBoundingClientRect(),b=detail.getBoundingClientRect(),c=root.getBoundingClientRect();
   const mobile=b.top>=a.bottom;
   setFocusTrace({x1:a.left+a.width/2-c.left,y1:a.top+a.height/2-c.top,x2:(mobile?b.left+b.width/2:b.left)-c.left,y2:(mobile?b.top:b.top+Math.min(85,b.height/2))-c.top});
  };
  const observer=new MutationObserver(update);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-expanded','hidden']});
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);resize?.observe(root);window.addEventListener('resize',update);update();
  return()=>{observer.disconnect();resize?.disconnect();window.removeEventListener('resize',update)};
 },[currentIndex,exploring,detailOpen]);
 if(!features.length)return null
 const {ad,feature}=features[currentIndex]??features[0]
 const mediaRecord=demoMediaFor(ad.image.id)
 const product=mediaRecord?.product
 const hotspot=product?.hotspot
 const hasDetails=Boolean(hotspot || readerSegmentation(ad,undefined)?.regions.length)
 const object=ad.discoverableObjects[0]
 const rail=['08_ochre_lounge_chair.png','17_read_soft_furnishing.png','18_read_portrait.png','16_read_chair.png'].filter(file=>!ad.image.path?.endsWith(file)).slice(0,3)
 const storyThread=object?{detail:object.label,relationship:'visible form and editorial context'}:undefined
 return <><section ref={readerRef} className={`visual-stage visual-reader${focusTrace?' has-object-focus':''}`} aria-label="Read and explore" data-asset-id={ad.image.id}>
  <header className="visual-stage-label"><span>03</span><div>Read &amp; Explore<small>Tap a detail to discover more</small></div></header>
  <div className="visual-reader-intro"><span>{ad.category==='home'?'Objects':ad.category==='fashion'?'Style':'Places'} · {mediaRecord?'fictional demo':'catalog study'}</span><h2 id="reader-heading" ref={headingRef} tabIndex={-1}>{feature.headline}</h2><p>{feature.narrative}</p>{features.length>1&&<a className="reader-continue" href="#reader-sequence">Continue the issue ↓</a>}</div>
  <div className={`visual-reader-back-photo${mediaRecord?'':' catalog-annotated'}${exploring?' is-exploring':''}`}>{mediaRecord?<CatalogImage ad={ad} eager/>:<LivingAdvertisement key={ad.image.id} ad={ad} eager explorationEnabled={exploring} revealHost={revealHost} onExploreStory={(next,detail,relationship)=>onStory(next,{detail,relationship})}/>} {exploring&&hotspot&&<button ref={hotspotRef} className="chair-demo-hotspot" type="button" style={{left:`${hotspot.x*100}%`,top:`${hotspot.y*100}%`}} aria-label={`Explore ${hotspot.label} in photograph (manually annotated)`} aria-expanded={detailOpen} aria-controls="reader-demo-detail" onClick={()=>dispatch({type:'toggleDetail'})}><span aria-hidden="true">＋</span></button>}{hasDetails&&<button className="reader-explore-toggle" type="button" aria-pressed={exploring} onClick={()=>dispatch({type:'toggleExplore'})}>{exploring?'Close exploration':'Explore image details'}</button>}</div>
  <aside className="visual-reader-sidebar"><div ref={setRevealHost} className="visual-reader-reveal-host" aria-live="polite"/>
  <div className="visual-reader-context"><span>Visual detail</span><strong>{object?.label??'Follow the story'}</strong><img src={media(ad.image.path?.endsWith('12_boucle_fabric_detail.png')?'read/08_ochre_lounge_chair.png':'read/12_boucle_fabric_detail.png')} alt="Owner-provided companion editorial image"/><small>Editorial image; material identity is unverified.</small></div>
  <div className="visual-reader-photo-rail" aria-label="Related editorial images">{rail.map(file=><img key={file} src={media(`read/${file}`)} alt="Owner-provided related editorial study"/>)}</div></aside>
  {detailOpen&&product&&<aside className="chair-demo-detail" id="reader-demo-detail" aria-label="Fictional product details"><button className="chair-demo-close" type="button" onClick={()=>{dispatch({type:'closeDetail'});hotspotRef.current?.focus()}} aria-label="Close product details">×</button><span>FICTIONAL DEMO PRODUCT · {ad.category.toUpperCase()}</span><h3>{product.name}</h3><p>{product.brandName} · unverified</p><p>{object?.description??ad.description}</p><p className="chair-demo-price">Demo price: ${product.priceUsd.toLocaleString('en-US')} USD · fictional, not for sale</p><ul>{product.assumptions.map(a=><li key={a}>{a}</li>)}</ul><small>Manually authored hotspot · no SAM inference. Material and specifications unverified.</small><button type="button" onClick={()=>onStory(ad,storyThread)}>Explore related story →</button><button type="button" onClick={()=>onCollect(ad)}>Collect this image</button></aside>}
  <div className="visual-reader-caption"><strong>{ad.name}</strong><small>{mediaRecord?product?.brandName??'Curio editorial study · no product':'Validated catalog study'}</small><p>{ad.description}</p><button onClick={()=>onStory(ad,storyThread)} aria-label={`Open ${ad.name} story`}>→</button></div>
  <nav className="visual-reader-pages" aria-label="Edition pages">{features.map(({ad:next},i)=><button key={next.image.id} aria-current={i===currentIndex?'page':undefined} aria-label={`Read edition page ${i+1}: ${next.name}`} onClick={()=>dispatch({type:'changeFeature',index:i})}><span>{String(i+1).padStart(2,'0')}</span><CatalogImage ad={next}/></button>)}</nav>
  <span className="visual-reader-count">{String(currentIndex+1).padStart(2,'0')} / {String(features.length).padStart(2,'0')}</span>
  <button className="visual-reader-related" onClick={()=>onStory(ad,storyThread)}>RELATED<br/>STORIES <span>→</span></button>
  {focusTrace&&<svg className="reader-focus-trace" aria-hidden="true" width="100%" height="100%"><path d={`M${focusTrace.x1} ${focusTrace.y1} C${focusTrace.x1+(focusTrace.x2-focusTrace.x1)*.6} ${focusTrace.y1},${focusTrace.x2-(focusTrace.x2-focusTrace.x1)*.4} ${focusTrace.y2},${focusTrace.x2} ${focusTrace.y2}`}/><circle cx={focusTrace.x1} cy={focusTrace.y1} r="4"/><circle cx={focusTrace.x2} cy={focusTrace.y2} r="3"/></svg>}
 </section>{features.length>1&&<section id="reader-sequence" className="reader-sequence" aria-label="Continue reading this edition"><div className="reader-sequence-heading"><span>CURIO / THE ISSUE</span><h2>{edition.plan.title}</h2><p>{edition.plan.deck}</p></div>{features.slice(1).map(({ad:next,feature:nextFeature},index)=>{const connection=edition.plan.connections?.find(item=>item.fromAssetId===features[index].ad.image.id&&item.toAssetId===next.image.id);return <article className={`reader-chapter reader-chapter-${index%2?'reverse':'forward'} reader-layout-${nextFeature.layout}`} key={next.image.id}><div className="reader-chapter-image"><CatalogImage ad={next} eager={false}/><span>{String(index+2).padStart(2,'0')} / {String(features.length).padStart(2,'0')}</span></div><div className="reader-chapter-copy"><span>{next.category==='home'?'OBJECTS':next.category==='fashion'?'STYLE':'PLACES'} / {next.provenance.attribution}</span><h3>{nextFeature.headline}</h3><p>{nextFeature.narrative}</p>{connection&&<blockquote>{connection.thread}</blockquote>}{nextFeature.discoveryQuestion&&<p className="reader-chapter-question">{nextFeature.discoveryQuestion}</p>}<div className="reader-chapter-actions"><button onClick={()=>onStory(next)}>Explore the story →</button><button onClick={()=>onCollect(next)}>Collect this chapter</button></div></div></article>})}</section>}<div className="visual-stage-controls"><p>{edition.source==='meta'?'Validated Meta editorial plan':'Curio-authored edition · AI not used'} · {edition.plan.title}</p><button onClick={()=>onCollect(ad)}>Collect image</button><button onClick={onCollection}>Your collection</button><button onClick={onRefine}>Refine with a new prompt</button>{saveMessage&&<p role="status">{saveMessage}</p>}</div></>
}

export function VisualJourney({story,related,topic,origin,canReturn,onReturn,onRelated,onFollow,onCollect}: {story:CatalogItem;related:readonly CatalogItem[];topic:string;origin?:string;canReturn:boolean;onReturn:()=>void;onRelated:(ad:CatalogItem)=>void;onFollow:(theme:string)=>void;onCollect:()=>void}) {
 const branches=related.slice(0,2)
 const themes=[...story.discoverableObjects.map(o=>o.label),...story.lifestyleTags].slice(0,5)
 const rootRef=useRef<HTMLElement>(null)
 const [connections,setConnections]=useState<{x1:number;y1:number;x2:number;y2:number}[]>([])
 useEffect(()=>{
  const root=rootRef.current;if(!root)return
  const update=()=>{
   const center=root.querySelector('.journey-center')?.getBoundingClientRect(),base=root.getBoundingClientRect()
   if(!center)return
   setConnections([...root.querySelectorAll('.journey-related')].map(node=>{
    const target=node.getBoundingClientRect()
    return {x1:center.left+center.width/2-base.left,y1:center.top+center.height/2-base.top,x2:target.left+target.width/2-base.left,y2:target.top+target.height/2-base.top}
   }))
  }
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);observer?.observe(root);update();window.addEventListener('resize',update)
  return()=>{observer?.disconnect();window.removeEventListener('resize',update)}
 },[story.image.id,related])
 return <section ref={rootRef} className="visual-stage visual-journey" aria-label="Curiosity Journey">
  <header className="visual-stage-label"><span>04</span><div>Curiosity Journey<small>Explore connections across objects, places, people and ideas</small></div></header>
  <svg className="journey-orbits" viewBox="0 0 853 475" aria-hidden="true"><ellipse cx="407" cy="257" rx="333" ry="125"/><ellipse cx="406" cy="257" rx="260" ry="175" transform="rotate(-17 406 257)"/><path d="M52 221C158 127 286 139 423 242S663 336 765 158M82 351C282 225 504 214 773 342"/></svg>
  <svg className="journey-links" aria-hidden="true">{connections.map((point,i)=><path key={branches[i]?.image.id??i} d={`M${point.x1} ${point.y1} Q${(point.x1+point.x2)/2} ${Math.min(point.y1,point.y2)-45} ${point.x2} ${point.y2}`}/>)}</svg>
  {origin&&<p className="journey-origin">From {origin} → {story.name}</p>}
  {canReturn&&<button className="journey-back" onClick={onReturn}>← Previous discovery</button>}
  <article className="journey-center"><CatalogImage ad={story} eager/><div><strong>{story.name}</strong><small>{story.provenance.attribution}</small></div></article>
  <div className="journey-plane journey-people"><img src={media('journey/06_coffee_ritual.png')} alt="Owner-provided coffee ritual image"/><span>Rituals</span></div>
  <div className="journey-plane journey-place"><img src={media('journey/09_coastal_architecture.png')} alt="Owner-provided coastal architecture image"/><span>Places</span></div>
  <div className="journey-plane journey-arch"><img src={media('journey/19_journey_arched_space.png')} alt="Arched space study"/><span>Spaces</span></div>
  <div className="journey-plane journey-room"><img src={media('journey/20_journey_living_room.png')} alt="Living room study"/><span>Rooms</span></div>
  <div className="journey-plane journey-objects"><img src={media('journey/21_journey_objects.png')} alt="Object still life"/><span>Objects</span></div>
  <div className="journey-plane journey-coast"><img src={media('journey/22_journey_coastal_room.png')} alt="Coastal room study"/><span>Places</span></div>
  {branches.map((ad,i)=><button className={`journey-related journey-related-${i}`} key={ad.image.id} onClick={()=>onRelated(ad)}><CatalogImage ad={ad}/><span>Related Curio study<br/>{ad.name} →</span></button>)}
  <nav className="journey-themes" aria-label="Explore related themes"><span>EXPLORE</span>{themes.map(theme=><button key={theme} aria-pressed={topic===theme} onClick={()=>onFollow(theme)}>{theme}</button>)}</nav>
  <button className="journey-collect" onClick={onCollect}>Collect this story →</button>
 </section>
}

export function VisualCollect({savedCount,current,onDiscover,onOpen,onRemove}: {savedCount:number;current:CatalogItem|null;onDiscover:()=>void;onOpen:()=>void;onRemove:()=>void}) {
 return <section className="visual-stage visual-collect" aria-label="Collection overview">
  <header className="visual-stage-label"><span>05</span><div>Collect<small>Save and curate your discoveries</small></div></header>
  <div className="collect-heading"><h2>My<br/>Collection</h2><p>{savedCount} {savedCount===1?'item':'items'}</p><button onClick={onDiscover} aria-label="Return to Discover">＋</button></div>
  <svg className="collect-rings" viewBox="0 0 678 475" aria-hidden="true"><ellipse cx="344" cy="350" rx="295" ry="36"/><ellipse cx="344" cy="350" rx="235" ry="29"/><ellipse cx="344" cy="350" rx="178" ry="22"/></svg>
  <div className="collect-plane collect-back"><img src={media('collect/04_limestone_texture.png')} alt="Owner-provided limestone texture image"/></div>
  <div className="collect-plane collect-far-left"><img src={media('collect/23_collect_tabletop.png')} alt="Tabletop editorial study"/></div>
  <div className="collect-plane collect-left"><img src={media('collect/24_collect_chair.png')} alt="Chair editorial study"/></div>
  <div className="collect-plane collect-right"><img src={media('collect/25_collect_dining.png')} alt="Dining room editorial study"/></div>
  <div className="collect-plane collect-far-right"><img src={media('collect/26_collect_coast.png')} alt="Coastal architecture editorial study"/></div>
  {current&&<div className="collect-plane collect-front"><CatalogImage ad={current}/><div><strong>{current.name}</strong><small>{current.provenance.attribution}</small><button onClick={onOpen}>Revisit</button><button onClick={onRemove}>Remove</button></div></div>}
  <div className="collect-axis" aria-hidden="true">ALL · PLACES · OBJECTS · BRANDS · IDEAS · PEOPLE</div>
 </section>
}
