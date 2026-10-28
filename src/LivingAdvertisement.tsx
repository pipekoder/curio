import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { groupObjects, type ObjectHint } from '../shared/object-groups'
import { readerSegmentation, containRect, relatedDiscovery } from '../shared/decoder'
import { curationCatalog, type CatalogItem } from '../shared/catalog'
import { authoredVisualContext, relatedVisualStory, visualLabel } from '../shared/visual-observations'
import CatalogImage from './CatalogImage'

export default function LivingAdvertisement({ ad, eager = false, samResult, objectHints, onExploreStory }: { ad: CatalogItem; eager?: boolean; samResult?: unknown; objectHints?: Readonly<Record<string, ObjectHint>>; onExploreStory?: (next: CatalogItem, detail: string, relationship: string) => void }) {
  const demo = readerSegmentation(ad, samResult)
  const grouped = demo ? groupObjects(demo, objectHints) : null
  const [hovered, setHovered] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ assetId: string; regionId: string } | null>(null)
  const selected = selection?.assetId === ad.image.id ? grouped?.objects.find(r => r.id === selection.regionId) ?? null : null
  const highlighted = selected ?? grouped?.objects.find(r => r.id === hovered) ?? null
  const [question, setQuestion] = useState(false)
  const [related, setRelated] = useState(false)
  const [loadedAsset, setLoadedAsset] = useState<string | null>(null)
  const ready = loadedAsset === ad.image.id
  const [rect, setRect] = useState<ReturnType<typeof containRect>>(null)
  const visual = useRef<HTMLDivElement>(null)
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const uid = useId().replace(/:/g, '')
  const panelId = `${uid}-reveal`
  const onReady = useCallback((image: { src: string; width: number; height: number }) => {
    setLoadedAsset(image.src === (ad.image.externalUrl ?? ad.image.path) && image.width === ad.image.width && image.height === ad.image.height ? ad.image.id : null)
  }, [ad.image.id, ad.image.path, ad.image.externalUrl, ad.image.width, ad.image.height])
  const unavailable = useCallback(() => { setLoadedAsset(null); setSelection(null) }, [])
  useEffect(() => {
    const element = visual.current, image = element?.querySelector('img')
    if (!ready || !element || !image) { setRect(null); return }
    const update = () => {
      const bounds = image.getBoundingClientRect(), parent = element.getBoundingClientRect()
      const content = containRect(bounds.width, bounds.height, ad.image.width, ad.image.height)
      setRect(content ? { ...content, x: content.x + bounds.left - parent.left, y: content.y + bounds.top - parent.top } : null)
    }
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(image)
    window.addEventListener('resize', update)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update) }
  }, [ready, ad.image.width, ad.image.height])
  const close = () => {
    if (selected) buttons.current[selected.id]?.focus()
    setSelection(null); setHovered(null); setQuestion(false); setRelated(false)
  }
  const detail = ad.discoverableObjects.find(item => item.id === selected?.detailId)
  const next = relatedDiscovery(ad)
  const visualContext = authoredVisualContext(ad)
  const visualStory = relatedVisualStory(ad, curationCatalog)
  return <div className="living-ad" onKeyDown={event => { if (event.key === 'Escape' && selected) { event.preventDefault(); close() } }}>
    <div className="living-visual" ref={visual}>
      <CatalogImage ad={ad} eager={eager} onImageReady={onReady} onImageUnavailable={unavailable} />
      {ready && rect && demo && <div className="living-overlay" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
        {highlighted && <svg className="region-dimming" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <defs><mask id={`${uid}-mask`}><rect width="1000" height="1000" fill="white" /><rect x={highlighted.box.x * 1000} y={highlighted.box.y * 1000} width={highlighted.box.width * 1000} height={highlighted.box.height * 1000} fill="black" /></mask></defs>
          <rect width="1000" height="1000" fill="#101b14" opacity=".12" mask={`url(#${uid}-mask)`} />
          <rect x={highlighted.box.x * 1000} y={highlighted.box.y * 1000} width={highlighted.box.width * 1000} height={highlighted.box.height * 1000} fill="none" stroke="#f8f3e5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>}
        {grouped?.objects.map((region, index) => <button type="button" key={region.id} ref={node => { buttons.current[region.id] = node }} className="image-hotspot"
          style={{ left: `${(region.box.x + region.box.width / 2) * 100}%`, top: `${(region.box.y + region.box.height / 2) * 100}%` }}
          aria-label={`Explore ${ad.discoverableObjects.find(item => item.id === region.detailId)?.label}${demo.source === 'sam_detection' && (grouped?.objects.length ?? 0) > 1 ? `, region ${index + 1}` : ''}`} aria-expanded={selected?.id === region.id} aria-controls={panelId}
          onPointerEnter={() => setHovered(region.id)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(region.id)} onBlur={() => setHovered(null)}
          onClick={() => { setSelection({ assetId: ad.image.id, regionId: region.id }); setQuestion(false); setRelated(false) }}><span aria-hidden="true" className="hotspot-spark">+</span><span className="sr-only">Detail {index + 1}</span></button>)}
      </div>}
    </div>
    {ready && demo?.source === 'sam_detection' && (grouped?.objects.length ?? 0) > 1 && <details className="object-index"><summary>Explore image details</summary><nav aria-label="Image details">{grouped?.objects.map((region,index) => <button type="button" key={region.id} onClick={() => { setSelection({assetId:ad.image.id,regionId:region.id});setQuestion(false);setRelated(false) }}>Open {ad.discoverableObjects.find(d=>d.id===region.detailId)?.label} context {index+1}</button>)}</nav><p>Separate entries remain available even when approximate detections overlap.</p></details>}
    {samResult !== undefined && !demo && <p className="decoder-disclosure" role="status">Segmentation unavailable or no longer authorized. No model call.</p>}
    {demo && <p className="decoder-disclosure">{demo.source === "sam_detection" ? "SAM 3.1 structured regions · model estimates, not verified identity. Operator-supplied result; no new model call." : "Living advertisement demo · authored regions and commentary (mock segmentation), not SAM detections. No model call."} {ready ? demo.regions.length ? 'Follow a small light to look closer.' : 'No matching regions were returned. No object identity is inferred.' : 'Details become available when the original illustration loads.'}</p>}
    <div id={panelId} hidden={!selected}>
    {selected && detail && ready && <section className="editorial-reveal" role="region" aria-label={`${detail.label} editorial reveal`}>
      <div className="reveal-heading"><p className="eyebrow">{demo?.source === "sam_detection" ? "LOOK CLOSER / MODEL ESTIMATE" : "LOOK CLOSER / AUTHORED DEMO"}</p><button type="button" onClick={close}>Return to original image</button></div>
      <h4>{detail.label}</h4><p>{detail.description}</p>
      {visualContext && <aside className="visual-observation" aria-label="Visual detail context">
        <p className="eyebrow">01 / NOTICE THE RELATIONSHIP</p>
        <p className="visual-motif">{visualLabel(visualStory?.relationship ?? visualContext.observations.relationships[0])}</p>
        <dl><div><dt>Visual subject</dt><dd>{visualContext.observations.subjects.map(visualLabel).join(", ")}</dd></div>
          <div><dt>Material appearance</dt><dd>{visualContext.observations.materialAppearance.map(visualLabel).join(", ")}</dd></div>
          <div><dt>Drawn environment</dt><dd>{visualContext.observations.environments.map(visualLabel).join(", ")}</dd></div></dl>
        <p>Image-level authored observations of this original illustration, not AI image analysis or verified material facts. They do not identify the selected detail’s material. A drawn appearance does not identify a real product.</p>
        {visualStory && onExploreStory && <div className="visual-next-story">
          <p className="eyebrow">02 / FOLLOW A VISUAL THREAD</p>
          <CatalogImage ad={visualStory.ad} />
          <p>Look for {visualLabel(visualStory.relationship)} in another composition. This is an authored visual connection, not evidence of shared origin or influence.</p>
          <button type="button" onClick={() => onExploreStory(visualStory.ad, detail.label, visualStory.relationship)}>Read the connected story: {visualStory.ad.name} →</button>
        </div>}
      </aside>}
      <p className="source-label">{ad.advertiser?.name ?? 'No real advertiser · fictional study'} · {ad.campaign.title}</p>
      <details className="annotation-provenance"><summary>Raw detections and grouping</summary><p>Approximate boxes, not pixel masks. {selected.memberIds.length} raw region(s); grouping: {selected.grouping}. Overlap alone does not establish object identity.</p><ul>{demo?.regions.map(r => <li key={r.id}>{r.id}: x {r.box.x.toFixed(3)}, y {r.box.y.toFixed(3)}, width {r.box.width.toFixed(3)}, height {r.box.height.toFixed(3)}</li>)}</ul></details>
      <details className="annotation-provenance"><summary>How this detail was annotated</summary><p>Source: {ad.id} / {ad.image.id}. {demo?.source === "sam_detection" ? "Region is a model-estimated bounding box, not a verified product identity. A mask is not rendered or edited." : "Region is an approximate authored box, not a measured mask. No model confidence or verified product identity is claimed."}</p></details>
      <button type="button" aria-expanded={question} onClick={() => setQuestion(!question)}>Why does this composition feel calm?</button>
      {question && <p className="context-annotation">Authored interpretation: the spacing around this drawn detail and its relationship to the surrounding shapes can suggest a slower visual rhythm. This is a subjective reading, not a material, brand or product claim.</p>}
      {next && !onExploreStory && <><button type="button" aria-expanded={related} onClick={() => setRelated(!related)}>Explore a related discovery</button>
        {related && <aside className="related-discovery" aria-label="Related catalog discovery"><strong>{next.name}</strong><p>{next.description}</p><p>Connection: another approved {ad.category} catalog study. This is a local selection, not a newly generated page or an AI recommendation.</p><p>{next.provenance.attribution} · {next.sourceType}</p></aside>}</>}
      <p className="source-label" aria-live="polite">Selected: {detail.label}. Escape returns to the unchanged original image.</p>
    </section>}
    </div>
  </div>
}
