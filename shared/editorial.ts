import { z } from "zod";
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
    title: prose,
    deck: prose,
    features: z
      .array(
        z.strictObject({
          catalogId: z.string().max(80),
          assetId: z.string().max(100),
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
    if (new Set(p.features.map((f) => f.assetId)).size !== p.features.length)
      ctx.addIssue({ code: "custom", message: "Duplicate assets." });
  });
export type EditorialPlan = z.infer<typeof editorialPlan>;
export function validatePlan(input: unknown, pool: readonly CatalogItem[]) {
  const p = editorialPlan.parse(input);
  for (const f of p.features) {
    const ad = pool.find(
      (a) =>
        isPublishable(a) && a.id === f.catalogId && a.image.id === f.assetId,
    );
    if (!ad) throw Error("Unapproved editorial asset");
    const copy = editorialCopy(ad);
    if (
      !copy.headlines.includes(f.headline) ||
      !copy.narratives.includes(f.narrative) ||
      !ad.lifestyleTags.some((t) => t === f.theme)
    )
      throw Error("Unreviewed editorial copy");
  }
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
): EditorialPlan {
  const ranked = (
    preserveOrder
      ? pool.filter((a) => isPublishable(a) && p.allocations[a.category] > 0)
      : rankDemo(p, pool)
  ).slice(0, p.mode === "Focused" ? 3 : 6);
  const top = ranked[0];
  return validatePlan(
    {
      title: top
        ? `${top.category === "home" ? "The art of quiet rooms" : top.category === "fashion" ? "A study in silhouette" : "Into the open"}`
        : "An open invitation",
      deck: `${p.mode} / ${p.aesthetics.join(" + ")}. A local edition of authorized visual studies.`,
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
    pool,
  );
}
export type EditorialEdition = {
  plan: EditorialPlan;
  source: "deterministic" | "meta";
  retrieval: "d1" | "fictional";
  cached: boolean;
  items: CatalogItem[];
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
export function readCollection(raw: string | null): CollectionRecord[] {
  try {
    return z
      .array(collectionRecord)
      .max(60)
      .parse(JSON.parse(raw ?? "[]"))
      .filter((r) =>
        curationCatalog.some(
          (a) => a.image.id === r.assetId && isPublishable(a),
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
