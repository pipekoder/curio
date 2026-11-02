import {useState} from 'react'
import type {StagedPlan} from './edition'
import {citationsForFeature,fetchCitations,featureHasCitedClaims,type PublicCitation} from './citations'

const KIND_LABEL={factual:'Fact',comparison:'Comparison',interpretation:'Interpretation'} as const
const SUPPORT_LABEL={reviewed_paraphrase:'Reviewed paraphrase',approved_excerpt:'Approved excerpt'} as const

// Cultural evidence citations as a discreet bottom section of the expanded
// Story. The affordance shows only when the edition plan binds V3 claims
// for this exhibit; citation details load on explicit open and recheck
// every time, so revoked material cannot persist. Only reviewed response
// fields render, as plain text. An empty lookup hides the section rather
// than leaving a placeholder behind.
export default function Sources({exhibit,plan}:{
  exhibit:{featureIndex:number;catalogId:string;assetId:string};plan:StagedPlan|null
}){
  const [open,setOpen]=useState(false)
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'empty'>('idle')
  const [citations,setCitations]=useState<PublicCitation[]>([])
  if(!plan||!featureHasCitedClaims(plan,exhibit.featureIndex))return null
  if(open&&status==='empty')return null
  const toggle=()=>{
    if(open){setOpen(false);return}
    setOpen(true)
    setStatus('loading')
    void fetchCitations(plan).then(response=>{
      const matched=response?citationsForFeature(response,exhibit):null
      if(matched&&matched.length){setCitations(matched);setStatus('ready')}
      else setStatus('empty')
    })
  }
  return <section className="spatial-sources" aria-label="Sources & References">
    <button type="button" aria-expanded={open} onClick={toggle}>Sources & References {open?'▾':'▸'}</button>
    {open&&status==='loading'&&<p className="spatial-fine">Checking approved sources…</p>}
    {open&&status==='ready'&&<ol className="spatial-sources-list">{citations.map((citation,index)=>(
      <li key={`${citation.claimId}-${index}`}>
        <p className="spatial-sources-claim"><strong>{KIND_LABEL[citation.claimKind]}</strong> · Operator reviewed · Approved</p>
        <p>{citation.narrativeText}</p>
        {citation.sources.map((source,sourceIndex)=>(
          <div key={`${source.passageId}-${sourceIndex}`} className="spatial-sources-item">
            <p className="spatial-fine">{SUPPORT_LABEL[source.support.kind]} · {source.publication??source.canonicalUrl}</p>
            {source.support.kind==='approved_excerpt'?<q>{source.support.text}</q>:<p>{source.support.text}</p>}
            <p><a href={source.canonicalUrl} target="_blank" rel="noreferrer">Open source ↗</a></p>
          </div>
        ))}
      </li>
    ))}</ol>}
  </section>
}
