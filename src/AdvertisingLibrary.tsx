import { memo, useState } from 'react'
import { categories, lifestyles, localCatalogRepository, isPublishable } from '../shared/catalog'
import type { CatalogPreview } from '../shared/magazine'
import CatalogImage from './CatalogImage'
import Attribution from './Attribution'
import Magazine from './Magazine'

const items = localCatalogRepository.list().filter(item => isPublishable(item))
const previewAds = categories.flatMap(category => {
  const ad = items.find(item => item.category === category)
  return ad ? [ad] : []
})
const sample: CatalogPreview = {
  id: '00000000-0000-4000-8000-000000000003', title: 'A slower kind of discovery.', layoutIntent: 'airy', source: 'catalog_preview',
  sections: previewAds.map((ad, index) => ({ category: ad.category, weight: previewAds.length === 3 ? (index === 0 ? 40 : 30) : Math.floor(100 / previewAds.length) + (index === 0 ? 100 % previewAds.length : 0), ad, commentary: ad.sourceType === 'synthetic_concept' ? 'Look closer at the shapes, the space between them, and the quiet rhythm of this fictional composition.' : 'Look closer at the composition. Consult the attribution and source record for verified details.', commentarySource: 'authored_fixture_commentary' })),
}
function AdvertisingLibrary() {
  const [category, setCategory] = useState('all')
  const [lifestyle, setLifestyle] = useState('all')
  const [reading, setReading] = useState(false)
  const placeholderOnly = items.every(item => item.image.role === 'placeholder')
  const visible = items.filter(item => (category === 'all' || item.category === category) && (lifestyle === 'all' || item.lifestyleTags.some(tag => tag === lifestyle)))
  return <section className="advertising-library" aria-labelledby="library-heading">
    <div className="section-label"><span>THE ADVERTISING LIBRARY</span><span>VOLUME 01 / {items.length} STUDIES</span></div>
    <h2 id="library-heading">Images worth a second look.</h2>
    <p className="library-intro">{placeholderOnly ? 'A place to discover the story behind an image. Our opening collection uses original geometric illustrations and fictional concepts while approved advertising is being sourced.' : 'Discover approved advertising, synthetic concepts and editorial support, with source, attribution and permission status kept beside every image.'}</p>
    <div className="library-toolbar"><label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(key => <option value={key} key={key}>{key === 'home' ? 'Home & Interior' : key === 'fashion' ? 'Fashion & Styling' : 'Travel & Places'}</option>)}</select></label>
      <label>Lifestyle<select value={lifestyle} onChange={e => setLifestyle(e.target.value)}><option value="all">All lifestyles</option>{lifestyles.map(tag => <option key={tag}>{tag}</option>)}</select></label>
      <button type="button" className="reader-toggle" disabled={!previewAds.length} aria-expanded={reading} aria-controls="sample-reader" onClick={() => setReading(!reading)}>{reading ? 'Close sample edition' : 'Read sample edition →'}</button>
    </div>
    <p aria-live="polite" className="source-label">{visible.length} image {visible.length === 1 ? 'slot' : 'slots'} in this selection</p>
    <div className="catalog-grid">{visible.map((ad, index) => <article key={ad.id} className="catalog-card"><CatalogImage ad={ad} eager={index < 2} /><h3>{ad.name}</h3><Attribution ad={ad} /><p className="catalog-tags">{ad.lifestyleTags.join(' / ')}</p></article>)}</div>
    {!visible.length && <p className="notice">No catalog images match both filters. Try another category or lifestyle.</p>}
    <div id="sample-reader">{reading && <Magazine key={sample.id} issue={sample} />}</div>
  </section>
}

export default memo(AdvertisingLibrary)
