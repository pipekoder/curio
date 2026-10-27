import { z } from "zod";
import { isPublishable, type CatalogItem } from "./catalog";

// Shared with the existing version-bound Asset Intelligence output_json record.
// Deliberately bounded observations: appearances cannot identify a material,
// brand, product, location, manufacturing method or licensing permission.
export const visualObservations = z.strictObject({
  subjects: z.array(z.enum(["lighting", "seating", "clothing", "accessory", "architecture", "landscape", "path"])).max(7),
  materialAppearance: z.array(z.enum(["paper-like", "fabric-like", "wood-like", "stone-like", "indeterminate"])).max(5),
  environments: z.array(z.enum(["interior-like", "woodland-like", "waterside-like", "abstract"])).max(4),
  relationships: z.array(z.enum(["curve-and-space", "light-and-shadow", "fold-and-silhouette", "path-and-shelter"])).max(4),
});
export type VisualObservations = z.infer<typeof visualObservations>;
export type VisualContext = {
  assetId: string;
  versionId: string;
  imageSha256: string | null;
  source: "authored_illustration" | "meta_image_observation";
  model: "muse-spark-1.3" | null;
  observations: VisualObservations;
  uncertainty: "appearance_not_verified_fact";
};
const authored: Record<string, VisualObservations> = {
  "home-lamp": { subjects: ["lighting"], materialAppearance: ["paper-like"], environments: ["interior-like"], relationships: ["light-and-shadow", "curve-and-space"] },
  "home-chair": { subjects: ["seating"], materialAppearance: ["indeterminate"], environments: ["interior-like"], relationships: ["curve-and-space", "light-and-shadow"] },
  "fashion-coat": { subjects: ["clothing"], materialAppearance: ["fabric-like"], environments: ["abstract"], relationships: ["fold-and-silhouette", "curve-and-space"] },
  "fashion-bag": { subjects: ["accessory"], materialAppearance: ["indeterminate"], environments: ["abstract"], relationships: ["fold-and-silhouette", "light-and-shadow"] },
  "travel-cabin": { subjects: ["architecture", "landscape"], materialAppearance: ["wood-like"], environments: ["waterside-like"], relationships: ["path-and-shelter", "light-and-shadow"] },
  "travel-walk": { subjects: ["landscape", "path"], materialAppearance: ["indeterminate"], environments: ["woodland-like"], relationships: ["path-and-shelter", "curve-and-space"] },
};
export function authoredVisualContext(ad: CatalogItem): VisualContext | null {
  if (!isPublishable(ad) || ad.provenance.origin !== "authored_geometry" || ad.image.role !== "placeholder" || ad.image.externalUrl || ad.image.id !== `asset-${ad.id}-v1` || ad.image.path !== `/catalog/${ad.id}.svg` || ad.image.width !== 1200 || ad.image.height !== 900 || !authored[ad.id]) return null;
  return { assetId: ad.image.id, versionId: ad.image.id, imageSha256: null, source: "authored_illustration", model: null, observations: visualObservations.parse(authored[ad.id]), uncertainty: "appearance_not_verified_fact" };
}
export function relatedVisualStory(ad: CatalogItem, pool: readonly CatalogItem[]) {
  const source = authoredVisualContext(ad);
  if (!source) return null;
  return pool.filter(a => a.id !== ad.id && isPublishable(a)).flatMap(a => {
    const context = authoredVisualContext(a);
    const shared = context?.observations.relationships.filter(r => source.observations.relationships.includes(r)) ?? [];
    return shared.length ? [{ ad: a, relationship: shared[0], score: shared.length * 2 + (a.category !== ad.category ? 1 : 0) }] : [];
  }).sort((a, b) => b.score - a.score || a.ad.id.localeCompare(b.ad.id))[0] ?? null;
}
export const visualLabel = (value: string) => value.replaceAll("-", " ");
