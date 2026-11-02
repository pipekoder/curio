import {z} from 'zod'

export const EDITORIAL_STANDARD_VERSION='curio-editorial-standard-v1' as const
export const editorialDimensions=['editorialQuality','discoveryValue','originality','narrativeCoherence','readability'] as const
export type EditorialDimension=(typeof editorialDimensions)[number]

export const editorialStandard={
  version:EDITORIAL_STANDARD_VERSION,
  thresholds:{pass:70,revise:50},
  hardRequirements:['fact_integrity','visual_grounding','brand_integrity','publication_permissions','exact_source_asset_identity','structural_validity','safety'],
  evidenceKinds:{
    factualClaim:'Requires an exact supporting owner-supplied factual source for the same asset.',
    visualObservation:'Must match an exact-version observation key and preserve its stated uncertainty.',
    editorialInterpretation:'May use subjective expression or metaphor without literal factual evidence when it does not contradict or masquerade as evidence.',
  },
  dimensions:{
    editorialQuality:{weight:30,definition:'Thoughtful magazine storytelling with a clear editorial perspective, never generic promotional copy.',criteria:['A distinct editorial idea shapes the edition.','The prose explains why visible details matter.','The language reads as independent editorial work rather than a product pitch.'],anchors:{0:'Promotional, incoherent or unusable.',1:'Mostly generic promotion with almost no editorial perspective.',2:'A weak perspective with substantial generic description.',3:'A credible magazine idea with uneven execution.',4:'A strong, thoughtful perspective sustained across the edition.',5:'Exceptional, precise storytelling with a memorable editorial point of view.'},positive:'Light becomes a compositional guide, moving attention from the narrow edge to the open volume.',negative:'Discover this beautiful and perfect design for modern living.'},
    discoveryValue:{weight:25,definition:'Reveals overlooked visual details, creates curiosity and encourages meaningful exploration.',criteria:['Features identify concrete supported details.','Questions open a relevant next path.','Connections help the reader notice something new.'],anchors:{0:'No supported detail or discovery path.',1:'Names obvious elements without insight.',2:'Offers limited observation or generic questions.',3:'Creates at least one useful path from detail to discovery.',4:'Repeatedly turns grounded details into meaningful curiosity.',5:'Makes the reader see the selected images differently through precise, connected discoveries.'},positive:'Notice how the narrow shadow interrupts the rounded silhouette; where does that tension lead next?',negative:'What else would you like to discover?'},
    originality:{weight:20,definition:'Distinctive, grounded perspectives without repetitive AI clichés.',criteria:['Headlines and narratives avoid interchangeable calm-language.','Features develop different ideas.','Metaphor remains clearly interpretive and evidence-compatible.'],anchors:{0:'Copied, repetitive or dominated by clichés.',1:'Nearly all language is interchangeable.',2:'Occasional specificity within formulaic prose.',3:'Several distinct ideas with minor repetition.',4:'Fresh, grounded language across the edition.',5:'A singular voice and surprising but disciplined interpretations throughout.'},positive:'The empty interval acts like punctuation, giving the heavier foreground form room to answer.',negative:'A timeless journey where quiet elegance meets serene beauty.'},
    narrativeCoherence:{weight:15,definition:'Meaningful connections, sequencing and editorial rhythm across selected advertisements.',criteria:['The title and deck establish the same inquiry.','Feature order develops rather than repeats the idea.','Connections accurately bridge adjacent selected assets.'],anchors:{0:'Contradictory or disconnected fragments.',1:'A list with no meaningful sequence.',2:'A loose theme with weak transitions.',3:'A coherent beginning, development and next step.',4:'A deliberate sequence with strong editorial rhythm.',5:'Every feature and connection advances one nuanced magazine-level argument.'},positive:'The first feature establishes scale; the second complicates it through contrast; the final question redirects it toward movement.',negative:'Each image is interesting in its own unique way.'},
    readability:{weight:10,definition:'Natural, engaging, clear and concise language.',criteria:['Sentences are easy to follow.','Word choice is precise rather than adjective-heavy.','Length and rhythm suit a visual magazine.'],anchors:{0:'Unreadable or structurally broken.',1:'Consistently awkward or confusing.',2:'Understandable but dense, repetitive or mechanical.',3:'Clear with minor awkwardness.',4:'Natural, concise and engaging.',5:'Effortless clarity with controlled rhythm and precise language.'},positive:'Shadow narrows the frame, then releases it into open space.',negative:'The beautifully sophisticated visuality dynamically facilitates an extremely compelling experiential moment.'},
  },
} as const

const score=z.number().int().min(0).max(5)
const dimensionReview=z.strictObject({score,reason:z.string().trim().min(1).max(300),evidenceRefs:z.array(z.string().trim().min(1).max(180)).max(8)})
export const editorialReviewOutput=z.strictObject({
  rubricVersion:z.literal(EDITORIAL_STANDARD_VERSION),
  dimensions:z.strictObject({editorialQuality:dimensionReview,discoveryValue:dimensionReview,originality:dimensionReview,narrativeCoherence:dimensionReview,readability:dimensionReview}),
  magazineFeedback:z.string().trim().min(1).max(600),
  featureFeedback:z.array(z.strictObject({assetId:z.string().max(100),strengths:z.array(z.string().trim().min(1).max(220)).max(4),issues:z.array(z.strictObject({severity:z.enum(['low','medium','high']),code:z.enum(['fact_integrity','visual_grounding','brand_integrity','generic_copy','weak_discovery','repetition','coherence','readability']),evidenceRefs:z.array(z.string().trim().min(1).max(180)).max(8),instruction:z.string().trim().min(1).max(260)})).max(6)})).max(8),
  revisionInstructions:z.array(z.string().trim().min(1).max(260)).max(8),
})
export type EditorialReviewOutput=z.infer<typeof editorialReviewOutput>
export type EditorialReviewDecision='PASS'|'REVISE'|'REJECT'

export function scoreEditorialReview(review:EditorialReviewOutput){
  const weighted=editorialDimensions.reduce((total,dimension)=>total+review.dimensions[dimension].score/5*editorialStandard.dimensions[dimension].weight,0)
  const score=Math.round(weighted*100)/100
  const decision:EditorialReviewDecision=score>=editorialStandard.thresholds.pass?'PASS':score>=editorialStandard.thresholds.revise?'REVISE':'REJECT'
  return {score,decision}
}

export const editorialStandardInstruction=`Shared Curio Editorial Standard ${EDITORIAL_STANDARD_VERSION}. ${JSON.stringify(editorialStandard)} Hard requirements override every score. Factual claims require an exact same-asset owner-supplied source. Visual observations require an exact-version observation key and must retain uncertainty. Editorial interpretations and metaphors are welcome when clearly subjective, evidence-compatible and not presented as product or brand facts. Never calculate or report a weighted total; Curio calculates it server-side.`
