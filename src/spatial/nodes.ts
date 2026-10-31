import manifest from './nodes.manifest.json'
import {catalogNodesResponse,type CatalogNode} from './contracts'

export type NodeSource='endpoint'|'manifest'

// R1 target: dynamic Codex endpoint. Until it exists (any failure, including
// 404), fall back to the validated static manifest. The UI always labels
// which source served the nodes.
export async function loadCatalogNodes(fetchImpl:typeof fetch=fetch):Promise<{nodes:CatalogNode[];source:NodeSource}>{
  try{
    const response=await fetchImpl('/api/catalog/nodes',{signal:AbortSignal.timeout(3000)})
    if(!response.ok)throw Error(`Catalog endpoint responded ${response.status}`)
    return {nodes:catalogNodesResponse.parse(await response.json()),source:'endpoint'}
  }catch{
    return {nodes:catalogNodesResponse.parse(manifest),source:'manifest'}
  }
}
