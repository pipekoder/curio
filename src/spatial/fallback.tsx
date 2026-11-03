import {useEffect,useState} from 'react'
import {fetchEdition} from './edition'
import {loadCatalogNodes} from './nodes'
import type {StagedExhibit} from './staging'
import type {CatalogNode} from './contracts'

// Minimal readable Silver Field for browsers without WebGL. Same honest
// pipeline (fetch, validate, stage), rendered as articles and a plain node
// list. No AI consent control here: this path never enables inference.
export function SpatialFallback(){
  const [prompt,setPrompt]=useState('')
  const [busy,setBusy]=useState(false)
  const [exhibits,setExhibits]=useState<StagedExhibit[]>([])
  const [nodes,setNodes]=useState<CatalogNode[]>([])
  const [source,setSource]=useState('')
  useEffect(()=>{
    void loadCatalogNodes().then(({nodes:loaded,source:loadedSource})=>{setNodes(loaded);setSource(loadedSource)})
  },[])
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault()
    const trimmed=prompt.trim()
    if(!trimmed||busy)return
    setBusy(true)
    try{
      const {edition}=await fetchEdition(trimmed,false)
      // The fallback path never selects Hybrid, so a refusal cannot occur;
      // the guard only satisfies the nullable no-edition result.
      if(edition){
        const {stageEdition}=await import('./staging')
        setExhibits(stageEdition(edition).exhibits)
      }
    }finally{
      setBusy(false)
    }
  }
  return <main className="spatial-fallback">
    <p className="spatial-eyebrow">Curio · Silver Field</p>
    <h1>Follow your curiosity</h1>
    <p role="status">The 3D exhibition needs WebGL, which this browser has disabled. The readable edition follows. AI curation is off here.</p>
    <form onSubmit={submit}>
      <label htmlFor="spatial-fallback-prompt">Your curiosity</label>
      <textarea id="spatial-fallback-prompt" rows={2} maxLength={1000} value={prompt}
        placeholder="A quiet room, a bold garment, an unfamiliar coast…"
        onChange={event=>setPrompt(event.target.value)}/>
      <button type="submit" disabled={!prompt.trim()||busy}>{busy?'Composing…':'Begin exploration →'}</button>
    </form>
    {exhibits.map(exhibit=><article key={exhibit.assetId}>
      <h2>{exhibit.title}</h2>
      <img src={exhibit.image} alt="" width={640}/>
      <p>{exhibit.narrative}</p>
      <p>{exhibit.attribution} · {exhibit.rights}</p>
    </article>)}
    {nodes.length>0&&<section aria-label="Journey catalog">
      <h2>Journey catalog ({source==='published'?'live catalog':'local manifest'})</h2>
      <ul>{nodes.map(node=><li key={node.assetId}>{node.label} · {node.kind}</li>)}</ul>
    </section>}
  </main>
}
