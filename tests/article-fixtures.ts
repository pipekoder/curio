import type {CatalogItem} from '../shared/catalog'
import {ARTICLE_CONTRACT_VERSION, type EditorialArticleEdition} from '../shared/editorial-articles'

// Contract-compliant mock article edition: 5 articles x 3 images, mixed
// brands within each article, exact catalogId/assetId joins. Real article
// generation stays disabled; these fixtures drive frontend tests only.
const hex = (seed: number) => `version-${seed.toString(16).padStart(64, '0')}`
const PATHS = [
  '/editorial/read/08_ochre_lounge_chair.png',
  '/editorial/read/12_boucle_fabric_detail.png',
  '/editorial/read/16_read_chair.png',
] as const
const BRANDS = ['Atelier Nord', 'Casa Lumen', 'Studio Ferra', 'Maison Brume', 'Ostro Craft', 'Vela Form']

export function articleItemFixture(index: number): CatalogItem {
  const n = `${index}`.padStart(2, '0')
  return {
    id: `article-demo-${n}`,
    category: 'home',
    name: `Demo piece ${n}`,
    description: `Owner-supplied demo piece ${n} for article fixtures.`,
    lifestyleTags: ['Quiet Luxury'],
    sourceType: 'synthetic_concept',
    advertiser: null,
    campaign: {title: 'Article fixture study', reference: 'docs/full-catalog-articles.md'},
    image: {
      id: hex(index + 1), path: PATHS[index % PATHS.length], externalUrl: null, fallbackPath: null,
      alt: `Demo piece ${n} in a pale room.`, width: 367, height: 329, role: 'supplied_image',
    },
    provenance: {
      origin: 'owner_supplied', sourceUrl: null, originalSourcePage: null,
      evidence: 'docs/full-catalog-articles.md', attribution: `Fixture image ${n} · fictional context`,
      modifications: [],
    },
    licensing: {status: 'cleared', rightsHolder: 'Fixture rights holder', evidence: 'docs/full-catalog-articles.md'},
    permissions: {
      display: {status: 'approved', evidence: 'docs/full-catalog-articles.md'},
      aiAnalysis: {status: 'pending', evidence: null},
      edits: {status: 'pending', evidence: null},
    },
    verifiedBrandLink: null,
    discoverableObjects: [],
  }
}

export function articleEditionFixture(): {articleEdition: EditorialArticleEdition; items: CatalogItem[]} {
  const items = Array.from({length: 15}, (_, index) => articleItemFixture(index))
  const articles = Array.from({length: 5}, (_, article) => {
    const group = [0, 1, 2].map(slot => items[article * 3 + slot])
    const hero = group[0]
    return {
      id: `article-${hero.image.id}`,
      headline: `The quiet craft of demo article ${article + 1}`,
      deck: `A short introduction to demo article ${article + 1}.`,
      narrative: `First paragraph of demo article ${article + 1}.\n\nSecond paragraph of demo article ${article + 1}.`,
      heroAssetId: hero.image.id,
      images: group.map((item, slot) => ({
        catalogId: item.id,
        assetId: item.image.id,
        brandName: BRANDS[(article * 3 + slot) % BRANDS.length],
        brandSourceId: `${item.image.id}:brand_name`,
        productSourceIds: [`${item.image.id}:product_description`],
      })),
      sourceIds: group.map(item => `${item.image.id}:brand_name`),
    }
  })
  return {
    articleEdition: {version: ARTICLE_CONTRACT_VERSION, title: 'Fixture article edition', deck: 'Five fixture articles.', articles},
    items,
  }
}

export function articleResponseFixture(overrides: Record<string, unknown> = {}) {
  const {articleEdition, items} = articleEditionFixture()
  return {
    format: ARTICLE_CONTRACT_VERSION, source: 'meta', retrieval: 'd1', cached: false,
    articleEdition, items,
    generation: {version: 'curio-editorial-model-routing-v1', editorialMode: 'lite', chiefEditorModel: 'muse-spark-1.3', reviewerModel: 'muse-spark-1.3', revisionModel: null, confirmationModel: null},
    inference: {attempted: true, reservedUnits: 4, latencyMs: 1234, usage: null},
    ...overrides,
  }
}
