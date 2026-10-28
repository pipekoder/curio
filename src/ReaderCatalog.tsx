import { createContext,useContext } from 'react'
import { curationCatalog } from '../shared/catalog'
import { approvedExternalAssets,type ExternalAssetApprovals } from '../shared/url-policy'
export const ReaderCatalogContext=createContext<{items:typeof curationCatalog;approvals:ExternalAssetApprovals}>({items:curationCatalog,approvals:approvedExternalAssets})
export const useReaderCatalog=()=>useContext(ReaderCatalogContext)
