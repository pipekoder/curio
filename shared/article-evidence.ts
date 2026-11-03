import {z} from 'zod'
export const ARTICLE_EVIDENCE_VERSION='curio-article-evidence-v1' as const
export const ARTICLE_INTERPRETATION_VERSION='curio-contextual-interpretation-v1' as const
const version=z.string().regex(/^version-[a-f0-9]{64}$/)
export const articleInterpretation=z.strictObject({
  id:z.string().regex(/^interpretation-[a-f0-9]{64}$/),assetVersionId:version,imageSha256:z.string().regex(/^[a-f0-9]{64}$/),
  intentDigest:z.string().regex(/^[a-f0-9]{64}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),observationDigest:z.string().regex(/^[a-f0-9]{64}$/),
  profileVersion:z.literal(ARTICLE_INTERPRETATION_VERSION),origin:z.literal('deterministic'),status:z.literal('editorial_perspective'),
  topic:z.string().max(40),focusQuestion:z.string().max(240),sourceIds:z.array(z.string().max(180)).min(1).max(12),
})
export const articleEvidencePack=z.strictObject({version:z.literal(ARTICLE_EVIDENCE_VERSION),interpretations:z.array(articleInterpretation).max(24)})
export type ArticleInterpretation=z.infer<typeof articleInterpretation>
export type ArticleEvidencePack=z.infer<typeof articleEvidencePack>
