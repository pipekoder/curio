import { useState } from 'react'
import type { CatalogItem } from '../shared/catalog'

export default function CatalogImage({ ad, eager = false }: { ad: CatalogItem; eager?: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(ad.image.path ? 'loading' : 'error')
  return <figure className={`catalog-figure image-${state}`}>
    {state === 'error' ? <div className="image-fallback" role="img" aria-label={ad.image.alt}><span>Image unavailable</span><small>The catalog record and its attribution remain available.</small></div> : <>
      {state === 'loading' && <span className="image-loading" aria-hidden="true">Loading image…</span>}
      <img src={ad.image.path!} alt={ad.image.alt} width={ad.image.width} height={ad.image.height}
        loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={() => setState('ready')} onError={() => setState('error')} />
    </>}
    <figcaption>{ad.image.role === 'placeholder' ? 'Original illustration · fictional placeholder' : ad.sourceType === 'editorial_support' ? 'Editorial supporting image' : ad.sourceType === 'synthetic_concept' ? 'Synthetic advertising concept' : 'Brand campaign image'}</figcaption>
  </figure>
}
