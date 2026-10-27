// TEST ONLY: reserved example.test domains and mock review evidence are not real
// advertiser approvals. This module is never imported by production source.
import { catalog, catalogItem } from '../shared/catalog'
import type { ExternalAssetApprovals } from '../shared/url-policy'
export const externalFixture = catalogItem.parse({
  ...catalog[0],
  image: { ...catalog[0].image, id: 'test-external-asset-v1', path: null, externalUrl: 'https://cdn.example.test/approved-image.webp', fallbackPath: '/catalog/home-lamp.svg', role: 'supplied_image', alt: 'Test-only cross-origin visual' },
  provenance: { ...catalog[0].provenance, origin: 'owner_supplied', sourceUrl: 'https://source.example.test/discovery', originalSourcePage: 'https://source.example.test/campaign/test' },
  licensing: { status: 'cleared', rightsHolder: 'Test fixture only', evidence: 'docs/TEST_ONLY.md' },
  permissions: { display: { status: 'approved', evidence: 'docs/TEST_ONLY.md' }, aiAnalysis: { status: 'pending', evidence: null }, edits: { status: 'pending', evidence: null } },
})
export const testExternalApprovals: ExternalAssetApprovals = {
  [externalFixture.image.id]: { url: externalFixture.image.externalUrl!, sourcePage: externalFixture.provenance.originalSourcePage!, displayEvidence: 'docs/TEST_ONLY.md' },
}
