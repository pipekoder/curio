import { useReaderCatalog } from './ReaderCatalog'
import { approvedBrandLinks, hasExternalApproval, type CatalogItem } from '../shared/catalog'
import { isSafeSourcePage, type ExternalAssetApprovals } from '../shared/url-policy'

export const sourceLabels = { licensed_brand: 'Brand advertising', synthetic_concept: 'Synthetic concept', editorial_support: 'Editorial support · not an advertisement' }
export default function Attribution({ ad, externalApprovals }: { ad: CatalogItem; externalApprovals?: ExternalAssetApprovals }) {
  const context=useReaderCatalog()
  const approvals=externalApprovals??context.approvals
  return <div className="attribution">
    <p className="eyebrow">{sourceLabels[ad.sourceType]}</p>
    <p><strong>{ad.advertiser?.name ?? (ad.sourceType === 'editorial_support' ? 'Editorial supporting image' : 'No real advertiser · fictional study')}</strong></p>
    <p>{ad.campaign.title}</p>
    <p className="source-label">{ad.provenance.attribution} · {ad.licensing.status === 'placeholder_only' ? 'Placeholder only; no third-party ad license claimed' : ad.licensing.status === 'cleared' ? 'Rights evidence recorded' : 'Rights review pending'}</p>
    {ad.image.externalUrl && hasExternalApproval(ad, approvals) && ad.provenance.originalSourcePage && isSafeSourcePage(ad.provenance.originalSourcePage) && <p><a href={ad.provenance.originalSourcePage} target="_blank" rel="noopener noreferrer">View original source page <span aria-hidden="true">↗</span></a></p>}
    {ad.verifiedBrandLink && approvedBrandLinks[ad.id] === ad.verifiedBrandLink && isSafeSourcePage(ad.verifiedBrandLink) && <a href={ad.verifiedBrandLink} target="_blank" rel="noopener noreferrer">Visit verified brand <span aria-hidden="true">↗</span></a>}
    <details><summary>Source &amp; provenance</summary><p>{ad.description}</p><p>Catalog {ad.id} · Asset {ad.image.id}</p><p>Provenance evidence: {ad.provenance.evidence}</p>{ad.provenance.sourceUrl && <p>Source reference: {ad.provenance.sourceUrl}</p>}{ad.licensing.rightsHolder && <p>Rights holder: {ad.licensing.rightsHolder}</p>}{ad.licensing.evidence && <p>Rights evidence: {ad.licensing.evidence}</p>}{ad.campaign.reference && <p>Campaign reference: {ad.campaign.reference}</p>}<ul>{ad.provenance.modifications.map((entry, index) => <li key={`${entry.date}-${index}`}>{entry.date}: {entry.description}</li>)}</ul><p>Display/embedding: {ad.permissions.display.status}. AI image analysis: {ad.permissions.aiAnalysis.status}. Image edits: {ad.permissions.edits.status}. No image analysis or edits are performed here.</p><p>Advertiser verification: {ad.advertiser?.verification ?? 'Not applicable'}</p><p>Discoverable details: {ad.discoverableObjects.map(object => object.label).join(', ') || 'None recorded'}. These are catalog annotations, not SAM detections.</p></details>
  </div>
}
