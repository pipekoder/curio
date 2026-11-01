import {useEffect,useRef,useState} from 'react'
import * as THREE from 'three'
import {SpatialFallback} from './fallback'
import {SilverField,webglAvailable} from './SilverField'
import {CameraRig} from './CameraRig'
import {ExhibitMounts} from './ExhibitMounts'
import {HudBridge} from './HudBridge'
import {loadCatalogNodes,revalidateVersions} from './nodes'
import type {CatalogNode} from './contracts'
import {editionStatusCopy,fetchEdition,type HonestState} from './edition'
import {stageEdition,type StagedExhibit} from './staging'
import {AssemblyDirector} from './assembly'
import {AssemblyField} from './AssemblyField'
import {exhibitLayout,splinePosition,type Waypoint} from './camera-math'
import {NETWORK_CENTER,ORBIT_DEFAULT,pickSurprise,orbitCamera} from './network-math'
import {NetworkChamber} from './NetworkChamber'
import {SPATIAL_SESSION_KEY,clearSpatialSession} from './clear'
import type {NodeSource} from './nodes'
import ObjectDiscovery from './ObjectDiscovery'
import './spatial.css'

type DebugSnapshot={distance:number;cameraZ:number;cameraY:number;current:number;exhibits:number;nodes:number;source:NodeSource|'pending';assembly:string;mode:string;orbit:{yaw:number;pitch:number;radius:number};selected:number;staged:string[];nodeIds:string[];honest:HonestState|null}
type Inspect={assetId:string;hotspotId?:string}
type Transit={t0:number;dur:number;fromPos:THREE.Vector3;fromLook:THREE.Vector3;toPos:THREE.Vector3;toLook:THREE.Vector3;onFrame?:(k:number)=>void;onDone:()=>void}

// Honest edition provenance, always visible once staged. A cached Meta plan
// is still a Meta result; a deterministic plan is never labeled as one,
// even when it was assembled from the verified D1 catalog.
const HONEST_COPY:Record<HonestState,string>={
  'meta':'AI-curated edition · Meta AI',
  'meta-cached':'AI-curated edition · Meta AI (cached)',
  'deterministic-d1':'Curio-authored edition · verified catalog',
  'deterministic-fictional':'Curio-authored edition · AI not used',
  'authored-fallback':'Curio-authored edition · AI not used',
}
const REASON_COPY:Record<string,string>={
  disabled:'AI disabled',consent_missing:'AI consent off',
  pilot_allowlist:'pilot unavailable',pilot_not_ready:'pilot unavailable',pilot_authorization:'pilot unavailable',
  configuration:'AI unavailable',analysis_permissions:'AI unavailable',budget:'AI budget reached',
  invalid_output:'AI output rejected',editorial_rejected:'AI output rejected',
}
type FlyTo=(toPos:[number,number,number],toLook:[number,number,number],dur:number,onDone:()=>void,onFrame?:(k:number)=>void)=>void

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
  const [editionLabel,setEditionLabel]=useState<HonestState|null>(null)
  const [fallbackReason,setFallbackReason]=useState<string|null>(null)
  // Explicit per-visit AI consent, default off, never persisted: a reload or
  // Clear returns to consent:false, and true is sent only from this checkbox.
  const [consent,setConsent]=useState(false)
  const [composing,setComposing]=useState(false)
  const [showDock,setShowDock]=useState(true)
  const [current,setCurrent]=useState(-1)
  const [inspect,setInspect]=useState<Inspect|null>(null)
  const [elapsed,setElapsed]=useState(0)
  const [mode,setMode]=useState<'promenade'|'network'>('promenade')
  const [selected,setSelected]=useState(-1)
  const [announce,setAnnounce]=useState('')
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const reduced=useRef(false)
  const bridgeRef=useRef<HudBridge|null>(null)
  if(!bridgeRef.current)bridgeRef.current=new HudBridge()
  const rigRef=useRef<CameraRig|null>(null)
  const mountsRef=useRef<ExhibitMounts|null>(null)
  const fieldRef=useRef<SilverField|null>(null)
  const directorRef=useRef(new AssemblyDirector())
  const assemblyRef=useRef<AssemblyField|null>(null)
  const stagedRef=useRef<{exhibits:StagedExhibit[];label:HonestState;skipped:number;reason?:string;timedOut:boolean}|null>(null)
  // True cancellation for the edition request: a new submit or Clear aborts
  // the in-flight fetch instead of leaving it to run out the 90s bound. The
  // submit-ID guard still ignores any response that slips through the race.
  const fetchAbortRef=useRef<AbortController|null>(null)
  const resolveFiredRef=useRef(false)
  const lastPhaseRef=useRef('idle')
  const tickerRef=useRef(0)
  const submitIdRef=useRef(0)
  const layoutRef=useRef(exhibitLayout(0))
  const chamberRef=useRef<NetworkChamber|null>(null)
  const orbitRef=useRef({yaw:0.5,pitch:0.15,radius:ORBIT_DEFAULT})
  const transitRef=useRef<Transit|null>(null)
  const flyRef=useRef<FlyTo|null>(null)
  const interactingRef=useRef(false)
  const modeRef=useRef(mode)
  modeRef.current=mode
  const selectedRef=useRef(selected)
  selectedRef.current=selected
  const composingRef=useRef(composing)
  composingRef.current=composing
  const openNetworkRef=useRef<(()=>void)|null>(null)
  const labelRef=useRef<HonestState|null>(null)
  labelRef.current=editionLabel
  const exhibitsRef=useRef(exhibits)
  exhibitsRef.current=exhibits
  const currentRef=useRef(current)
  currentRef.current=current
  const nodesRef=useRef(nodes)
  nodesRef.current=nodes
  const sourceRef=useRef(source)
  sourceRef.current=source
  const inspectRef=useRef(inspect)
  inspectRef.current=inspect
  // Guards the async revalidation window on journey/exhibit transitions so
  // a second transition cannot interleave before the first settles.
  const verifyingRef=useRef(false)

  useEffect(()=>{
    if(!supported)return
    const canvas=canvasRef.current
    if(!canvas)return
    reduced.current=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false
    const field=new SilverField(canvas)
    fieldRef.current=field
    const path=CameraRig.originPath()
    const rig=new CameraRig({waypoints:path.waypoints,docks:[],reducedMotion:reduced.current},window.innerWidth/window.innerHeight)
    rigRef.current=rig
    const mounts=new ExhibitMounts(field.scene)
    mountsRef.current=mounts
    const chamber=new NetworkChamber(field.scene)
    chamberRef.current=chamber
    void loadCatalogNodes().then(({nodes:loaded,source:loadedSource})=>{setNodes(loaded);setSource(loadedSource)})
    const readScroll=()=>{
      const maxScroll=document.documentElement.scrollHeight-window.innerHeight
      rig.setScroll(window.scrollY,maxScroll,layoutRef.current.pathLength)
      // The journey lives where the exhibition list did: scrolling to the
      // bottom of the promenade opens the network without a button press.
      // Returning stays explicit via Promenade, Esc, dive, or curate.
      if(modeRef.current==='promenade'&&!composingRef.current&&!transitRef.current
        &&nodesRef.current.length>0&&maxScroll>0&&window.scrollY/maxScroll>0.985){
        void openNetworkRef.current?.()
      }
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
    let anchor:{x:number;y:number}|null=null
    const pointers=new Map<number,{x:number;y:number}>()
    let pinchDist=0
    const onDown=(event:PointerEvent)=>{
      down={x:event.clientX,y:event.clientY}
      anchor={x:event.clientX,y:event.clientY}
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY})
      if(pointers.size===2){
        const [a,b]=[...pointers.values()]
        pinchDist=Math.hypot(a.x-b.x,a.y-b.y)
      }
    }
    const onMove=(event:PointerEvent)=>{
      if(!down||!pointers.has(event.pointerId))return
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY})
      if(modeRef.current!=='network')return
      if(pointers.size===2){
        const [a,b]=[...pointers.values()]
        const dist=Math.hypot(a.x-b.x,a.y-b.y)
        if(pinchDist>0)orbitRef.current.radius*=pinchDist/Math.max(1,dist)
        pinchDist=dist
        interactingRef.current=true
        return
      }
      const orbit=orbitRef.current
      orbit.yaw-=(event.clientX-down.x)*0.005
      orbit.pitch+=(event.clientY-down.y)*0.005
      down={x:event.clientX,y:event.clientY}
      interactingRef.current=true
    }
    const onUp=(event:PointerEvent)=>{
      pointers.delete(event.pointerId)
      if(pointers.size<2)pinchDist=0
      interactingRef.current=pointers.size>0
      if(!down||!anchor)return
      const moved=Math.hypot(event.clientX-anchor.x,event.clientY-anchor.y)
      down=null
      anchor=null
      if(moved>6||transitRef.current)return
      const rect=canvas.getBoundingClientRect()
      if(modeRef.current==='network'){
        const index=chamber.pick(event.clientX,event.clientY,rig.camera,rect)
        setSelected(index)
        chamber.setSelected(index)
        return
      }
      const pick=mounts.pick(event.clientX,event.clientY,rig.camera,rect)
      if(!pick)return
      bridgeRef.current!.emit({type:'pick',assetId:pick.assetId})
      setInspect({assetId:pick.assetId,hotspotId:pick.hotspotId})
    }
    const onWheel=(event:WheelEvent)=>{
      if(modeRef.current!=='network')return
      event.preventDefault()
      orbitRef.current.radius*=1+event.deltaY*0.001
    }
    canvas.addEventListener('pointerdown',onDown)
    canvas.addEventListener('pointermove',onMove)
    canvas.addEventListener('pointerup',onUp)
    canvas.addEventListener('pointercancel',onUp)
    canvas.addEventListener('wheel',onWheel,{passive:false})
    const flyTo:FlyTo=(toPos,toLook,dur,onDone,onFrame)=>{
      const direction=new THREE.Vector3()
      rig.camera.getWorldDirection(direction)
      const fromPos=rig.camera.position.clone()
      const fromLook=fromPos.clone().add(direction.multiplyScalar(20))
      if(reduced.current||dur<=0){
        rig.camera.position.set(...toPos)
        rig.camera.lookAt(...toLook)
        onFrame?.(1)
        onDone()
        return
      }
      transitRef.current={t0:performance.now(),dur,fromPos,fromLook,toPos:new THREE.Vector3(...toPos),toLook:new THREE.Vector3(...toLook),onFrame,onDone}
    }
    flyRef.current=flyTo
    let frame=0,last=performance.now(),alive=true
    const loop=(now:number)=>{
      if(!alive)return
      const dt=Math.min((now-last)/1000,0.1)
      last=now
      const transit=transitRef.current
      if(transit){
        const k=Math.min(1,(now-transit.t0)/transit.dur)
        const eased=k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2
        rig.camera.position.lerpVectors(transit.fromPos,transit.toPos,eased)
        rig.camera.lookAt(transit.fromLook.clone().lerp(transit.toLook,eased))
        transit.onFrame?.(eased)
        if(k>=1){transitRef.current=null;transit.onDone()}
      }else if(modeRef.current==='network'){
        chamber.update(now/1000,dt,interactingRef.current,reduced.current)
        const orbit=orbitRef.current
        const view=orbitCamera(NETWORK_CENTER,orbit.yaw,orbit.pitch,orbit.radius)
        rig.camera.position.set(...view.position)
        rig.camera.lookAt(...view.look)
      }else{
        rig.update(dt)
        const director=directorRef.current,assembly=assemblyRef.current
        if(assembly){
          const {phase,t,holdMs}=director.update()
          assembly.update(phase,t,now/1000)
          const base=phase==='stream'?t*21:phase==='lattice'?21+t*21:phase==='resolve'?42+t*18:60
          rig.setCinematic(Math.min(base+Math.min(holdMs/1000*2.5,12),60))
          if(phase==='resolve'){
            if(!resolveFiredRef.current){
              resolveFiredRef.current=true
              const staged=stagedRef.current
              if(staged){
                setExhibits(staged.exhibits)
                setEditionLabel(staged.label)
                setFallbackReason(staged.reason??null)
                setStatus(editionStatusCopy(staged.timedOut,staged.skipped))
                setShowDock(false)
              }
            }
            mounts.setResolve(t)
          }
          if(phase!==lastPhaseRef.current){
            lastPhaseRef.current=phase
            if(phase==='done'){
              setComposing(false)
              window.clearInterval(tickerRef.current)
              assembly.dispose(field.scene)
              if(assemblyRef.current===assembly)assemblyRef.current=null
              director.reset()
              rig.setCinematic(null)
              const maxScroll=document.documentElement.scrollHeight-window.innerHeight
              const dock=layoutRef.current.docks[0]??rig.state.distance
              if(maxScroll>0)window.scrollTo(0,dock/layoutRef.current.pathLength*maxScroll)
            }
          }
        }
      }
      mounts.group.visible=modeRef.current==='promenade'||transitRef.current!==null
      chamber.group.visible=modeRef.current==='network'
      mounts.update(now/1000,reduced.current)
      field.update(dt,reduced.current)
      field.render(rig.camera)
      const nearest=modeRef.current==='network'?-1:rig.state.nearest
      if(nearest!==currentRef.current)setCurrent(nearest)
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    ;(window as unknown as {__spatial?:()=>DebugSnapshot}).__spatial=()=>({
      distance:rig.state.distance,cameraZ:rig.state.cameraZ,cameraY:rig.state.cameraY,current:currentRef.current,
      exhibits:exhibitsRef.current.length,nodes:nodesRef.current.length,source:sourceRef.current,
      assembly:directorRef.current.phase,mode:modeRef.current,
      orbit:{...orbitRef.current},selected:selectedRef.current,
      staged:exhibitsRef.current.map(e=>e.assetId),
      nodeIds:nodesRef.current.map(n=>n.assetId),
      honest:labelRef.current,
    })
    return ()=>{
      alive=false
      cancelAnimationFrame(frame)
      window.clearInterval(tickerRef.current)
      assemblyRef.current?.dispose(field.scene)
      assemblyRef.current=null
      transitRef.current=null
      flyRef.current=null
      document.documentElement.style.overflow=''
      window.removeEventListener('scroll',readScroll)
      window.removeEventListener('resize',resize)
      canvas.removeEventListener('pointerdown',onDown)
      canvas.removeEventListener('pointermove',onMove)
      canvas.removeEventListener('pointerup',onUp)
      canvas.removeEventListener('pointercancel',onUp)
      canvas.removeEventListener('wheel',onWheel)
      mounts.dispose()
      chamber.dispose()
      field.dispose()
      rigRef.current=null
      mountsRef.current=null
      chamberRef.current=null
      delete (window as unknown as {__spatial?:unknown}).__spatial
    }
  },[supported])

  useEffect(()=>{
    // Stage the promenade path whenever exhibits arrive. Artwork that fails
    // to load (notably a revoked /api/media version answering 404) removes
    // its exhibit instead of lingering as an empty board.
    const rig=rigRef.current,mounts=mountsRef.current
    if(!rig||!mounts)return
    mounts.onArtworkError=(assetId:string)=>{pruneExhibits(id=>id!==assetId,'revoked')}
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

  useEffect(()=>{
    // Network owns every touch gesture for orbit/pinch; the promenade
    // keeps native vertical scroll.
    if(canvasRef.current)canvasRef.current.style.touchAction=mode==='network'?'none':'pan-y'
  },[mode])

  useEffect(()=>{
    if(mode!=='network')return
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return
      if(selectedRef.current>=0){selectNode(-1);return}
      backToPromenade()
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[mode])

  if(!supported){
    return <SpatialFallback/>
  }

  const submit=async(event?:React.FormEvent,promptOverride?:string)=>{
    event?.preventDefault()
    const trimmed=(promptOverride??prompt).trim()
    if(!trimmed||composing)return
    if(modeRef.current==='network')exitNetworkInstant()
    setComposing(true)
    setCleared(null)
    setElapsed(0)
    setStatus('Composing your exhibition…')
    const submitId=++submitIdRef.current
    window.scrollTo(0,0)
    try{
      sessionStorage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:1,prompt:trimmed.slice(0,1000),startedAt:Date.now()}))
    }catch{/* Private browsing keeps the visit in memory only. */}
    bridgeRef.current!.emit({type:'prompt',prompt:trimmed})
    const field=fieldRef.current
    // Level flight while assembling: the idle overlook ramp would pitch the
    // camera up and push the convergence below frame. Matches the staged
    // path's first segment, so resolve-fire swaps without a pop.
    const levelFlight:Waypoint[]=[{d:0,p:[0,2.2,26]},{d:60,p:[0,2.2,-40]},{d:110,p:[0,2.2,-95]}]
    if(field&&!reduced.current){
      rigRef.current?.setPath(levelFlight,[])
      assemblyRef.current?.dispose(field.scene)
      assemblyRef.current=new AssemblyField(field.scene)
      resolveFiredRef.current=false
      stagedRef.current=null
      lastPhaseRef.current='stream'
      directorRef.current.start()
      window.clearInterval(tickerRef.current)
      const begun=Date.now()
      tickerRef.current=window.setInterval(()=>setElapsed(Math.floor((Date.now()-begun)/1000)),500)
    }
    fetchAbortRef.current?.abort()
    const controller=new AbortController()
    fetchAbortRef.current=controller
    const {edition,honest,fallbackReason:reason,timedOut}=await fetchEdition(trimmed,consent,fetch,{onResponse:()=>directorRef.current.onResponse(),signal:controller.signal})
    if(submitId!==submitIdRef.current)return
    const {exhibits:staged,skipped}=stageEdition(edition)
    if(!staged.length){
      setComposing(false)
      window.clearInterval(tickerRef.current)
      rigRef.current?.setPath(exhibitLayout(0).waypoints,[])
      directorRef.current.reset()
      const assembly=assemblyRef.current
      if(assembly&&field){assembly.dispose(field.scene);assemblyRef.current=null}
      setStatus(timedOut?editionStatusCopy(true,0):'No stageable exhibits right now. Refine your curiosity and try again.')
      return
    }
    if(reduced.current||!assemblyRef.current){
      setExhibits(staged)
      setEditionLabel(honest)
      setFallbackReason(reason??null)
      setShowDock(false)
      setComposing(false)
      setStatus(editionStatusCopy(timedOut,skipped))
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const layout=exhibitLayout(staged.length)
        const maxScroll=document.documentElement.scrollHeight-window.innerHeight
        if(maxScroll>0)window.scrollTo(0,60/layout.pathLength*maxScroll)
      }))
      return
    }
    stagedRef.current={exhibits:staged,label:honest,skipped,reason,timedOut}
    directorRef.current.onSettled()
  }

  const clear=()=>{
    if(transitRef.current){transitRef.current=null;finishClear();return}
    const fly=flyRef.current,chamber=chamberRef.current
    // The Clear exhale from the network: the constellation disperses while
    // the camera glides home, then the visit is wiped as everywhere else.
    if(modeRef.current==='network'&&!reduced.current&&fly&&chamber){
      const target=chamber
      setSelected(-1)
      fly([0,2.2,26],[0,2.4,-20],1400,()=>finishClear(),k=>target.disperse(k))
      return
    }
    finishClear()
  }

  const finishClear=()=>{
    submitIdRef.current++
    fetchAbortRef.current?.abort()
    rigRef.current?.setCinematic(null)
    setComposing(false)
    const {removed}=clearSpatialSession({localStorage,sessionStorage})
    const field=fieldRef.current,assembly=assemblyRef.current
    if(field&&assembly){assembly.dispose(field.scene);assemblyRef.current=null}
    directorRef.current.reset()
    window.clearInterval(tickerRef.current)
    exitNetworkInstant()
    setCleared(removed)
    setPrompt('')
    setConsent(false)
    setStatus('')
    setElapsed(0)
    setExhibits([])
    setEditionLabel(null)
    setFallbackReason(null)
    setInspect(null)
    setShowDock(true)
    setAnnounce(removed.length?`Visit cleared. ${removed.length} keys removed.`:'Visit cleared.')
    bridgeRef.current!.emit({type:'clear',removed})
    window.scrollTo({top:0,behavior:reduced.current?'auto':'smooth'})
  }

  const reopen=()=>{
    setShowDock(true)
    setInspect(null)
    window.scrollTo({top:0,behavior:reduced.current?'auto':'smooth'})
  }

  const lockScroll=(locked:boolean)=>{document.documentElement.style.overflow=locked?'hidden':''}

  const scrollToDock=(dock:number)=>{
    const maxScroll=document.documentElement.scrollHeight-window.innerHeight
    if(maxScroll>0)window.scrollTo(0,dock/layoutRef.current.pathLength*maxScroll)
  }

  const selectNode=(index:number)=>{
    setSelected(index)
    chamberRef.current?.setSelected(index)
    const node=index>=0?nodesRef.current[index]:undefined
    if(node)setAnnounce(`${node.label}. ${node.kind}.`)
  }

  const exitNetworkInstant=()=>{
    transitRef.current=null
    setMode('promenade')
    setSelected(-1)
    chamberRef.current?.setSelected(-1)
    lockScroll(false)
  }

  // Only server-answered editions hold revocable publications; local demo
  // editions and the manifest fallback have nothing to revalidate.
  const serverSourced=()=>labelRef.current==='meta'||labelRef.current==='meta-cached'||labelRef.current==='deterministic-d1'

  // Drop exhibits the catalog no longer confirms. Mounts rebuild from state
  // and dispose their textures, so pruned artwork cannot resurface.
  const pruneExhibits=(keep:(assetId:string)=>boolean,reason:'revoked'|'unverified'):StagedExhibit[]=>{
    const before=exhibitsRef.current
    const kept=before.filter(exhibit=>keep(exhibit.assetId))
    if(kept.length===before.length)return before
    const removed=before.length-kept.length
    setExhibits(kept)
    const viewing=inspectRef.current
    if(viewing&&!kept.some(exhibit=>exhibit.assetId===viewing.assetId))setInspect(null)
    if(!kept.length){setShowDock(true);setEditionLabel(null);setFallbackReason(null)}
    setStatus(reason==='unverified'
      ?'The exhibition could not be verified; unverified exhibits were removed.'
      :`${removed} exhibit${removed===1?'':'s'} ${removed===1?'was':'were'} removed: the catalog no longer lists ${removed===1?'it':'them'}.`)
    return kept
  }

  const openNetwork=async()=>{
    const chamber=chamberRef.current,fly=flyRef.current
    if(modeRef.current==='network'||!nodesRef.current.length||composing||transitRef.current||verifyingRef.current)return
    let current=nodesRef.current
    let stagedNow=exhibitsRef.current
    if(sourceRef.current==='published'){
      verifyingRef.current=true
      try{
        const {eligible,verified}=await revalidateVersions(current.map(node=>node.assetId))
        if(!verified){
          // Fail closed: unverified records leave, and the labeled local
          // manifest keeps Journey usable without redisplaying them. Staged
          // server exhibits go too — only local demo content is unaffected.
          const fresh=await loadCatalogNodes()
          current=fresh.nodes
          setNodes(current)
          setSource(fresh.source)
          let dropped=0
          if(serverSourced()){
            const before=exhibitsRef.current.length
            stagedNow=pruneExhibits(()=>false,'unverified')
            dropped=before-stagedNow.length
          }
          setStatus(dropped
            ?'The live catalog could not be verified; unverified records and exhibits were removed.'
            :'The live catalog could not be verified; unverified records were removed.')
        }else{
          const checked=new Set(current.map(node=>node.assetId))
          const removed=current.filter(node=>!eligible.has(node.assetId))
          if(removed.length){
            current=current.filter(node=>eligible.has(node.assetId))
            setNodes(current)
            setStatus(`${removed.length} record${removed.length===1?'':'s'} left the catalog and ${removed.length===1?'was':'were'} removed from the journey.`)
          }
          if(serverSourced())stagedNow=pruneExhibits(id=>!checked.has(id)||eligible.has(id),'revoked')
        }
      }finally{
        verifyingRef.current=false
      }
      if(!current.length)return
    }
    setInspect(null)
    setSelected(-1)
    setShowDock(false)
    setMode('network')
    setAnnounce(`Journey network. ${current.length} records.`)
    bridgeRef.current!.emit({type:'network',open:true})
    if(reduced.current||!chamber||!fly)return
    chamber.setNodes(current,new Set(stagedNow.map(e=>e.assetId)))
    lockScroll(true)
    const orbit=orbitRef.current
    const view=orbitCamera(NETWORK_CENTER,orbit.yaw,orbit.pitch,orbit.radius)
    fly(view.position,view.look,1600,()=>{})
  }
  openNetworkRef.current=openNetwork

  const backToPromenade=async()=>{
    const fly=flyRef.current
    if(transitRef.current||verifyingRef.current)return
    if(serverSourced()&&exhibitsRef.current.length){
      verifyingRef.current=true
      try{
        const checked=new Set(exhibitsRef.current.map(exhibit=>exhibit.assetId))
        const {eligible,verified}=await revalidateVersions([...checked])
        pruneExhibits(id=>verified&&eligible.has(id),verified?'revoked':'unverified')
        if(verified){
          // The same response settles the matching Journey nodes for free.
          const remaining=nodesRef.current.filter(node=>!checked.has(node.assetId)||eligible.has(node.assetId))
          if(remaining.length!==nodesRef.current.length)setNodes(remaining)
        }
      }finally{
        verifyingRef.current=false
      }
    }
    const layout=layoutRef.current
    const dock=layout.docks[Math.max(0,currentRef.current)]??layout.docks[0]??60
    setSelected(-1)
    chamberRef.current?.setSelected(-1)
    bridgeRef.current!.emit({type:'network',open:false})
    if(reduced.current||!fly){
      exitNetworkInstant()
      if(!exhibitsRef.current.length)setShowDock(true)
      setAnnounce('Back at the promenade.')
      scrollToDock(dock)
      return
    }
    const pos=splinePosition(dock,layout.waypoints),look=splinePosition(dock+18,layout.waypoints)
    fly(pos,look,1400,()=>{
      setMode('promenade')
      if(!exhibitsRef.current.length)setShowDock(true)
      lockScroll(false)
      setAnnounce('Back at the promenade.')
      scrollToDock(dock)
    })
  }

  const diveTo=async(index:number)=>{
    const fly=flyRef.current
    const node=nodesRef.current[index]
    if(!node||transitRef.current||verifyingRef.current)return
    let stagedNow=exhibitsRef.current
    if(serverSourced()&&stagedNow.length){
      verifyingRef.current=true
      try{
        const {eligible,verified}=await revalidateVersions(stagedNow.map(exhibit=>exhibit.assetId))
        stagedNow=pruneExhibits(id=>verified&&eligible.has(id),verified?'revoked':'unverified')
        if(!verified||!eligible.has(node.assetId)){
          // Stay in the network: the target is gone, and so is its node.
          const remaining=nodesRef.current.filter(candidate=>candidate.assetId!==node.assetId)
          setNodes(remaining)
          selectNode(-1)
          chamberRef.current?.setNodes(remaining,new Set(stagedNow.map(exhibit=>exhibit.assetId)))
          setAnnounce(`${node.label} is no longer available.`)
          return
        }
      }finally{
        verifyingRef.current=false
      }
    }
    const exhibit=stagedNow.findIndex(e=>e.assetId===node.assetId)
    if(exhibit<0)return
    // Pruning can shift positions, so the dive targets a layout rebuilt for
    // the confirmed exhibits; the staging effect converges on the same one.
    const layout=exhibitLayout(stagedNow.length)
    layoutRef.current=layout
    const dock=layout.docks[exhibit]??60
    const mount=layout.mounts[exhibit]??{x:0,z:-52}
    setAnnounce(`Entering ${node.label}.`)
    bridgeRef.current!.emit({type:'dive',assetId:node.assetId})
    if(reduced.current||!fly){
      exitNetworkInstant()
      scrollToDock(dock)
      return
    }
    setSelected(-1)
    chamberRef.current?.setSelected(-1)
    fly([mount.x*0.4,2.6,mount.z+13],[mount.x,2.6,mount.z],1800,()=>{
      setMode('promenade')
      lockScroll(false)
      scrollToDock(dock)
    })
  }

  const surprise=()=>{
    if(!nodesRef.current.length)return
    const pick=pickSurprise(nodesRef.current.length,selectedRef.current)
    selectNode(pick)
    const node=nodesRef.current[pick]
    if(node){
      bridgeRef.current!.emit({type:'surprise',assetId:node.assetId})
      setAnnounce(`Surprise: ${node.label}. Choose whether to enter.`)
    }
  }

  const stepNode=(direction:1|-1)=>{
    const count=nodesRef.current.length
    if(!count)return
    selectNode((selectedRef.current+direction+count)%count)
  }

  const curateFrom=(index:number)=>{
    const node=nodesRef.current[index]
    if(!node||composing)return
    exitNetworkInstant()
    setPrompt(node.label)
    void submit(undefined,node.label)
  }

  const staged=exhibits.length>0
  const stagedIds=new Set(exhibits.map(e=>e.assetId))
  const active=current>=0?exhibits[current]:null
  const inspected=inspect?exhibits.find(e=>e.assetId===inspect.assetId)??null:null
  const inspectedHotspot=inspected?.hotspots.find(h=>h.id===inspect?.hotspotId)??inspected?.hotspots[0]
  const selectedNode=selected>=0?nodes[selected]??null:null
  const selectedStaged=selectedNode?stagedIds.has(selectedNode.assetId):false
  const sourceLabel=nodes.length?`${nodes.length} records (${source==='published'?'live catalog':'local manifest'})`:'loading…'
  const crumb=mode==='network'
    ?selectedNode?`Journey · ${selectedNode.label}`:`Journey · ${sourceLabel}`
    :staged&&active?`Exhibit ${current+1} of ${exhibits.length} · ${active.title}`:staged?'Your exhibition':'Discover · Silver Field'
  return <main className="spatial-root" aria-label="Curio spatial exhibition">
    <a className="spatial-skip" href={mode==='network'?'#spatial-journey':showDock?'#spatial-prompt-heading':'#spatial-rail'}>
      {mode==='network'?'Skip to journey controls':showDock?'Skip to curiosity prompt':'Skip to exhibit contents'}
    </a>
    <canvas ref={canvasRef} className="spatial-canvas" aria-hidden="true"/>
    <div className="spatial-vignette" aria-hidden="true"/>
    <header className="spatial-hud">
      <a className="spatial-brand" href="/" aria-label="Curio home">curio<span>.</span></a>
      <nav className="spatial-crumb" aria-label="Journey" aria-live="polite">
        {crumb}
      </nav>
      <div className="spatial-actions">
        {mode==='network'
          ?<button type="button" onClick={backToPromenade}>Promenade</button>
          :<button type="button" onClick={openNetwork} disabled={!nodes.length||composing}>Journey</button>}
        {staged&&mode==='promenade'&&<button type="button" onClick={reopen}>New prompt</button>}
      </div>
    </header>
    {editionLabel&&<p className="spatial-chip" role="note" data-testid="spatial-edition-chip">{HONEST_COPY[editionLabel]}{fallbackReason&&REASON_COPY[fallbackReason]?` (${REASON_COPY[fallbackReason]})`:''}</p>}
    {composing&&<p role="status" className="spatial-chip">Composing your exhibition…{elapsed>0?` (${elapsed}s)`:''}</p>}
    {!composing&&status&&<p role="status" className={`spatial-chip${editionLabel?' is-sub':''}`}>{status}</p>}
    {showDock&&<section className={`spatial-dock${entered?' is-docked':''}${composing?' is-composing':''}`} aria-labelledby="spatial-prompt-heading">
      <p className="spatial-eyebrow">01 · Discover</p>
      <h1 id="spatial-prompt-heading" tabIndex={-1}>What are you curious about?</h1>
      <form onSubmit={submit}>
        <label className="spatial-sr" htmlFor="spatial-prompt">Your curiosity</label>
        <textarea id="spatial-prompt" rows={2} maxLength={1000} value={prompt}
          placeholder="A quiet room, a bold garment, an unfamiliar coast…"
          onChange={event=>setPrompt(event.target.value)}/>
        <label className="spatial-consent">
          <input type="checkbox" checked={consent} disabled={composing} onChange={event=>setConsent(event.target.checked)}/>
          Allow AI curation
        </label>
        <button type="submit" disabled={!prompt.trim()||composing}>{composing?'Composing…':'Begin exploration →'}</button>
      </form>
      <p className="spatial-fine">Off by default. When on, your prompt may be sent to Meta for curation.</p>
      {cleared&&<p role="status" className="spatial-status">
        Visit cleared from this browser{cleared.length?`: ${cleared.join(', ')}`:'. No visit data was found in this browser.'} Server data handling: pending confirmation.
      </p>}
    </section>}
    {active&&!inspect&&mode==='promenade'&&<section id="spatial-rail" tabIndex={-1} className="spatial-rail" aria-label={`Contents of ${active.title}`}>
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
      <ObjectDiscovery key={inspected.assetId} assetId={inspected.assetId} image={inspected.image} alt={`Artwork for ${inspected.title}`}/>
      <p className="spatial-eyebrow">Inspection</p>
      <h2>{inspectedHotspot?.productName??inspected.title}</h2>
      {inspectedHotspot
        ?<><p>{inspectedHotspot.brandName} · unverified · fictional, not for sale</p>
          <p className="spatial-fine">Demo price: ${inspectedHotspot.priceUsd.toLocaleString('en-US')} USD</p>
          <ul>{inspectedHotspot.assumptions.map(a=><li key={a}>{a}</li>)}</ul>
          <p className="spatial-fine">Manually authored hotspot · no SAM inference. Material and specifications unverified.</p></>
        :<><p>{inspected.narrative}</p><p className="spatial-fine">{inspected.attribution}</p></>}
    </aside>}
    {mode==='network'&&<nav id="spatial-journey" tabIndex={-1} className="spatial-journey-bar" aria-label="Journey network">
      <button type="button" onClick={backToPromenade}>← Promenade</button>
      <button type="button" onClick={surprise}>Surprise me</button>
      <button type="button" onClick={clear}>Clear</button>
      <button type="button" onClick={()=>stepNode(-1)} aria-label="Previous node">←</button>
      <button type="button" onClick={()=>stepNode(1)} aria-label="Next node">→</button>
      <span className="spatial-fine">{sourceLabel}</span>
    </nav>}
    {mode==='network'&&selectedNode&&<aside className="spatial-inspect spatial-node-panel" aria-label={`Node ${selectedNode.label}`} data-testid="spatial-node-panel">
      <button type="button" className="spatial-inspect-close" onClick={()=>selectNode(-1)} aria-label="Close node panel">×</button>
      <p className="spatial-eyebrow">04 · Journey</p>
      <h2>{selectedNode.label}</h2>
      <p>{selectedNode.kind} · {selectedStaged?'in your current edition':'in the catalog, outside your current edition'}</p>
      {selectedStaged
        ?<button type="button" className="spatial-node-enter" onClick={()=>diveTo(selected)}>Enter exhibit →</button>
        :<button type="button" className="spatial-node-enter" onClick={()=>curateFrom(selected)}>Curate from this node →</button>}
    </aside>}
    <div className="spatial-scroll-proxy" style={staged?{height:`${140+exhibits.length*90}vh`}:undefined} aria-hidden="true"/>
    <p className="spatial-sr" aria-live="polite">{announce}</p>
  </main>
}
