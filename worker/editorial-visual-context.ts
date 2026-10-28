import { analysisMediaPermits, type AnalysisMediaPermit } from "./asset-sources";
import { approvedExternalAssets, type ExternalAssetApprovals } from "../shared/url-policy";
import { hasExternalApproval, isPublishable, type CatalogItem } from "../shared/catalog";
import { understanding } from "./asset-contracts";
import { type VisualContext } from "../shared/visual-observations";


export function observationAssetMatches(hit: Record<string, unknown>, ad: CatalogItem, approvals: ExternalAssetApprovals = approvedExternalAssets, permits: Readonly<Record<string, AnalysisMediaPermit>> = analysisMediaPermits) {
  if (!isPublishable(ad, approvals)) return false;
  if (ad.image.externalUrl) return hasExternalApproval(ad, approvals) && hit.image_url === ad.image.externalUrl;
  const permit = typeof hit.version_id === "string" ? permits[hit.version_id] : null;
  return Boolean(permit?.bundledPath && ad.provenance.origin === "authored_geometry" && ad.image.path === permit.bundledPath && ad.image.width === permit.width && ad.image.height === permit.height && permit.mime === "image/png" && permit.imageUrl === hit.image_url && permit.sha256 === hit.image_sha256 && permit.analysisEvidence === ad.permissions.aiAnalysis.evidence);
}

// Only reader-scoped retriever hits enter here. Its SQL requires a current,
// succeeded Meta job with the current independent AI-analysis permission revision.
// Re-bind observation output to the exact D1 version/fingerprint and a separately
// approved compiled display record. No raw intelligence or private rows go public.
export function retrievedVisualContext(hit: Record<string, unknown>, ad: CatalogItem, approvals: ExternalAssetApprovals = approvedExternalAssets, permits: Readonly<Record<string, AnalysisMediaPermit>> = analysisMediaPermits): VisualContext | null {
  if (!observationAssetMatches(hit, ad, approvals, permits) || ad.permissions.aiAnalysis.status !== "approved" || !ad.permissions.aiAnalysis.evidence || hit.analysis_evidence !== ad.permissions.aiAnalysis.evidence || hit.classification_source !== "meta" || hit.reader_eligible !== 1 || typeof hit.intelligence_json !== "string" || hit.intelligence_json.length > 20000 || typeof hit.image_sha256 !== "string") return null;
  try {
    const result = understanding.parse(JSON.parse(hit.intelligence_json));
    if (result.versionId !== hit.version_id || result.imageSha256 !== hit.image_sha256 || !result.observations) return null;
    return { assetId: ad.image.id, versionId: result.versionId, imageSha256: result.imageSha256, source: "meta_image_observation", model: "muse-spark-1.3", observations: result.observations, uncertainty: "appearance_not_verified_fact" };
  } catch { return null; }
}
