// Clear wipes the agreed client-side session keys and reports exactly what
// was removed. It never touches the Content Studio operator token
// (curio.media.operator): owner authentication is not visit state.
export const SPATIAL_SESSION_KEY='curio.spatial.session.v1'
export const EXPLORE_SNAPSHOT_KEY='curio.explore.edition.v1'
export const LEGACY_COLLECTION_KEY='curio.collection.v1'

export type KeyStore=Pick<Storage,'getItem'|'removeItem'|'setItem'>
export type KeyStores={localStorage:KeyStore;sessionStorage:KeyStore}

export function clearSpatialSession({localStorage,sessionStorage}:KeyStores):{removed:string[]}{
  const removed:string[]=[]
  for(const key of [SPATIAL_SESSION_KEY,EXPLORE_SNAPSHOT_KEY]){
    if(sessionStorage.getItem(key)!==null){sessionStorage.removeItem(key);removed.push(key)}
  }
  if(localStorage.getItem(LEGACY_COLLECTION_KEY)!==null){localStorage.removeItem(LEGACY_COLLECTION_KEY);removed.push(LEGACY_COLLECTION_KEY)}
  return {removed}
}
