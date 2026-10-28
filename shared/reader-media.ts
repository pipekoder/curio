import { catalogItem, isPublishable, curationCatalog, type CatalogItem } from './catalog'
import { approvedExternalAssets, type ExternalAssetApprovals } from './url-policy'
// Integration contract only. The Discovery Engine owns transport/persistence.
// No guessed endpoint, client-side rights promotion or automatic imported URL use.
export interface PublishedContentLibrary { approvedRecords(): Promise<readonly unknown[]> }
export function eligibleReaderRecords(records: readonly unknown[], fallback: readonly CatalogItem[], approvals: ExternalAssetApprovals = approvedExternalAssets) {
  const eligible = records.flatMap(raw => {
    const result = catalogItem.safeParse(raw)
    if (!result.success || !isPublishable(result.data, approvals)) return []
    const record = result.data
    // Untrusted API metadata cannot grant itself a new local file permission.
    if (!record.image.externalUrl && !curationCatalog.some(a=>a.id===record.id && a.image.id===record.image.id && a.image.path===record.image.path && a.image.width===record.image.width && a.image.height===record.image.height)) return []
    return [record]
  })
  const unique = [...new Map(eligible.map(r=>[r.image.id,r])).values()]
  return unique.length ? unique : fallback.filter(r=>isPublishable(r,approvals))
}
export async function resolvePublishedLibrary(library: PublishedContentLibrary, fallback: readonly CatalogItem[], approvals: ExternalAssetApprovals = approvedExternalAssets) {
  try { return eligibleReaderRecords(await library.approvedRecords(),fallback,approvals) } catch { return fallback.filter(r=>isPublishable(r,approvals)) }
}
