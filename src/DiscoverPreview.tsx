import {type RefObject} from 'react'
import {editorialPrompt} from '../shared/editorial-intent'

export function DiscoverPreview({prompt,consent,busy,error,promptRef,onPrompt,onConsent,onSubmit,onCollection}: {
 prompt:string;consent:boolean;busy:boolean;error:string;promptRef:RefObject<HTMLTextAreaElement|null>;
 onPrompt:(value:string)=>void;onConsent:(value:boolean)=>void;onSubmit:()=>void;onCollection:()=>void;
}){
 const suggestions=['Quiet luxury fashion','Modern ceramic design','Coffee culture in Tokyo','Scandinavian winter escapes']
 return <><section className="reference-discover reference-canvas" data-input={prompt.trim()?'typing':'empty'} aria-labelledby="personal-edition">
  <header className="reference-stage-label"><span>01</span><div>Discovery entry<small>A simple and beautiful beginning</small></div></header>
  <svg className="reference-orbits" viewBox="0 0 573 543" aria-hidden="true">
   <g fill="none" stroke="#b5bac8" strokeWidth=".35">
    <ellipse cx="285" cy="260" rx="250" ry="161" transform="rotate(14 285 260)"/><ellipse cx="285" cy="260" rx="249" ry="163" transform="rotate(-15 285 260)"/>
    <ellipse cx="285" cy="260" rx="247" ry="165" transform="rotate(-27 285 260)"/><ellipse cx="285" cy="260" rx="222" ry="151" transform="rotate(22 285 260)"/>
    <path d="M58 161C133 56 366 62 506 158M87 431C236 482 482 422 516 297M100 112C-13 235 96 438 358 438M174 150C90 295 274 449 473 376"/>
   </g>
   <g fill="#606575">{[[103,91],[154,238],[391,76],[508,77],[422,380],[203,412],[78,102],[360,86],[383,443]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===3||i===5?2.8:1.1}/>)}</g>
   <g fill="#777b83" fontSize="6" letterSpacing="1.1"><text x="17" y="279">DESIGN</text><text x="518" y="153">PEOPLE</text><text x="516" y="215">BRANDS</text><text x="38" y="386">PEOPLE</text><text x="480" y="433">CULTURE</text><text x="360" y="104" transform="rotate(8 360 104)">PLACES</text></g>
  </svg>
  <div className="reference-photo-planes" aria-hidden="true">{['01_boucle_lounge_chair.png','10_winter_coast.png','02_ceramic_vase.png','11_stone_still_life.png','05_designer_portrait.png'].map((file,i)=><div key={file} className={`reference-photo reference-photo-${i}`} data-photo-slot={i+1}><img src={`/editorial/discover/${file}`} alt="" /></div>)}</div>
  <div className="reference-wordmark"><span className="sr-only">curio.</span><svg viewBox="0 0 112 40" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M19 14C6 7 1 31 14 32L20 29M29 13V24C29 35 45 35 45 24V13M55 32V13M55 21C57 14 62 11 67 13M75 13V32"/><ellipse cx="94" cy="23" rx="9" ry="10"/></g><circle cx="75" cy="6" r="1.2"/><circle cx="109" cy="32" r="1.2"/></svg></div>
  <h1 id="personal-edition">What are you<br/>curious about?</h1>
  <div className="reference-sphere" aria-hidden="true"><i/></div>
  <form className="reference-prompt" onSubmit={event=>{event.preventDefault();onSubmit()}} aria-busy={busy}>
   <label className="sr-only" htmlFor="discovery-prompt">Your discovery prompt</label>
   <textarea id="discovery-prompt" ref={promptRef} rows={1} maxLength={1000} placeholder="A place, a feeling, a design, a brand…" value={prompt} disabled={busy} onChange={e=>onPrompt(e.target.value)} aria-invalid={Boolean(error)} aria-describedby="reference-consent-note" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}/>
   <button className="reference-submit" type="submit" aria-label={busy?'Composing your issue…':'Generate magazine'} disabled={busy||!editorialPrompt.safeParse({prompt,consent}).success}><span aria-hidden="true">→</span></button>
  </form>
  <div className="reference-suggestions" role="group" aria-label="Prompt inspiration">{suggestions.map(value=><button key={value} disabled={busy} onClick={()=>{onPrompt(value);promptRef.current?.focus()}}>{value}</button>)}</div>
 </section>
 <div className="reference-required-controls"><label id="reference-consent-note"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>onConsent(e.target.checked)}/> Use Meta AI for this prompt, if available. Optional; leave unchecked for an edition without AI.</label>
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Composing your issue… An authored fallback remains available.</p>}
 <p>Discover frontend review · owner-supplied editorial photographs · AI disabled in this preview.</p><button onClick={onCollection}>Your collection</button></div></>
}
