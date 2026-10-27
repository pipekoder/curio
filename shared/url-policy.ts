// No wildcard hosts or user-submitted URL approvals. Entries are added only after
// the owner supplies display/embedding permission for an exact, versioned asset.
export type ExternalAssetApproval = { url: string; sourcePage: string; displayEvidence: string }
export type ExternalAssetApprovals = Readonly<Record<string, ExternalAssetApproval>>
export const approvedExternalAssets: ExternalAssetApprovals = Object.freeze({})

export function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      !/[<>"'\\\s]/.test(value) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) &&
      host.includes('.') && !host.endsWith('.') && !host.includes(':') && !host.includes('[') &&
      !/^\d+(\.\d+)*$/.test(host) && !/(^|\.)(localhost|local|internal|testinvalid)$/.test(host) &&
      !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal')
  } catch { return false }
}
export function isSafeSourcePage(value: string): boolean {
  if (!isSafeHttpsUrl(value)) return false
  const url = new URL(value)
  return !url.search && !/\b(checkout|cart|payment|buy|shop)\b/i.test(url.pathname)
}
