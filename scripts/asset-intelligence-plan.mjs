import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const m = JSON.parse(await readFile('seeds/asset-intelligence-v1.json','utf8'))
const hash = s => createHash('sha256').update(s).digest('hex')
const resolve = url => {
  const item=m.items.find(i=>i.candidate.imageUrl===url); if (!item) throw new Error('Unknown planning URL')
  return { assetId: `asset-${hash(url)}`, versionId: `version-${hash(JSON.stringify([url,item.candidate.versionKey]))}`, sourceId: item.candidate.sourceId, approval: 'pending', imageFingerprint: item.candidate.sha256 }
}
console.log(JSON.stringify({ uniqueCandidateUrls: new Set(m.items.map(i=>i.candidate.imageUrl)).size, publisherLabels: [...new Set(m.items.map(i=>i.publisher.name))], classification: m.planning.classificationUrls.map(resolve), prospectiveSamHeroes: m.planning.samHeroUrls.map(resolve), readyForPaidAnalysis: 0, modelCallsExecuted: 0, estimatedUncachedMuseCalls: m.planning.classificationUrls.length, maxCompletionTokensPerMuseCall: 1200, missing: ['independent display/AI grants','human identity/source review','exact dimensions/SHA256/media permit','explicit paid-test authorization'], samAdditionalRequirements: ['existing bundled unmodified PNG permit','adaptation rights if a source JPEG is converted','one-shot SAM budget and separate approval'] },null,2))
