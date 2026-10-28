// Server-only discovery policy. Metadata access never grants display or AI rights.
export type GallerySource = { id: string; name: string; entryUrl: string; mediaHosts: readonly string[]; publisher: string }
export const gallerySources: readonly GallerySource[] = [
  { id: 'hm-home', name: 'H&M Home', entryUrl: 'https://press.hm.com/image-gallery/hm-home', mediaHosts: ['press.hm.com'], publisher: 'H&M HOME' },
  { id: 'hm-events', name: 'H&M Events', entryUrl: 'https://press.hm.com/image-gallery/events', mediaHosts: ['press.hm.com'], publisher: 'H&M' },
  { id: 'hm-move', name: 'H&M Move', entryUrl: 'https://press.hm.com/image-gallery/hm-move', mediaHosts: ['press.hm.com'], publisher: 'H&M MOVE' },
  { id: 'zara-press', name: 'Zara Press', entryUrl: 'https://www.zara.com/integration/pressapi/microsite/news/?countryiso=WW&languageiso=pt', mediaHosts: ['www.zara.com'], publisher: 'Zara' },
  { id: 'normann-gallery', name: 'Normann Copenhagen digital showroom', entryUrl: 'https://normcph.presscloud.com/digitalshowroom/#/gallery', mediaHosts: ['normcph.presscloud.com'], publisher: 'Owner-supplied label; identity unverified' },
  { id: 'norm-residence', name: 'Norm Residence', entryUrl: 'https://normcph.presscloud.com/digitalshowroom/#/gallery/Norm-Residence', mediaHosts: ['normcph.presscloud.com'], publisher: 'Norm Residence; identity unverified' },
  { id: 'norm-residence-project', name: 'Norm Architects · Norm Residence project', entryUrl: 'https://normcph.com/project/norm-residence/', mediaHosts: ['normcph.com'], publisher: 'Norm Architects' },
]
export type AnalysisMediaPermit = { imageUrl: string; sha256: string; width: number; height: number; mime: 'image/jpeg' | 'image/png' | 'image/webp'; analysisEvidence: string; bundledPath?: string }
// Empty until exact pixels and analysis rights are separately reviewed. This is
// independent from SAM's bundled-PNG permits and the public display registry.
export const analysisMediaPermits: Readonly<Record<string, AnalysisMediaPermit>> = Object.freeze({})
export const technicalMediaHosts = ['normcph.com','normcph.presscloud.com','press.hm.com','www.zara.com','media.oliverbonas.com','assets.bolia.com','cdn.prod.website-files.com','hoshinoresorts.com'] as const
