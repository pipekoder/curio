// SERVER-ONLY exact raster allowlist. Empty until a separately authorized test.
// No external fetch/proxy is implemented; source approval is not byte access.
export type SamAssetPermit = { adId: string; assetId: string; path: string; width: number; height: number; sha256: string; analysisEvidence: string }
export const samAssetPermits: Readonly<Record<string, SamAssetPermit>> = Object.freeze({})
