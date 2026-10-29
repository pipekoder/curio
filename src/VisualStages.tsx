import {useEffect,useState,type RefObject} from 'react'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialEdition} from '../shared/editorial'
import LivingAdvertisement from './LivingAdvertisement'
import CatalogImage from './CatalogImage'

const media=(file:string)=>`/editorial/${file}`

/** The request has started. No synthetic percentage or provisional model text is shown. */
export function VisualGenerate({prompt,consent}: {prompt:string;consent:boolean}) {
 return <section className="visual-stage visual-generate" aria-label="Composing your magazine" aria-busy="true">
  <header className="visual-stage-label"><span>02</span><div>Generate<small>Composing your personalized magazine</small></div></header>
  <span className="visual-stage-brand">curio.</span>
  <div className="visual-pending" role="status">Composing your magazine…<i aria-hidden="true"/></div>
  <svg className="visual-stage-orbits" viewBox="0 0 451 543" aria-hidden="true"><ellipse cx="225" cy="431" rx="195" ry="38"/><ellipse cx="225" cy="431" rx="157" ry="27"/><circle cx="225" cy="431" r="112"/></svg>
  <div className="visual-gen-plane gen-plane-left"><img src={media('generate/03_arched_interior.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-back"><img src={media('generate/07_sculptural_living_room.png')} alt=""/></div>
  <div className="visual-gen-plane gen-plane-right" aria-hidden="true"/>
  <div className="visual-gen-cover"><small>CURIO / PERSONAL EDITION</small><strong>Your<br/>next issue</strong><p>{prompt}</p><span>COMPOSING</span></div>
  <div className="visual-gen-categories" aria-hidden="true">OBJECTS <span>SPACES</span><span>PEOPLE</span><span>IDEAS</span> CULTURE</div>
  <p className="visual-ai-disclosure">{consent?'Meta AI requested with consent; fallback remains available.':'No AI requested; composing an authored edition.'}</p>
 </section>
}

export function VisualReader({edition,pool,headingRef,onStory,onCollect,onRefine,onCollection}: {edition:EditorialEdition;pool:readonly CatalogItem[];headingRef:RefObject<HTMLHeadingElement|null>;onStory:(ad:CatalogItem,thread?:{detail:string;relationship:string})=>void;onCollect:(ad:CatalogItem)=>void;onRefine:()=>void;onCollection:()=>void}) {
 const features=edition.plan.features.flatMap(feature=>{const ad=pool.find(a=>a.id===feature.catalogId&&a.image.id===feature.assetId);return ad?[{feature,ad}]:[]})
 const [selected,setSelected]=useState<string|null>(null)
 const [detail,setDetail]=useState<string|null>(null)
 const current=features.find(({ad})=>ad.image.id===selected)??features[0]
 useEffect(()=>{headingRef.current?.focus()},[selected,headingRef])
 if(!current)return null
 const {ad,feature}=current
 const object=ad.discoverableObjects.find(o=>o.id===detail)??ad.discoverableObjects[0]
 return <><section className="visual-stage visual-reader" aria-label="Read and explore" data-asset-id={ad.image.id}>
  <header className="visual-stage-label"><span>03</span><div>Read &amp; Explore<small>Tap a detail to discover more</small></div></header>
  <div className="visual-reader-intro"><span>{ad.category==='home'?'Objects':ad.category==='travel'?'Places':'Style'}</span><h2 ref={headingRef} tabIndex={-1}>{feature.headline}</h2><p>{feature.narrative}</p></div>
  <div className="visual-reader-back-photo"><img src={media('read/08_ochre_lounge_chair.png')} alt="Owner-provided editorial photograph of a sculptural chair"/></div>
  <div className="visual-reader-image"><LivingAdvertisement key={ad.image.id} ad={ad} eager onExploreStory={(next,subject,relationship)=>onStory(next,{detail:subject,relationship})}/></div>
  <aside className="visual-reader-context"><span>Visual detail</span><strong>{object?.label??'Look closer'}</strong><img src={media('read/12_boucle_fabric_detail.png')} alt="Owner-provided close-up of fabric"/><small>Photograph only; material identity is unverified.</small></aside>
  <div className="visual-reader-details" role="group" aria-label="Explore annotated details">{ad.discoverableObjects.map(o=><button key={o.id} aria-pressed={detail===o.id} onClick={()=>setDetail(o.id)}>{o.label}</button>)}</div>
  <div className="visual-reader-caption"><strong>{ad.name}</strong><small>{ad.provenance.attribution}</small><p>{detail&&object?object.description:ad.description}</p><button onClick={()=>onStory(ad)} aria-label={`Open ${ad.name} story`}>→</button></div>
  <nav className="visual-reader-pages" aria-label="Edition pages">{features.map(({ad:next},i)=><button key={next.image.id} aria-current={ad.image.id===next.image.id?'page':undefined} onClick={()=>{setSelected(next.image.id);setDetail(null)}}><span>{String(i+1).padStart(2,'0')}</span><CatalogImage ad={next}/></button>)}</nav>
  <span className="visual-reader-count">{String(features.indexOf(current)+1).padStart(2,'0')} / {String(features.length).padStart(2,'0')}</span>
  <button className="visual-reader-related" onClick={()=>onStory(ad)}>RELATED<br/>STORIES <span>→</span></button>
 </section><div className="visual-stage-controls"><p>{edition.source==='meta'?'Validated Meta editorial plan':'Curio-authored edition · AI not used'} · {edition.plan.title}</p><button onClick={()=>onCollect(ad)}>Collect image</button><button onClick={onCollection}>Your collection</button><button onClick={onRefine}>Refine with a new prompt</button></div></>
}

export function VisualJourney({story,related,topic,onRelated,onFollow,onCollect}: {story:CatalogItem;related:readonly CatalogItem[];topic:string;onRelated:(ad:CatalogItem)=>void;onFollow:(theme:string)=>void;onCollect:()=>void}) {
 const branches=related.slice(0,2)
 const themes=[...story.discoverableObjects.map(o=>o.label),...story.lifestyleTags].slice(0,5)
 return <section className="visual-stage visual-journey" aria-label="Curiosity Journey">
  <header className="visual-stage-label"><span>04</span><div>Curiosity Journey<small>Explore connections across objects, places, people and ideas</small></div></header>
  <svg className="journey-orbits" viewBox="0 0 853 475" aria-hidden="true"><ellipse cx="407" cy="257" rx="333" ry="125"/><ellipse cx="406" cy="257" rx="260" ry="175" transform="rotate(-17 406 257)"/><path d="M52 221C158 127 286 139 423 242S663 336 765 158M82 351C282 225 504 214 773 342"/></svg>
  <article className="journey-center"><CatalogImage ad={story} eager/><div><strong>{story.name}</strong><small>{story.provenance.attribution}</small></div></article>
  <div className="journey-plane journey-people"><img src={media('journey/06_coffee_ritual.png')} alt="Owner-provided coffee ritual photograph"/><span>Rituals</span></div>
  <div className="journey-plane journey-place"><img src={media('journey/09_coastal_architecture.png')} alt="Owner-provided coastal architecture photograph"/><span>Places</span></div>
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
  <div className="collect-plane collect-back"><img src={media('collect/04_limestone_texture.png')} alt="Owner-provided limestone texture photograph"/></div>
  {current&&<div className="collect-plane collect-front"><CatalogImage ad={current}/><div><strong>{current.name}</strong><small>{current.provenance.attribution}</small><button onClick={onOpen}>Revisit</button><button onClick={onRemove}>Remove</button></div></div>}
  <div className="collect-axis" aria-hidden="true">ALL · PLACES · OBJECTS · BRANDS · IDEAS · PEOPLE</div>
 </section>
}
