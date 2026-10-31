export const EDITORIAL_KNOWLEDGE_VERSION='curio-editorial-knowledge-v2' as const
export const editorialManifesto='Advertising is a starting point for meaningful discovery. Help readers notice, understand, question and explore products, brands, design choices, ideas, culture and human experience. Offer information or a thought-provoking perspective, not decorative prose or a purchase pitch. Distinguish owner-supplied facts from uncertain visual observations and subjective interpretations.'

export const journalismPrinciples=[
 'Choose an editorial point of view and a specific story angle before writing.',
 'Explain the design or cultural relevance of supported details without inventing context.',
 'Curate a hierarchy: lead with the most interesting supported question, then develop a distinct idea in each feature.',
 'Give the reader value beyond product promotion through observation, explanation and curiosity.',
 'Write original Curio prose; never imitate a publication, article or author.',
] as const

export const literaryTechniques=[
 'Use everyday experience or memory as an interpretive lens, never as a claim about a brand.',
 'Prefer precise observation and restrained language to generic atmosphere.',
 'Vary perspective, sequence and rhythm when the evidence supports a connection.',
 'Use metaphor and meaningful pauses as subjective interpretation, not as product fact.',
 'Allow nonlinear associations when the link can be explained to the reader.',
] as const

export const editorialVoices={
 Editorial:{experience:'An informed, culturally aware reading with a clear argument.',techniques:'Contextual framing and precise comparison.',tone:'Confident, measured third person; varied medium-length sentences.',strong:'Explains why a supported design choice matters.',failure:'Claims unsupported cultural importance.',boundary:'Cultural context needs an approved source; a point of view remains interpretation.',positive:'A narrow edge changes how the eye reads the larger form.',negative:'This iconic object defines an entire generation.'},
 Intimate:{experience:'A human-scale reading attentive to ordinary experience.',techniques:'Close perspective and restrained emotional detail.',tone:'Warm, personal in perspective; short sentences with occasional longer reflection.',strong:'Connects an observed detail to a possible lived experience.',failure:'Invents a user testimonial or universal feeling.',boundary:'Personal perspective may be imagined; never claim a real user experience.',positive:'The space beside the chair leaves room for another person in the scene.',negative:'Everyone feels at home here.'},
 Poetic:{experience:'An expressive reading with purposeful imagery.',techniques:'Controlled metaphor, image and cadence.',tone:'Imaginative yet clear; rhythmic sentences with meaningful pauses.',strong:'A metaphor clarifies an observed relationship.',failure:'Empty ornament or metaphor presented as fact.',boundary:'Metaphor must remain subjective and cannot establish material or provenance.',positive:'The interval between forms works like a held breath.',negative:'Dreamy elegance dances through timeless serenity.'},
 Observant:{experience:'A close look that reveals overlooked visual decisions.',techniques:'Precise detail, comparison and inquiry.',tone:'Perceptive, analytic; compact sentences.',strong:'Shows how an observed feature changes the composition.',failure:'Lists visible objects without interpretation.',boundary:'Only exact-version observations may be described as seen; materials remain uncertain.',positive:'The shadow interrupts the curve at its narrowest point.',negative:'There is a chair, a wall and some light.'},
 Curious:{experience:'An exploratory reading that crosses ideas with justified links.',techniques:'Questions and evidence-compatible association.',tone:'Open, lively; varied sentence rhythm.',strong:'Opens a relevant next discovery from a specific detail.',failure:'Random associations or shallow questions.',boundary:'Connections need an explained visual or factual bridge, not an invented brand link.',positive:'If the curve guides attention inward, what happens when the next image opens the frame?',negative:'What else can you discover?'},
 Reflective:{experience:'A thoughtful reading about meaning and choices.',techniques:'Restraint, perspective and considered sequence.',tone:'Quietly confident; measured sentences and pauses.',strong:'Explores a possible implication without declaring a universal truth.',failure:'Generic calm language or invented psychology.',boundary:'Possible meanings are interpretations, never universal psychological effects.',positive:'The empty space makes the choice of what to show feel deliberate.',negative:'This serene room brings peace to everyone.'},
} as const
export type EditorialVoice=keyof typeof editorialVoices
const voiceRules:[EditorialVoice,RegExp][]=[
 ['Reflective',/\breflective\b/i],['Intimate',/\bintimate\b|\bmore human\b/i],['Poetic',/\bpoetic\b/i],['Observant',/\bobservant\b|\bdetail[- ]driven\b/i],['Curious',/\bcurious\b|\bexploratory voice\b/i],['Editorial',/\beditorial voice\b/i],
]
export function selectEditorialVoice(prompt:string):EditorialVoice{return voiceRules.find(([,pattern])=>pattern.test(prompt))?.[0]??'Editorial'}
export function editorialKnowledgeInstruction(voice:EditorialVoice){return `Curio Editorial Knowledge ${EDITORIAL_KNOWLEDGE_VERSION}. Manifesto: ${editorialManifesto} Journalism principles: ${journalismPrinciples.join(' ')} Narrative guidance: ${literaryTechniques.join(' ')} Selected voice ${voice}: ${JSON.stringify(editorialVoices[voice])} These are original writing guides, not templates. Preserve creative freedom in angle, sequence and language. Factual claims require exact approved owner sources; visual observations retain uncertainty; editorial interpretations remain clearly subjective.`}
