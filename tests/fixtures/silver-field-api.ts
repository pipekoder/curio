import {editorialDemoCatalog,fallbackPlan} from '../../shared/editorial'
import {resolveEditorialInput} from '../../shared/editorial-intent'

// Deterministic, non-billable API example. D1/R2 examples are generated from
// synthetic uploads in media-studio.test.ts; no production IDs are fabricated.
export const authoredRequest={prompt:'Explore quiet reading rooms and paper lamps',consent:false} as const
const preferences=resolveEditorialInput(authoredRequest)
export const authoredResponse={
  plan:fallbackPlan(preferences,editorialDemoCatalog),
  items:editorialDemoCatalog,
  source:'deterministic',retrieval:'fictional',cached:false,
  inference:{attempted:false,reservedUnits:0,latencyMs:null,usage:null},
  fallbackReason:'disabled',editorialSources:[],
} as const
