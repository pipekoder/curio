import { z } from 'zod'
import { catalogItem,type CatalogItem } from './catalog'
import type { ExternalAssetApprovals } from './url-policy'
export const publishedCatalogPage=z.strictObject({items:z.array(catalogItem).max(60),nextCursor:z.string().max(80).nullable()})
export function readerApprovals(items:readonly CatalogItem[]):ExternalAssetApprovals{return Object.fromEntries(items.filter(a=>a.image.externalUrl&&a.permissions.display.evidence).map(a=>[a.image.id,{url:a.image.externalUrl!,sourcePage:a.provenance.originalSourcePage!,displayEvidence:a.permissions.display.evidence!}]))}
