import { approvedExternalAssets,type ExternalAssetApprovals } from './url-policy';
import {
  editorialPlan,
  validateOriginalPlan,
  type EditorialPreferences,
} from "./editorial";
import { visualPhrase, visualNarrative } from "./editorial-language";
import type { CatalogItem } from "./catalog";
import { evaluateChiefEditor,type ChiefEditorIssue } from './editorial-chief';
import type {EditorialSource} from './editorial-sources';
import type {VisualContext} from './visual-observations';

// Fixed codes and bounded structural paths only. Never return provider prose,
// unknown words, schema messages, URLs, identifiers, or raw model output.
export type EditorialDiagnostic = { code: string; field: string };
const rules: Record<string, string> = {
  "Unapproved editorial asset": "asset_permission_or_pair",
  "Unreviewed editorial copy": "asset_theme_or_copy",
  "Unreviewed editorial source": "source_reference",
  "Ungrounded editorial connection": "connection_grounding",
  "Original visual interpretation required": "original_language",
  "Repeated editorial copy": "repeated_copy",
  "Focused edition is too broad": "focused_coverage",
  "Insufficient editorial coverage": "insufficient_coverage",
  "Editorial rhythm required": "layout_diversity",
  "Dominant preference must lead": "dominant_category",
  "Balanced category coverage required": "balanced_coverage",
  "Complete editorial thread required": "connection_count",
  "Sequential editorial connection required": "connection_sequence",
};
const chiefFields:Record<ChiefEditorIssue,string>={unsafe_editorial_language:'plan',factual_source_in_prose:'plan',bounded_copy:'plan',generic_description:'plan',repetitive_copy:'features',unsupported_observation:'features',missing_discovery_grounding:'features',unsupported_source:'features',unsupported_subject:'features',unsupported_material:'features'}
export function chiefEditorIssueDiagnostic(issue:ChiefEditorIssue):EditorialDiagnostic{return{code:`chief_${issue}`,field:chiefFields[issue]}}
export function diagnoseChiefEditorPlan(input:unknown,contexts:readonly VisualContext[],sources:readonly EditorialSource[]):EditorialDiagnostic|null{
 const parsed=editorialPlan.safeParse(input);if(!parsed.success||parsed.data.qualityVersion!==3)return null
 const issue=evaluateChiefEditor(parsed.data,contexts,sources);return issue?chiefEditorIssueDiagnostic(issue):null
}
export function diagnoseOriginalPlan(
  input: unknown,
  pool: readonly CatalogItem[],
  prefs: EditorialPreferences,
  approvals:ExternalAssetApprovals=approvedExternalAssets,
  sources:readonly EditorialSource[]=[],
  contexts:readonly VisualContext[]=[],
): EditorialDiagnostic | null {
  try {
    validateOriginalPlan(input, pool, prefs, approvals,sources,contexts);
    return null;
  } catch (error) {
    const parsed = editorialPlan.safeParse(input);
    if (!parsed.success) return { code: "plan_schema", field: "plan" };
    const plan = parsed.data;
    if(plan.qualityVersion===3){
      const chief=diagnoseChiefEditorPlan(plan,contexts,sources);if(chief)return chief
      return {code:error instanceof Error?rules[error.message]??'plan_schema':'plan_schema',field:'plan'}
    }
    const phrases = [
      ["title", plan.title, 80],
      ...plan.features.map((f, i) => [`features.${i}.headline`, f.headline, 90]),
    ] as [string, string, number][];
    for (const [field, value, max] of phrases) {
      if (!visualPhrase(value))
        return { code: "visual_vocabulary_or_characters", field };
      if (value.length > max || value.split(/\s+/).length > 12)
        return { code: "phrase_length", field };
    }
    const narratives = [
      ["deck", plan.deck],
      ...plan.features.map((f, i) => [`features.${i}.narrative`, f.narrative]),
      ...(plan.connections ?? []).map((c, i) => [`connections.${i}.thread`, c.thread]),
    ];
    for (const [field, value] of narratives) {
      if (!visualPhrase(value))
        return { code: "visual_vocabulary_or_characters", field };
      if (!visualNarrative(value))
        return { code: "hypothetical_sentence_format", field };
    }
    return {
      code: error instanceof Error ? rules[error.message] ?? "plan_schema" : "plan_schema",
      field: "plan",
    };
  }
}
