import type { CatalogItem } from '../shared/catalog'
import CatalogImage from './CatalogImage'

// Noninteractive geometry gains emphasis only from actual form state/focus.
export function EntryHud() {
  return <div className="entry-hud" aria-hidden="true">
    <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid meet">
      <ellipse cx="600" cy="300" rx="530" ry="230" transform="rotate(-9 600 300)" />
      <path d="M90 360C160 80 930 30 1120 280M165 470C420 590 1030 500 1090 160" />
      <path d="M330 100C140 310 630 590 1010 410" />
      <circle cx="147" cy="223" r="3" /><circle cx="1025" cy="172" r="3" />
      <circle className="hud-focus-point" cx="865" cy="477" r="4" />
    </svg>
    <span className="hud-coordinate">01 / FOLLOW AN IDEA</span>
    <span className="holographic-orb" />
  </div>
}

export function EditionAssembly({ items }: { items: readonly CatalogItem[] }) {
  return <section className="edition-assembly" role="status" aria-label="Edition assembly" aria-live="polite">
    <div className="assembly-heading"><span className="eyebrow">02 / COMPOSE</span><p>Composing your issue…</p><span>Editorial response pending</span></div>
    <div className="assembly-planes" aria-hidden="true">
      {items.slice(0, 3).map((ad, index) => <div className="assembly-plane" key={ad.image.id}>
        <CatalogImage ad={ad} eager /><span>0{index + 1} / {ad.name}</span>
      </div>)}
    </div>
    <p className="assembly-note">Approved illustration studies. Your edition will appear when the request finishes; an authored fallback remains available.</p>
  </section>
}

export function DiscoveryTrail({ title, thread }: { title: string; thread: {detail: string; relationship: string} | null }) {
  return <ol className="discovery-trail" aria-label="Current discovery trail">
    {thread && <><li><span>Visual detail</span><strong>{thread.detail}</strong></li>
      <li><span>Editorial connection</span><strong>{thread.relationship.replaceAll('-', ' ')}</strong></li></>}
    <li aria-current="step"><span>Current story</span><strong>{title}</strong></li>
  </ol>
}
