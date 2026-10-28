import { publishedCatalogPage } from '../shared/reader-catalog'
export async function loadReaderItems(ids:readonly string[]){
  const safe=[...new Set(ids)].filter(id=>/^version-[a-f0-9]{64}$/.test(id)).slice(0,60)
  if(!safe.length)return[]
  const response=await fetch(`/api/catalog/published?ids=${safe.join(',')}`,{signal:AbortSignal.timeout(5000),cache:'no-store'})
  if(!response.ok)return[]
  return publishedCatalogPage.parse(await response.json()).items
}
