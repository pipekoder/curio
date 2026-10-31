import { approvedExternalAssets,type ExternalAssetApprovals } from './url-policy';
import { z } from "zod";
import { observationKey, editorialV2Text, evaluateEditorialV2 } from "./editorial-v2";
import { evaluateChiefEditor, chiefEditorText } from './editorial-chief';
import type { EditorialSource } from './editorial-sources';
import { visualPhrase, visualNarrative } from "./editorial-language";
import {
  categories,
  lifestyles,
  curationCatalog,
  isPublishable,
  type CatalogItem,
} from "./catalog";
export const editorialDemoCatalog = curationCatalog.filter(
  (a) =>
    a.sourceType === "synthetic_concept" &&
    a.image.role === "placeholder" &&
    isPublishable(a),
);
export const editorialPreferences = z
  .strictObject({
    interests: z.string().trim().max(1000).default(""),
    aesthetics: z.array(z.enum(lifestyles)).min(1).max(8),
    allocations: z.strictObject({
      home: z.number().min(0).max(100),
      fashion: z.number().min(0).max(100),
      travel: z.number().min(0).max(100),
    }),
    mode: z.enum(["Focused", "Balanced", "Surprise Me"]),
    consent: z.boolean().default(false),
  })
  .refine(
    (p) =>
      Math.abs(Object.values(p.allocations).reduce((a, b) => a + b, 0) - 100) <
      0.001,
    "Category weights must total 100.",
  );
export type EditorialPreferences = z.infer<typeof editorialPreferences>;
const prose = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine(
    (s) => !/[<>]|https?:|javascript:|```/i.test(s),
    "Plain editorial text only.",
  );
export const editorialPlan = z
  .strictObject({
    qualityVersion: z.union([z.literal(2),z.literal(3)]).optional(),
    title: prose,
    deck: prose,
    connections: z
      .array(
        z.strictObject({
          fromAssetId: z.string().max(100),
          toAssetId: z.string().max(100),
          thread: prose,
        }),
      )
      .max(5)
      .optional(),
    features: z
      .array(
        z.strictObject({
          catalogId: z.string().max(80),
          assetId: z.string().max(100),
          observationKeys: z.array(observationKey).min(1).max(5).optional(),
          discoveryQuestion: prose.optional(),
          sourceIds: z.array(z.string().regex(/^[a-z0-9:_-]+$/).max(180)).min(1).max(12).optional(),
          headline: prose,
          narrative: prose,
          layout: z.enum(["hero", "split", "layered", "horizontal", "essay"]),
          motion: z.enum(["still", "reveal", "drift"]),
          theme: prose,
        }),
      )
      .min(1)
      .max(6),
  })
  .superRefine((p, ctx) => {
    if (p.qualityVersion !== 2 && p.qualityVersion !== 3 && p.features.some(f=>f.observationKeys || f.discoveryQuestion || f.sourceIds)) ctx.addIssue({code:"custom",message:"Versioned editorial grounding required."});
    if (p.qualityVersion === 3 && p.features.some(f=>!f.sourceIds?.length)) ctx.addIssue({code:'custom',message:'Chief Editor sources required.'});
    if (new Set(p.features.map((f) => f.assetId)).size !== p.features.length)
      ctx.addIssue({ code: "custom", message: "Duplicate assets." });
  });
export type EditorialPlan = z.infer<typeof editorialPlan>;
export function validatePlan(input: unknown, pool: readonly CatalogItem[], approvals:ExternalAssetApprovals=approvedExternalAssets, sources:readonly EditorialSource[]=[],technicalOnly=false ) {
  const p = editorialPlan.parse(input);
  for (const f of p.features) {
    const ad = pool.find(
      (a) =>
        isPublishable(a,approvals) && a.id === f.catalogId && a.image.id === f.assetId,
    );
    if (!ad) throw Error("Unapproved editorial asset");
    const copy = editorialCopy(ad);
    if (
      !(technicalOnly&&p.qualityVersion===3||copy.headlines.includes(f.headline) || (p.qualityVersion === 2 ? editorialV2Text(f.headline) : p.qualityVersion===3?chiefEditorText(f.headline):visualPhrase(f.headline))) ||
      !(
        technicalOnly&&p.qualityVersion===3||copy.narratives.includes(f.narrative) || (p.qualityVersion === 2 ? editorialV2Text(f.narrative) : p.qualityVersion===3?chiefEditorText(f.narrative):visualNarrative(f.narrative))
      ) ||
      !ad.lifestyleTags.some((t) => t === f.theme)
    )
      throw Error("Unreviewed editorial copy");
    if(p.qualityVersion===3&&(!f.sourceIds?.length||f.sourceIds.some(id=>!sources.some(source=>source.id===id&&source.assetId===f.assetId))))throw Error('Unreviewed editorial source')
  }
  for (const connection of p.connections ?? []) {
    if (
      connection.fromAssetId === connection.toAssetId ||
      !p.features.some((f) => f.assetId === connection.fromAssetId) ||
      !p.features.some((f) => f.assetId === connection.toAssetId) ||
      !(technicalOnly&&p.qualityVersion===3||(p.qualityVersion === 2 ? editorialV2Text(connection.thread) : p.qualityVersion===3?chiefEditorText(connection.thread):visualNarrative(connection.thread)))
    )
      throw Error("Ungrounded editorial connection");
  }
  if (p.qualityVersion === 2 && evaluateEditorialV2(p)) throw Error("Original visual interpretation required");
  return p;
}
export function interestTags(text: string) {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((t) => t.length > 2)
    .slice(0, 10);
}
export function rankDemo(
  p: EditorialPreferences,
  pool: readonly CatalogItem[] = editorialDemoCatalog,
) {
  const words = interestTags(p.interests);
  const ranked = pool
    .filter((a) => isPublishable(a) && p.allocations[a.category] > 0)
    .map((a) => {
      const hay = [
        a.name,
        a.description,
        ...a.lifestyleTags,
        ...a.discoverableObjects.map((o) => o.label),
      ]
        .join(" ")
        .toLowerCase();
      const relevance =
        p.allocations[a.category] / 100 +
        a.lifestyleTags.filter((t) => p.aesthetics.includes(t)).length * 0.35 +
        words.filter((w) => hay.includes(w)).length * 0.3;
      let seed = 0;
      for (const c of p.interests + a.id)
        seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
      return {
        a,
        score:
          relevance +
          (p.mode === "Surprise Me" ? ((seed % 1000) / 1000) * 0.5 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.a.id.localeCompare(b.a.id));
  if (p.mode === "Balanced") {
    const seen = new Set<string>();
    return [
      ...ranked.filter(({ a }) => {
        if (seen.has(a.category)) return false;
        seen.add(a.category);
        return true;
      }),
      ...ranked.filter(
        ({ a }) =>
          ranked.find((x) => x.a.category === a.category)?.a.id !== a.id,
      ),
    ].map((x) => x.a);
  }
  return ranked.map((x) => x.a);
}
export function fallbackPlan(
  p: EditorialPreferences,
  pool: readonly CatalogItem[] = editorialDemoCatalog,
  preserveOrder = false,
  approvals:ExternalAssetApprovals=approvedExternalAssets,
): EditorialPlan {
  const ranked = (
    preserveOrder
      ? pool.filter((a) => isPublishable(a,approvals) && p.allocations[a.category] > 0)
      : rankDemo(p, pool)
  ).slice(0, p.mode === "Focused" ? 3 : 6);
  const top = ranked[0];
  return validatePlan(
    {
      title: top
        ? `${top.category === "home" ? "The art of quiet rooms" : top.category === "fashion" ? "A study in silhouette" : "Into the open"}`
        : "An open invitation",
      deck: top?.category === "home"
        ? "A study of light, form and the spaces that invite us to pause."
        : top?.category === "fashion"
          ? "Follow folds, silhouettes and the rhythm of a different point of view."
          : "An invitation to wander between open paths and quieter horizons.",
      features: ranked.map((a, i) => ({
        catalogId: a.id,
        assetId: a.image.id,
        headline: editorialCopy(a).headlines[i % 3],
        narrative: editorialCopy(a).narratives[i % 3],
        layout: (p.mode === "Surprise Me"
          ? ["layered", "horizontal", "hero", "essay", "split", "layered"]
          : ["hero", "split", "layered", "horizontal", "essay", "split"])[i],
        motion: i % 3 === 0 ? "drift" : i % 3 === 1 ? "reveal" : "still",
        theme: a.lifestyleTags[0],
      })),
    },
    pool, approvals,
  );
}
export type EditorialEdition = {
  plan: EditorialPlan;
  source: "deterministic" | "meta";
  retrieval: "d1" | "fictional";
  cached: boolean;
  items: CatalogItem[];
  editorialSources?: EditorialSource[];
};
export const defaultPreferences: EditorialPreferences = {
  interests: "",
  aesthetics: ["Scandinavian"],
  allocations: { home: 50, fashion: 20, travel: 30 },
  mode: "Balanced",
  consent: false,
};
export const collectionRecord = z.strictObject({
  assetId: z.string().max(100),
  kind: z.enum(["image", "story"]),
  shelf: z.string().trim().min(1).max(40),
});
export type CollectionRecord = z.infer<typeof collectionRecord>;
export function readCollection(raw: string | null,pool:readonly CatalogItem[]=curationCatalog,approvals:ExternalAssetApprovals=approvedExternalAssets): CollectionRecord[] {
  try {
    return z
      .array(collectionRecord)
      .max(60)
      .parse(JSON.parse(raw ?? "[]"))
      .filter((r) =>
        pool.some(
          (a) => a.image.id === r.assetId && isPublishable(a,approvals),
        ),
      );
  } catch {
    return [];
  }
}
export function categoryLabel(c: (typeof categories)[number]) {
  return {
    home: "Spaces & objects",
    fashion: "Shape & self",
    travel: "Elsewhere",
  }[c];
}

// Human-authored interpretation choices keep factual enrichment outside model
// authority. Muse directs selection, copy choice, sequence, layouts and motion.
export function editorialCopy(a: CatalogItem) {
  return {
    headlines: [
      `A closer look: ${a.name}`,
      `The space around ${a.name}`,
      `${a.name}, another perspective`,
    ],
    narratives: [
      `${a.description.slice(0, 150)} Follow ${a.discoverableObjects[0]?.label.slice(0, 50).toLowerCase() ?? "the composition"} into another visual idea. This is an authored interpretation of ${a.sourceType === "synthetic_concept" ? "a fictional study" : "an approved catalog composition"}.`,
      `A subjective visual reading: consider the drawn forms and the space between them. Let this composition lead to another idea, without inferring materials or product identity.`,
      `An invitation to pause: look at the relationship between silhouette, scale and empty space. This editorial interpretation is a point of departure, not a factual claim about an object.`,
    ],
  };
}

export function validateOriginalPlan(
  input: unknown,
  pool: readonly CatalogItem[],
  prefs: EditorialPreferences,
  approvals:ExternalAssetApprovals=approvedExternalAssets,
  sources:readonly EditorialSource[]=[],
  contexts:readonly import('./visual-observations').VisualContext[]=[],
  technicalOnly=false,
) {
  const eligible = pool.filter((a) => prefs.allocations[a.category] > 0);
  const plan = validatePlan(input, eligible, approvals,sources,technicalOnly);
  if(plan.qualityVersion===3&&technicalOnly){
    for(const feature of plan.features){
      const context=contexts.find(row=>row.assetId===feature.assetId)
      const keys=context?Object.entries(context.observations).flatMap(([group,values])=>values.map(value=>`${group}.${value}`)):[]
      if(!context||!feature.observationKeys?.length||feature.observationKeys.some(key=>!keys.includes(key)))throw Error('Unsupported observation reference')
      if(!feature.sourceIds?.length||feature.sourceIds.some(id=>!sources.some(source=>source.id===id&&source.assetId===feature.assetId)))throw Error('Unsupported source reference')
    }
  }
  if(plan.qualityVersion===3&&!technicalOnly){const issue=evaluateChiefEditor(plan,contexts,sources);if(issue)throw Error(`Chief Editor output rejected: ${issue}`)}
  if (plan.qualityVersion !== 2 && plan.qualityVersion !== 3 && (
    !visualPhrase(plan.title) ||
    plan.title.length > 80 ||
    plan.title.split(/\s+/).length > 12 ||
    !visualNarrative(plan.deck) ||
    plan.features.some(
      (f) =>
        !visualPhrase(f.headline) ||
        f.headline.length > 90 ||
        f.headline.split(/\s+/).length > 12 ||
        !visualNarrative(f.narrative),
    )
  ))
    throw Error("Original visual interpretation required");
  if (!technicalOnly &&
    new Set(plan.features.map((f) => f.headline)).size !==
      plan.features.length ||
    new Set(plan.features.map((f) => f.narrative)).size !== plan.features.length
  )
    throw Error("Repeated editorial copy");
  if (prefs.mode === "Focused" && plan.features.length > 3)
    throw Error("Focused edition is too broad");
  if (
    plan.features.length <
    Math.min(eligible.length, prefs.mode === "Focused" ? 2 : 3)
  )
    throw Error("Insufficient editorial coverage");
  if (!technicalOnly &&
    plan.features.length > 1 &&
    new Set(plan.features.map((f) => f.layout)).size < 2
  )
    throw Error("Editorial rhythm required");
  const dominant = categories.find((c) => prefs.allocations[c] >= 60);
  if (
    dominant &&
    eligible.some((a) => a.category === dominant) &&
    !eligible.some(
      (a) => a.id === plan.features[0].catalogId && a.category === dominant,
    )
  )
    throw Error("Dominant preference must lead");
  if (prefs.mode === "Balanced")
    for (const c of categories)
      if (
        eligible.some((a) => a.category === c) &&
        !plan.features.some((f) =>
          eligible.some((a) => a.id === f.catalogId && a.category === c),
        )
      )
        throw Error("Balanced category coverage required");
  if ((plan.connections?.length ?? 0) !== plan.features.length - 1)
    throw Error("Complete editorial thread required");
  for (let i = 0; i < plan.features.length - 1; i++)
    if (
      !plan.connections?.some(
        (c) =>
          c.fromAssetId === plan.features[i].assetId &&
          c.toAssetId === plan.features[i + 1].assetId,
      )
    )
      throw Error("Sequential editorial connection required");
  return plan;
}
