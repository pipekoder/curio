import { catalogItem } from '../shared/catalog'

// Frontend-only fictional demo. This record is never sent to the editorial
// model, published through D1, or presented as a verified merchant listing.
export const chairDemo = catalogItem.parse({
  id: 'curio-fictional-arc-chair-v1', category: 'home',
  name: 'Arc Lounge Chair',
  description: 'A fictional lounge chair concept inspired by the rounded seat and enveloping back visible in this owner-supplied photograph.',
  lifestyleTags: ['Quiet Luxury', 'Nature & Outdoor'], sourceType: 'synthetic_concept',
  advertiser: { name: 'Curio Fictional Studio', verification: 'unverified', evidence: null },
  campaign: { title: 'Curio fictional chair study', reference: 'docs/PR30_CHAIR_DEMO.md' },
  image: { id: 'curio-owner-16-v1', path: '/editorial/read/16_read_chair.png', externalUrl: null, fallbackPath: null,
    alt: 'Owner-supplied photograph showing a rounded light-colored lounge chair by a sunlit archway.', width: 1122, height: 1402, role: 'supplied_image' },
  provenance: { origin: 'owner_supplied', sourceUrl: null, originalSourcePage: null, evidence: 'docs/PR30_CHAIR_DEMO.md',
    attribution: 'Owner-supplied editorial photograph · fictional Curio concept',
    modifications: [{ date: '2026-10-29', description: 'Linked the approved editorial photograph to a fictional frontend-only product study; no image edits.' }] },
  licensing: { status: 'cleared', rightsHolder: 'Owner-supplied Curio editorial asset', evidence: 'docs/PR30_CHAIR_DEMO.md' },
  permissions: { display: { status: 'approved', evidence: 'docs/PR30_CHAIR_DEMO.md' },
    aiAnalysis: { status: 'pending', evidence: null }, edits: { status: 'pending', evidence: null } },
  verifiedBrandLink: null,
  discoverableObjects: [{ id: 'chair-rounded-seat', label: 'Rounded seat and back',
    description: 'The photograph visibly shows a low, rounded seat and a curved back. Upholstery composition and maker are not verified.',
    grounding: 'catalog_metadata', productIdentity: 'Arc Lounge Chair — fictional Curio demo concept' }],
})

export const chairDemoDetails = {
  productId: chairDemo.id,
  price: { amount: 1850, currency: 'USD', status: 'fictional_demo_estimate' as const },
  assumptions: ['Rounded upholstered form (visible)', 'Textured, bouclé-like appearance (material unverified)', 'Low lounge proportions (visual estimate)'],
  hotspot: { x: 0.48, y: 0.66, source: 'manually_authored' as const },
} as const
