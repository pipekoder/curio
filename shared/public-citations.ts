import {z} from 'zod'

export const PUBLIC_CITATIONS_VERSION='curio-public-citations-v1' as const
const versionId=z.string().regex(/^version-[a-f0-9]{64}$/)
export const publicCitationSource=z.strictObject({
  sourceId:z.string().max(180),passageId:z.string().max(180),canonicalUrl:z.url().max(2048),
  publication:z.string().max(160).nullable(),
  support:z.strictObject({kind:z.enum(['reviewed_paraphrase','approved_excerpt']),text:z.string().min(1).max(500)}),
})
export const publicCitation=z.strictObject({
  claimId:z.string().max(80),sourceId:z.string().max(180),narrativeText:z.string().min(5).max(200),
  claimKind:z.enum(['factual','comparison','interpretation']),
  evidenceStatus:z.literal('operator_reviewed'),reviewStatus:z.literal('approved'),
  sources:z.array(publicCitationSource).min(1).max(6),
})
export const publicCitations=z.strictObject({
  version:z.literal(PUBLIC_CITATIONS_VERSION),
  features:z.array(z.strictObject({featureIndex:z.number().int().min(0).max(5),catalogId:z.string().max(80),assetId:versionId,headline:z.string().max(400),citations:z.array(publicCitation).min(1).max(4)})).max(6),
})
export type PublicCitations=z.infer<typeof publicCitations>
