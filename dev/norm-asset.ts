// Development-only module. Never import from the public app or production Worker.
import { localizationConcept, conceptDetail } from '../shared/object-localization'
import { imageDimensions } from '../worker/asset-classifier'
import { candidateIds } from '../worker/catalog-store'
import { understanding } from '../worker/asset-contracts'
import { catalogItem } from '../shared/catalog'

export const normAsset = Object.freeze({
  sha256: 'f226b4632fd63211dd59f050b84e715bf38da703d54fcffc7b5f99654777c774',
  width: 1600, height: 1201, mime: 'image/jpeg' as const, byteLength: 289305,
  originalUrl: 'https://assets.presscloud.com/file/35/354580808187535/Norm_Architects_A_Sense_of_Serenity_Karimoku_Case_Salone_del_Mobile_2025_JBP_47.jpg',
  versionKey: 'local-resized-f226b4632fd63211',
  evidence: 'docs/NORM_LOCAL_VALIDATION.md',
})
export async function verifyNormBytes(bytes: Uint8Array) {
  if (bytes.length !== normAsset.byteLength) throw Error('Norm exact byte length mismatch')
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), n => n.toString(16).padStart(2, '0')).join('')
  if (hash !== normAsset.sha256) throw Error('Norm exact fingerprint mismatch')
  const [width, height] = imageDimensions(bytes, normAsset.mime)
  if (width !== normAsset.width || height !== normAsset.height) throw Error('Norm dimensions mismatch')
  return { ...normAsset, ...await candidateIds(normAsset.originalUrl, normAsset.versionKey) }
}
export async function normDataUrl(bytes: Uint8Array) {
  await verifyNormBytes(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return `data:image/jpeg;base64,${btoa(binary)}`
}
export async function normObservation(raw: unknown) {
  const value = understanding.parse(raw)
  const { versionId } = await candidateIds(normAsset.originalUrl, normAsset.versionKey)
  if (value.versionId !== versionId || value.imageSha256 !== normAsset.sha256 || !value.observations) throw Error('Missing or stale exact-version observations')
  return value
}
// Geometry binding only. This record is deliberately NOT publishable. No brand,
// product identity, material, licensing or public-display approval is inferred.
export async function normGeometryRecord() {
  const { assetId } = await candidateIds(normAsset.originalUrl, normAsset.versionKey)
  return catalogItem.parse({
    id: 'norm-local-test', category: 'home', name: 'Private owner-supplied test photograph',
    description: 'Resized local derivative for controlled validation only; not approved for publication.',
    lifestyleTags: ['Scandinavian'], sourceType: 'editorial_support', advertiser: null,
    campaign: { title: 'Local validation, campaign unverified', reference: null },
    image: { id: assetId, path: null, externalUrl: normAsset.originalUrl, alt: 'Private validation photograph; not a public catalog image.', width: normAsset.width, height: normAsset.height, role: 'supplied_image' },
    provenance: { origin: 'owner_supplied', sourceUrl: normAsset.originalUrl, originalSourcePage: normAsset.originalUrl, evidence: normAsset.evidence, attribution: 'Owner-provided Norm/Presscloud source; credits and rights unverified.', modifications: [{ date: '2026-10-28', description: 'Owner supplied resized JPEG, 1600 by 1201, for local testing.' }] },
    licensing: { status: 'pending', rightsHolder: null, evidence: null },
    permissions: { display: { status: 'pending', evidence: null }, aiAnalysis: { status: 'pending', evidence: null }, edits: { status: 'pending', evidence: null } },
    verifiedBrandLink: null,
    discoverableObjects: [{ id: 'norm-local-detail', label: 'seating', description: 'Operator segmentation query, not a verified product identity.', grounding: 'catalog_metadata', productIdentity: null }, ...localizationConcept.options.map(concept=>({id:conceptDetail(concept),label:concept,description:'Muse-guided localization query; appearance, not verified product identity.',grounding:'catalog_metadata' as const,productIdentity:null}))],
  })
}
