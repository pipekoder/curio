import type {EditorialSource} from '../../shared/editorial-sources'

// The article response contains only cited, server-validated research sources.
// This reuses the existing Sources presentation without changing Book layouts.
export default function ResearchSources({references,disclosure}:{references:EditorialSource[];disclosure?:string}){
  return <>
    {references.length?<section className="spatial-sources" aria-label="Sources & References">
      <h3>Sources & References</h3><ol className="spatial-sources-list">{references.map((source,index)=>{
        const citation=source.citations?.[0]
        return citation?<li key={source.id}><p>[{index+1}] {citation.title??citation.publication??'Source'} · {citation.publication}</p>
          <p>{source.value}</p><a href={citation.url} target="_blank" rel="noreferrer">Open source ↗</a></li>:null
      })}</ol>
    </section>:null}
    {disclosure?<p className="spatial-fine">{disclosure}</p>:null}
  </>
}
