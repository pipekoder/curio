import {z} from 'zod'
import {editorialStandard} from './editorial-standard'

export const EDITORIAL_TIER_VERSION='curio-editorial-tier-v1' as const
export type EditorialTierId='editors_pick'|'wild_perspectives'|'curious_findings'
export type EditorialTier={id:EditorialTierId;label:string;description:string}

// Editorial presentation categories, not public quality ratings. Numeric
// scores, thresholds and verdict terminology stay internal; readers see only
// the label and its friendly description. Boundaries reuse the weighted
// editorial model thresholds.
const tiers=[
  {id:'editors_pick',min:editorialStandard.thresholds.pass,label:"Editor's Pick",description:'A thoughtful selection, bringing together ideas, objects and perspectives worth exploring.'},
  {id:'wild_perspectives',min:editorialStandard.thresholds.revise,label:'Wild Perspectives',description:'An unexpected angle, a curious connection, or a different way of seeing familiar things.'},
  {id:'curious_findings',min:0,label:'Curious Findings',description:'Small discoveries, interesting details and ideas that invite a closer look.'},
] as const satisfies readonly {id:EditorialTierId;min:number;label:string;description:string}[]
export function editorialTierForScore(score:number):EditorialTier{
  const tier=tiers.find(row=>score>=row.min)??tiers[tiers.length-1]
  return {id:tier.id,label:tier.label,description:tier.description}
}
// Reader-facing label shape: label and description only, never scores.
export const editorialTierLabel=z.strictObject({label:z.string().min(1).max(80),description:z.string().min(1).max(300)})
export type EditorialTierLabel=z.infer<typeof editorialTierLabel>
