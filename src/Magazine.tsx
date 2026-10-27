import type { MagazineIssue } from '../shared/magazine'

const labels = { home: 'Home & Interior', fashion: 'Fashion & Styling', travel: 'Travel & Places' }
export default function Magazine({ issue }: { issue: MagazineIssue }) {
  return <section className="magazine" aria-labelledby="magazine-title">
    <p className="eyebrow">YOUR FICTIONAL EDITION</p>
    <h2 id="magazine-title">{issue.title}</h2>
    <p>Curated commentary by Meta Muse Spark 1.3 Standard. All catalog items are fictional. No offers, real brands, or bookable destinations.</p>
    <p>Category percentages represent editorial emphasis, with one selected item per active category.</p>
    {issue.sections.map(section => <article key={section.category} className="ad-card">
      <p className="section-label">{labels[section.category]} / {section.weight}%</p>
      <div className={`placeholder ${section.category}`} role="img" aria-label={`Abstract illustrated placeholder for ${section.ad.name}`}><span aria-hidden="true">◯</span></div>
      <p className="eyebrow">FICTIONAL AD / ILLUSTRATED PLACEHOLDER</p>
      <h3>{section.ad.name}</h3>
      <p>{section.ad.description}</p>
      <p className="source-label">Source: Curio fictional fixture catalog · {section.ad.id}</p>
      <p>{section.commentary}</p>
      <p className="source-label">AI interpretation · not a verified factual claim</p>
    </article>)}
    <small>Issue {issue.id}</small>
  </section>
}
