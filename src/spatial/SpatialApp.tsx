import {useEffect,useRef,useState} from 'react'
import {PublicApp} from '../App'
import {SilverField,webglAvailable} from './SilverField'
import {CameraRig} from './CameraRig'
import {HudBridge} from './HudBridge'
import {loadCatalogNodes} from './nodes'
import type {CatalogNode} from './contracts'
import {SPATIAL_SESSION_KEY,clearSpatialSession} from './clear'
import type {NodeSource} from './nodes'
import './spatial.css'

type DebugSnapshot={distance:number;cameraZ:number;nodes:number;source:NodeSource|'pending'}

// Phase 0: silver field shell, prompt dock, HUD chrome, list mirror, Clear.
// Exhibit mounts, assembly, and the network chamber arrive in later phases.
export default function SpatialApp(){
  const [supported]=useState(()=>webglAvailable())
  const [nodes,setNodes]=useState<CatalogNode[]>([])
  const [source,setSource]=useState<NodeSource|'pending'>('pending')
  const [prompt,setPrompt]=useState('')
  const [status,setStatus]=useState('')
  const [cleared,setCleared]=useState<string[]|null>(null)
  const [entered,setEntered]=useState(false)
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const reduced=useRef(false)
  const bridgeRef=useRef<HudBridge|null>(null)
  if(!bridgeRef.current)bridgeRef.current=new HudBridge()
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
    void loadCatalogNodes().then(({nodes:loaded,source:loadedSource})=>{setNodes(loaded);setSource(loadedSource)})
    const readScroll=()=>{
      const maxScroll=document.documentElement.scrollHeight-window.innerHeight
      rig.setScroll(window.scrollY,maxScroll,path.pathLength,performance.now())
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
    let frame=0,last=performance.now(),alive=true
    const loop=(now:number)=>{
      if(!alive)return
      const dt=Math.min((now-last)/1000,0.1)
      last=now
      rig.update(dt,now)
      field.update(dt,reduced.current)
      field.render(rig.camera)
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    ;(window as unknown as {__spatial?:()=>DebugSnapshot}).__spatial=()=>({
      distance:rig.state.distance,cameraZ:rig.state.cameraZ,nodes:nodesRef.current.length,source:sourceRef.current,
    })
    return ()=>{
      alive=false
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll',readScroll)
      window.removeEventListener('resize',resize)
      field.dispose()
      delete (window as unknown as {__spatial?:unknown}).__spatial
    }
  },[supported])

  useEffect(()=>{
    // The entrance is advisory: first input docks the panel immediately.
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

  if(!supported){
    return <div className="spatial-fallback">
      <p role="status">The 3D exhibition needs WebGL, which this browser has disabled. The full 2D edition follows.</p>
      <PublicApp/>
    </div>
  }

  const submit=(event:React.FormEvent)=>{
    event.preventDefault()
    const trimmed=prompt.trim()
    if(!trimmed)return
    try{
      sessionStorage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:1,prompt:trimmed.slice(0,1000),startedAt:Date.now()}))
    }catch{/* Private browsing keeps the visit in memory only. */}
    bridgeRef.current!.emit({type:'prompt',prompt:trimmed})
    setStatus(`Curiosity noted: “${trimmed.slice(0,80)}”. The promenade opens in Phase 1.`)
  }

  const clear=()=>{
    const {removed}=clearSpatialSession({localStorage,sessionStorage})
    setCleared(removed)
    setPrompt('')
    setStatus('')
    bridgeRef.current!.emit({type:'clear',removed})
    window.scrollTo({top:0,behavior:reduced.current?'auto':'smooth'})
  }

  const sourceLabel=nodes.length?`${nodes.length} records (${source==='endpoint'?'live catalog':'local manifest'})`:'loading…'
  return <main className="spatial-root" aria-label="Curio spatial exhibition">
    <a className="spatial-skip" href="#spatial-index">Skip to exhibit list</a>
    <canvas ref={canvasRef} className="spatial-canvas" aria-hidden="true"/>
    <div className="spatial-vignette" aria-hidden="true"/>
    <header className="spatial-hud">
      <a className="spatial-brand" href="/" aria-label="Curio home">curio<span>.</span></a>
      <nav className="spatial-crumb" aria-label="Journey">Discover · Silver Field</nav>
      <div className="spatial-actions">
        <a href="/">2D edition</a>
        <button type="button" onClick={clear}>Clear</button>
      </div>
    </header>
    <section className={`spatial-dock${entered?' is-docked':''}`} aria-labelledby="spatial-prompt-heading">
      <p className="spatial-eyebrow">01 · Discover</p>
      <h1 id="spatial-prompt-heading">What are you curious about?</h1>
      <form onSubmit={submit}>
        <label className="spatial-sr" htmlFor="spatial-prompt">Your curiosity</label>
        <textarea id="spatial-prompt" rows={2} maxLength={1000} value={prompt}
          placeholder="A quiet room, a bold garment, an unfamiliar coast…"
          onChange={event=>setPrompt(event.target.value)}/>
        <button type="submit" disabled={!prompt.trim()}>Begin exploration →</button>
      </form>
      {status&&<p role="status" className="spatial-status">{status}</p>}
      {cleared&&<p role="status" className="spatial-status">
        Visit cleared from this browser{cleared.length?`: ${cleared.join(', ')}`:'. Nothing was stored.'} Server data handling: pending confirmation.
      </p>}
    </section>
    <div className="spatial-scroll-proxy" aria-hidden="true"/>
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
