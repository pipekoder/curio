import {useEffect,useState,type RefObject} from 'react'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialEdition} from '../shared/editorial'
import CatalogImage from './CatalogImage'
import {chairDemo,chairDemoDetails} from './chair-demo'

const media=(file:string)=>`/editorial/${file}`

/** The request has started. No synthetic percentage or provisional model text is shown. */
export function VisualGenerate({prompt,consent}: {prompt:string;consent:boolean}) {
 return <section className="visual-stage visual-generate" aria-label="Composing your magazine" aria-busy="true">
  <header className="visual-stage-label"><span>02</span><div>Generate<small>Composing your personalized magazine</small></div></header>
  <span className="visual-stage-brand">curio.</span>
  <div className="visual-pending" role="status">Composing your magazine…<i aria-hidden="true"/></div>
  <svg className="visual-stage-orbits" viewBox="0 0 451 543" aria-hidden="true"><ellipse cx="225" cy="431" rx="195" ry="38"/><ellipse cx="225" cy="431" rx="157" ry="27"/><circle cx="225" cy="431" r="112"/></svg>
  <div className="visual-gen-plane gen-plane-left"><img src={media('generate/03_arched_interior.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-leftmost"><img src={media('generate/14_generate_coast.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-left-inner"><img src={media('generate/15_generate_table.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-back"><img src={media('generate/07_sculptural_living_room.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-right"><img src={media('generate/13_generate_vase.png')} alt=""/></div>
  <div className="visual-gen-cover"><small>CURIO / PERSONAL EDITION</small><strong>Your<br/>next issue</strong><p>{prompt}</p><span>COMPOSING</span></div>
  <div className="visual-gen-categories" aria-hidden="true">OBJECTS <span>SPACES</span><span>PEOPLE</span><span>IDEAS</span> CULTURE</div>
  <p className="visual-ai-disclosure">{consent?'Meta AI requested with consent; fallback remains available.':'No AI requested; composing an authored edition.'}</p>
 </section>
}

export function VisualReader({edition,pool,headingRef,onStory,onCollect,onRefine,onCollection}: {edition:EditorialEdition;pool:readonly CatalogItem[];headingRef:RefObject<HTMLHeadingElement|null>;onStory:(ad:CatalogItem,thread?:{detail:string;relationship:string})=>void;onCollect:(ad:CatalogItem)=>void;onRefine:()=>void;onCollection:()=>void}) {
 const features=edition.plan.features.flatMap(feature=>{const ad=pool.find(a=>a.id===feature.catalogId&&a.image.id===feature.assetId);return ad?[{feature,ad}]:[]})
 const [chairOpen,setChairOpen]=useState(false)
 useEffect(()=>{headingRef.current?.focus()},[headingRef])
 if(!features.length)return null
 const object=chairDemo.discoverableObjects[0]
 return <><section className="visual-stage visual-reader" aria-label="Read and explore" data-asset-id={chairDemo.image.id}>
  <header className="visual-stage-label"><span>03</span><div>Read &amp; Explore<small>Tap a detail to discover more</small></div></header>
  <div className="visual-reader-intro"><span>Objects · fictional demo</span><h2 ref={headingRef} tabIndex={-1}>The Lounge Chair</h2><p>A rounded seat and enveloping back shape how this photographed corner feels. Maker and materials remain unverified.</p></div>
  <div className="visual-reader-back-photo"><img src={media('read/16_read_chair.png')} alt={chairDemo.image.alt}/><button className="chair-demo-hotspot" type="button" style={{left:`${chairDemoDetails.hotspot.x*100}%`,top:`${chairDemoDetails.hotspot.y*100}%`}} aria-label="Explore rounded chair in photograph (manually annotated)" aria-expanded={chairOpen} aria-controls="chair-demo-detail" onClick={()=>setChairOpen(value=>!value)}><span aria-hidden="true">＋</span></button></div>
  <aside className="visual-reader-context"><span>Visual detail</span><strong>{object.label}</strong><img src={media('read/12_boucle_fabric_detail.png')} alt="Owner-provided close-up of fabric"/><small>Photograph only; material identity is unverified.</small></aside>
  <div className="visual-reader-photo-rail" aria-label="Related editorial images"><img src={media('read/08_ochre_lounge_chair.png')} alt="Sculptural chair study"/><img src={media('read/17_read_soft_furnishing.png')} alt="Soft furnishing study"/><img src={media('read/18_read_portrait.png')} alt="Portrait study"/></div>
  {chairOpen&&<aside className="chair-demo-detail" id="chair-demo-detail" aria-label="Fictional chair details"><button className="chair-demo-close" type="button" onClick={()=>setChairOpen(false)} aria-label="Close chair details">×</button><span>FICTIONAL DEMO PRODUCT · HOME</span><h3>{chairDemo.name}</h3><p>Curio Fictional Studio · unverified</p><p>{object.description}</p><p className="chair-demo-price">Demo price: $1,850 USD · fictional, not for sale</p><ul>{chairDemoDetails.assumptions.map(a=><li key={a}>{a}</li>)}</ul><small>Manually authored hotspot · no SAM inference. Material and specifications unverified.</small><button type="button" onClick={()=>onStory(chairDemo,{detail:object.label,relationship:'rounded silhouette and spatial comfort'})}>Explore related story →</button><button type="button" onClick={()=>onCollect(chairDemo)}>Collect this image</button></aside>}
  <div className="visual-reader-caption"><strong>{chairDemo.name}</strong><small>Curio Fictional Studio · demo concept</small><p>{chairDemo.description}</p><button onClick={()=>onStory(chairDemo,{detail:object.label,relationship:'rounded silhouette and spatial comfort'})} aria-label={`Open ${chairDemo.name} story`}>→</button></div>
  <nav className="visual-reader-pages" aria-label="Edition stories">{features.map(({ad:next},i)=><button key={next.image.id} aria-label={`Open edition story ${i+1}: ${next.name}`} onClick={()=>onStory(next)}><span>{String(i+1).padStart(2,'0')}</span><CatalogImage ad={next}/></button>)}</nav>
  <span className="visual-reader-count">VISUAL DEMO / {String(features.length).padStart(2,'0')} EDITION STORIES</span>
  <button className="visual-reader-related" onClick={()=>onStory(chairDemo)}>RELATED<br/>STORIES <span>→</span></button>
 </section><div className="visual-stage-controls"><p>{edition.source==='meta'?'Validated Meta editorial plan':'Curio-authored edition · AI not used'} · {edition.plan.title} · Chair is a separate fictional visual demo</p><button onClick={()=>onCollect(chairDemo)}>Collect image</button><button onClick={onCollection}>Your collection</button><button onClick={onRefine}>Refine with a new prompt</button></div></>
}

export function VisualJourney({story,related,topic,onRelated,onFollow,onCollect}: {story:CatalogItem;related:readonly CatalogItem[];topic:string;onRelated:(ad:CatalogItem)=>void;onFollow:(theme:string)=>void;onCollect:()=>void}) {
 const branches=related.slice(0,2)
 const themes=[...story.discoverableObjects.map(o=>o.label),...story.lifestyleTags].slice(0,5)
 return <section className="visual-stage visual-journey" aria-label="Curiosity Journey">
  <header className="visual-stage-label"><span>04</span><div>Curiosity Journey<small>Explore connections across objects, places, people and ideas</small></div></header>
  <svg className="journey-orbits" viewBox="0 0 853 475" aria-hidden="true"><ellipse cx="407" cy="257" rx="333" ry="125"/><ellipse cx="406" cy="257" rx="260" ry="175" transform="rotate(-17 406 257)"/><path d="M52 221C158 127 286 139 423 242S663 336 765 158M82 351C282 225 504 214 773 342"/></svg>
  <article className="journey-center"><CatalogImage ad={story} eager/><div><strong>{story.name}</strong><small>{story.provenance.attribution}</small></div></article>
  <div className="journey-plane journey-people"><img src={media('journey/06_coffee_ritual.png')} alt="Owner-provided coffee ritual image"/><span>Rituals</span></div>
  <div className="journey-plane journey-place"><img src={media('journey/09_coastal_architecture.png')} alt="Owner-provided coastal architecture image"/><span>Places</span></div>
  <div className="journey-plane journey-arch"><img src={media('journey/19_journey_arched_space.png')} alt="Arched space study"/><span>Spaces</span></div>
  <div className="journey-plane journey-room"><img src={media('journey/20_journey_living_room.png')} alt="Living room study"/><span>Rooms</span></div>
  <div className="journey-plane journey-objects"><img src={media('journey/21_journey_objects.png')} alt="Object still life"/><span>Objects</span></div>
  <div className="journey-plane journey-coast"><img src={media('journey/22_journey_coastal_room.png')} alt="Coastal room study"/><span>Places</span></div>
  {branches.map((ad,i)=><button className={`journey-related journey-related-${i}`} key={ad.image.id} onClick={()=>onRelated(ad)}><CatalogImage ad={ad}/><span>{ad.name} →</span></button>)}
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
