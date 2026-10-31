import {useEffect,useRef,useState} from 'react'
import {PublicApp} from '../App'
import {SilverField,webglAvailable} from './SilverField'
import {CameraRig} from './CameraRig'
import {ExhibitMounts} from './ExhibitMounts'
import {HudBridge} from './HudBridge'
import {loadCatalogNodes} from './nodes'
import type {CatalogNode} from './contracts'
import {fetchEdition} from './edition'
import {stageEdition,type StagedExhibit} from './staging'
import {exhibitLayout} from './camera-math'
import {SPATIAL_SESSION_KEY,clearSpatialSession} from './clear'
import type {NodeSource} from './nodes'
import './spatial.css'

type DebugSnapshot={distance:number;cameraZ:number;current:number;exhibits:number;nodes:number;source:NodeSource|'pending'}
type Inspect={assetId:string;hotspotId?:string}

// Phase 1: prompt -> validated edition -> staged promenade with lateral
// rails and inspect panels. Assembly particles arrive in Phase 2.
export default function SpatialApp(){
  const [supported]=useState(()=>webglAvailable())
  const [nodes,setNodes]=useState<CatalogNode[]>([])
  const [source,setSource]=useState<NodeSource|'pending'>('pending')
  const [prompt,setPrompt]=useState('')
  const [status,setStatus]=useState('')
  const [cleared,setCleared]=useState<string[]|null>(null)
  const [entered,setEntered]=useState(false)
  const [exhibits,setExhibits]=useState<StagedExhibit[]>([])
  const [editionLabel,setEditionLabel]=useState<'meta'|'authored-fallback'|null>(null)
  const [composing,setComposing]=useState(false)
  const [showDock,setShowDock]=useState(true)
  const [current,setCurrent]=useState(-1)
  const [inspect,setInspect]=useState<Inspect|null>(null)
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const reduced=useRef(false)
  const bridgeRef=useRef<HudBridge|null>(null)
  if(!bridgeRef.current)bridgeRef.current=new HudBridge()
  const rigRef=useRef<CameraRig|null>(null)
  const mountsRef=useRef<ExhibitMounts|null>(null)
  const layoutRef=useRef(exhibitLayout(0))
  const exhibitsRef=useRef(exhibits)
  exhibitsRef.current=exhibits
  const currentRef=useRef(current)
  currentRef.current=current
  const nodesRef=useRef(nodes)
  nodesRef.current=nodes
  const sourceRef=useRef(source)
  sourceRef.current=source

  useEffect(()=>{
    if(!supported)return
    const canvas=canvasRef.current
    if(!canvas)return
    reduced.current=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false
    const field=new SilverField(canvas)
    const path=CameraRig.originPath()
    const rig=new CameraRig({waypoints:path.waypoints,docks:[],reducedMotion:reduced.current},window.innerWidth/window.innerHeight)
    rigRef.current=rig
    const mounts=new ExhibitMounts(field.scene)
    mountsRef.current=mounts
    void loadCatalogNodes().then(({nodes:loaded,source:loadedSource})=>{setNodes(loaded);setSource(loadedSource)})
    const readScroll=()=>{
      const maxScroll=document.documentElement.scrollHeight-window.innerHeight
      rig.setScroll(window.scrollY,maxScroll,layoutRef.current.pathLength)
    }
    readScroll()
    window.addEventListener('scroll',readScroll,{passive:true})
    const resize=()=>{
      field.resize(window.innerWidth,window.innerHeight)
      rig.resize(window.innerWidth/window.innerHeight)
      readScroll()
    }
    resize()
    window.addEventListener('resize',resize)
    let down:{x:number;y:number}|null=null
    const onDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY}}
    const onUp=(event:PointerEvent)=>{
      if(!down)return
      const moved=Math.hypot(event.clientX-down.x,event.clientY-down.y)
      down=null
      if(moved>6)return
      const rect=canvas.getBoundingClientRect()
      const pick=mounts.pick(event.clientX,event.clientY,rig.camera,rect)
      if(!pick)return
      bridgeRef.current!.emit({type:'pick',assetId:pick.assetId})
      setInspect({assetId:pick.assetId,hotspotId:pick.hotspotId})
    }
    canvas.addEventListener('pointerdown',onDown)
    canvas.addEventListener('pointerup',onUp)
    let frame=0,last=performance.now(),alive=true
    const loop=(now:number)=>{
      if(!alive)return
      const dt=Math.min((now-last)/1000,0.1)
      last=now
      rig.update(dt)
      mounts.update(now/1000,reduced.current)
      field.update(dt,reduced.current)
      field.render(rig.camera)
      const nearest=rig.state.nearest
      if(nearest!==currentRef.current)setCurrent(nearest)
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    ;(window as unknown as {__spatial?:()=>DebugSnapshot}).__spatial=()=>({
      distance:rig.state.distance,cameraZ:rig.state.cameraZ,current:currentRef.current,
      exhibits:exhibitsRef.current.length,nodes:nodesRef.current.length,source:sourceRef.current,
    })
    return ()=>{
      alive=false
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll',readScroll)
      window.removeEventListener('resize',resize)
      canvas.removeEventListener('pointerdown',onDown)
      canvas.removeEventListener('pointerup',onUp)
      mounts.dispose()
      field.dispose()
      rigRef.current=null
      mountsRef.current=null
      delete (window as unknown as {__spatial?:unknown}).__spatial
    }
  },[supported])

  useEffect(()=>{
    // Stage the promenade path whenever exhibits arrive.
    const rig=rigRef.current,mounts=mountsRef.current
    if(!rig||!mounts)return
    const layout=exhibitLayout(exhibits.length)
    layoutRef.current=layout
    rig.setPath(layout.waypoints,layout.docks)
    mounts.setExhibits(exhibits,layout.mounts)
  },[exhibits])

  useEffect(()=>{
    // Inspection dollies the camera toward the picked mount.
    const rig=rigRef.current
    if(!rig)return
    if(!inspect){rig.setFocus(null);return}
    const index=exhibitsRef.current.findIndex(e=>e.assetId===inspect.assetId)
    if(index<0){rig.setFocus(null);return}
    rig.setFocus({dock:layoutRef.current.docks[index],mountX:layoutRef.current.mounts[index].x,mountZ:layoutRef.current.mounts[index].z})
  },[inspect])

  useEffect(()=>{
    if(entered||!supported)return
    const dock=()=>setEntered(true)
    window.addEventListener('pointerdown',dock,{once:true})
    window.addEventListener('keydown',dock,{once:true})
    window.addEventListener('wheel',dock,{once:true,passive:true})
    return ()=>{
      window.removeEventListener('pointerdown',dock)
      window.removeEventListener('keydown',dock)
      window.removeEventListener('wheel',dock)
    }
  },[entered,supported])

  useEffect(()=>{
    if(!inspect)return
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setInspect(null)}
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[inspect])

  if(!supported){
    return <div className="spatial-fallback">
      <p role="status">The 3D exhibition needs WebGL, which this browser has disabled. The full 2D edition follows.</p>
      <PublicApp/>
    </div>
  }

  const submit=async(event:React.FormEvent)=>{
    event.preventDefault()
    const trimmed=prompt.trim()
    if(!trimmed||composing)return
    setComposing(true)
    setCleared(null)
    setStatus('Composing your exhibition…')
    try{
      sessionStorage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:1,prompt:trimmed.slice(0,1000),startedAt:Date.now()}))
    }catch{/* Private browsing keeps the visit in memory only. */}
    bridgeRef.current!.emit({type:'prompt',prompt:trimmed})
    const {edition,honest}=await fetchEdition(trimmed)
    const {exhibits:staged,skipped}=stageEdition(edition)
    setComposing(false)
    if(!staged.length){
      setStatus('No stageable exhibits right now. Refine your curiosity and try again.')
      return
    }
    setExhibits(staged)
    setEditionLabel(honest)
    setShowDock(false)
    setStatus(skipped?`${skipped} feature${skipped===1?'':'s'} referenced unavailable imagery and ${skipped===1?'was':'were'} left out.`:'')
  }

  const clear=()=>{
    const {removed}=clearSpatialSession({localStorage,sessionStorage})
    setCleared(removed)
    setPrompt('')
    setStatus('')
    setExhibits([])
    setEditionLabel(null)
    setInspect(null)
    setShowDock(true)
    bridgeRef.current!.emit({type:'clear',removed})
    window.scrollTo({top:0,behavior:reduced.current?'auto':'smooth'})
  }

  const reopen=()=>{
    setShowDock(true)
    setInspect(null)
    window.scrollTo({top:0,behavior:reduced.current?'auto':'smooth'})
  }

  const staged=exhibits.length>0
  const active=current>=0?exhibits[current]:null
  const inspected=inspect?exhibits.find(e=>e.assetId===inspect.assetId)??null:null
  const inspectedHotspot=inspected?.hotspots.find(h=>h.id===inspect?.hotspotId)??inspected?.hotspots[0]
  const sourceLabel=nodes.length?`${nodes.length} records (${source==='endpoint'?'live catalog':'local manifest'})`:'loading…'
  return <main className="spatial-root" aria-label="Curio spatial exhibition">
    <a className="spatial-skip" href="#spatial-index">Skip to exhibit list</a>
    <canvas ref={canvasRef} className="spatial-canvas" aria-hidden="true"/>
    <div className="spatial-vignette" aria-hidden="true"/>
    <header className="spatial-hud">
      <a className="spatial-brand" href="/" aria-label="Curio home">curio<span>.</span></a>
      <nav className="spatial-crumb" aria-label="Journey" aria-live="polite">
        {staged&&active?`Exhibit ${current+1} of ${exhibits.length} · ${active.title}`:staged?'Your exhibition':'Discover · Silver Field'}
      </nav>
      <div className="spatial-actions">
        {staged&&<button type="button" onClick={reopen}>New prompt</button>}
        <a href="/">2D edition</a>
        <button type="button" onClick={clear}>Clear</button>
      </div>
    </header>
    {editionLabel==='authored-fallback'&&<p className="spatial-chip" role="note">Curio-authored edition · AI not used</p>}
    {showDock&&<section className={`spatial-dock${entered?' is-docked':''}`} aria-labelledby="spatial-prompt-heading">
      <p className="spatial-eyebrow">01 · Discover</p>
      <h1 id="spatial-prompt-heading">What are you curious about?</h1>
      <form onSubmit={submit}>
        <label className="spatial-sr" htmlFor="spatial-prompt">Your curiosity</label>
        <textarea id="spatial-prompt" rows={2} maxLength={1000} value={prompt}
          placeholder="A quiet room, a bold garment, an unfamiliar coast…"
          onChange={event=>setPrompt(event.target.value)}/>
        <button type="submit" disabled={!prompt.trim()||composing}>{composing?'Composing…':'Begin exploration →'}</button>
      </form>
      {status&&<p role="status" className="spatial-status">{status}</p>}
      {cleared&&<p role="status" className="spatial-status">
        Visit cleared from this browser{cleared.length?`: ${cleared.join(', ')}`:'. Nothing was stored.'} Server data handling: pending confirmation.
      </p>}
    </section>}
    {active&&!inspect&&<section className="spatial-rail" aria-label={`Contents of ${active.title}`}>
      <article className="spatial-rail-card">
        <p className="spatial-eyebrow">Story</p>
        <h2>{active.title}</h2>
        <p>{active.narrative}</p>
        <button type="button" onClick={()=>setInspect({assetId:active.assetId})}>Inspect exhibit →</button>
      </article>
      <article className="spatial-rail-card">
        <p className="spatial-eyebrow">Visual detail</p>
        {active.hotspots.length
          ?<ul>{active.hotspots.map(h=><li key={h.id}><button type="button" onClick={()=>setInspect({assetId:active.assetId,hotspotId:h.id})}>{h.label} →</button></li>)}</ul>
          :<p>No annotated details on this study.</p>}
      </article>
      <article className="spatial-rail-card">
        <p className="spatial-eyebrow">Attribution</p>
        <p>{active.attribution}</p>
        <p className="spatial-fine">{active.rights}</p>
      </article>
      <article className="spatial-rail-card">
        <p className="spatial-eyebrow">Thread onward</p>
        <p>{active.thread??'The next exhibit continues the promenade.'}</p>
      </article>
    </section>}
    {inspected&&<aside className="spatial-inspect" aria-label={`Inspecting ${inspected.title}`}>
      <button type="button" className="spatial-inspect-close" onClick={()=>setInspect(null)} aria-label="Close inspection">×</button>
      <p className="spatial-eyebrow">Inspection</p>
      <h2>{inspectedHotspot?.productName??inspected.title}</h2>
      {inspectedHotspot
        ?<><p>{inspectedHotspot.brandName} · unverified · fictional, not for sale</p>
          <p className="spatial-fine">Demo price: ${inspectedHotspot.priceUsd.toLocaleString('en-US')} USD</p>
          <ul>{inspectedHotspot.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
          <p className="spatial-fine">Manually authored hotspot · no SAM inference. Material and specifications unverified.</p></>
        :<><p>{inspected.narrative}</p><p className="spatial-fine">{inspected.attribution}</p></>}
    </aside>}
    <div className="spatial-scroll-proxy" style={staged?{height:`${140+exhibits.length*90}vh`}:undefined} aria-hidden="true"/>
    <section id="spatial-index" className="spatial-index" aria-labelledby="spatial-index-heading">
      <p className="spatial-eyebrow">Exhibit index</p>
      <h2 id="spatial-index-heading">Every exhibit, one list</h2>
      <p className="spatial-source">Catalog: {sourceLabel}</p>
      <ul>{nodes.map(node=><li key={node.assetId}>
        <img src={node.thumbnail} alt="" loading="lazy" width={72} height={72}/>
        <div><strong>{node.label}</strong><span>{node.kind} · {node.assetId}</span></div>
      </li>)}</ul>
    </section>
  </main>
}
