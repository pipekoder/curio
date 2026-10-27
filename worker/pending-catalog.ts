// INTERNAL REVIEW ONLY. Never import this module from shared/ or src/, expose it
// through an API route, or send its records to a model. Keep confidential license
// documents elsewhere; repository files are not a private document vault.
// Promote a candidate into shared/catalog.ts and the independent exact-URL
// approval registry only after all identity/display evidence has been reviewed.
export type PendingCatalogCandidate = {
  id: string
  discoveryUrl: string | null
  candidate: unknown
  reviewNotes: string
}
export const pendingCatalogCandidates: readonly PendingCatalogCandidate[] = []
