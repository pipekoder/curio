import { useState } from 'react'
import type { MagazineIssue, CatalogPreview } from '../shared/magazine'
import Attribution from './Attribution'
import CatalogImage from './CatalogImage'

const labels = { home: 'Home & Interior', fashion: 'Fashion & Styling', travel: 'Travel & Places' }
export default function Magazine({ issue }: { issue: MagazineIssue | CatalogPreview }) {
  const preview = issue.source === 'catalog_preview'
  const [layout, setLayout] = useState(issue.layoutIntent)
  const heading = `magazine-${issue.id}`
  return <section className={`magazine layout-${layout}`} aria-labelledby={heading}>
    <header className="reader-header"><p className="eyebrow">{preview ? 'THE LIBRARY EDITION / NO AI CALL' : 'YOUR CURATED EDITION'}</p>
      <h2 id={heading}>{issue.title}</h2>
      <p>{preview ? 'A local sample from the advertising library. Commentary below is authored fixture text; this sample makes no AI call.' : 'Curated commentary by Meta Muse Spark 1.3 Standard. AI interpretation is not a verified factual claim.'}</p>
      <p>Category percentages represent editorial emphasis, with one selected item per active category.</p>
      <div className="layout-controls" role="group" aria-label="Editorial layout">
        <button type="button" aria-pressed={layout === 'airy'} onClick={() => setLayout('airy')}>Airy / split</button>
        <button type="button" aria-pressed={layout === 'immersive'} onClick={() => setLayout('immersive')}>Immersive / full frame</button>
      </div>
    </header>
    <div key={layout} className="reader-pages">
      {issue.sections.map((section, index) => <article key={section.ad.image.id} className="editorial-page" aria-label={`${section.ad.name} editorial page`}>
        <div className="page-number"><span>0{index + 1}</span><span>{labels[section.category]} / {section.weight}%</span></div>
        <div className="editorial-composition">
          <CatalogImage ad={section.ad} eager={index === 0} />
          <div className="editorial-copy"><h3>{section.ad.name}</h3><Attribution ad={section.ad} />
            <blockquote>{section.commentary}</blockquote><p className="source-label">{preview ? 'Authored fixture commentary · not AI output' : 'AI interpretation · not a verified factual claim'}</p>
          </div>
        </div>
      </article>)}
    </div>
    <small className="source-label">Issue {issue.id}</small>
  </section>
}
