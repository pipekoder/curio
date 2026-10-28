import { useReaderCatalog } from './ReaderCatalog'
import { useEffect, useRef, useState } from 'react'
import { displaySource, type CatalogItem } from '../shared/catalog'
import { type ExternalAssetApprovals } from '../shared/url-policy'

export default function CatalogImage({ ad, eager = false, externalApprovals, onImageReady, onImageUnavailable }: {
  ad: CatalogItem; eager?: boolean; externalApprovals?: ExternalAssetApprovals; onImageReady?: (image: { src: string; width: number; height: number }) => void; onImageUnavailable?: () => void
}) {
  const context=useReaderCatalog()
  const primary = displaySource(ad, externalApprovals??context.approvals)
  const [attempt, setAttempt] = useState<'primary' | 'fallback' | 'missing'>(primary ? 'primary' : 'missing')
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(eager)
  const figureRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (visible || !figureRef.current) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(figureRef.current)
    return () => observer.disconnect()
  }, [visible])
  const src = attempt === 'primary' ? primary : attempt === 'fallback' ? ad.image.fallbackPath : null
  const useFallback = () => {
    onImageUnavailable?.()
    setReady(false)
    setAttempt(attempt === 'primary' && ad.image.externalUrl && ad.image.fallbackPath ? 'fallback' : 'missing')
  }
  useEffect(() => {
    if (!src || ready || !visible || attempt !== 'primary' || !ad.image.externalUrl) return
    const timer = setTimeout(() => {
      onImageUnavailable?.()
      setAttempt(current => current === 'primary' && ad.image.externalUrl && ad.image.fallbackPath ? 'fallback' : 'missing')
    }, 10000)
    return () => clearTimeout(timer)
  }, [src, ready, visible, attempt, ad.image.externalUrl, ad.image.fallbackPath, onImageUnavailable])
  const fallback = attempt === 'fallback'
  const caption = fallback ? 'Fictional fallback illustration · Curio original geometry; external image unavailable' :
    ad.image.role === 'placeholder' ? 'Original illustration · fictional placeholder' : ad.sourceType === 'editorial_support' ? 'Editorial supporting image' : ad.sourceType === 'synthetic_concept' ? 'Synthetic advertising concept' : 'Brand campaign image'
  return <figure ref={figureRef} className={`catalog-figure image-${!src ? 'error' : ready ? 'ready' : 'loading'}`}>
    {!src ? <div className="image-fallback" role="img" aria-label={ad.image.alt}><span>Image unavailable</span><small>The catalog record and its attribution remain available.</small></div> : <>
      {!ready && <span className="image-loading" aria-hidden="true">Loading image…</span>}
      <img key={src} src={src} alt={fallback ? 'Fictional fallback illustration; the original external image is unavailable.' : ad.image.alt}
        width={ad.image.width} height={ad.image.height} loading={eager ? 'eager' : 'lazy'} decoding="async"
        referrerPolicy="no-referrer" onLoad={event => { setReady(true); onImageReady?.({ src: src!, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) }} onError={useFallback} />
    </>}
    <figcaption>{caption}</figcaption>
  </figure>
}
