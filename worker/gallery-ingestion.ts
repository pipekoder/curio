import { isSafeHttpsUrl } from '../shared/url-policy'
import { discoveryItem, type DiscoveryItem } from './asset-contracts'
import { catalogDigest } from './catalog-store'
import { type GallerySource } from './asset-sources'

const plain = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 500)
const attr = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null
function imageUrl(value: string, source: GallerySource) {
  try {
    const url = new URL(value.replace(/&amp;/g, '&'), source.entryUrl)
    return isSafeHttpsUrl(url.href) && source.mediaHosts.includes(url.hostname) && /\.(jpe?g|png|webp|avif)(?:$|\?)/i.test(url.href) && !/logo|favicon|sprite|icon/i.test(url.pathname) ? url.href : null
  } catch { return null }
}
export function extractGallery(html: string, source: GallerySource, observedAt = new Date().toISOString()): DiscoveryItem[] {
  if (html.length > 512000) throw new Error('gallery_too_large')
  const title = plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? source.name)
  const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0])
  const description = metadata.find(t => attr(t, 'name') === 'description' || attr(t, 'property') === 'og:description')
  const seen = new Set<string>(), found: { url: string; alt: string | null }[] = []
  const add = (value: string, alt: string | null) => { const url = imageUrl(value, source); if (url && !seen.has(url)) { seen.add(url); found.push({ url, alt: alt ? plain(alt) : null }) } }
  // Attributes and JSON data only. Never evaluate scripts, run a browser, follow
  // download endpoints or guess gallery API URLs/filenames.
  for (const match of html.matchAll(/<(?:img|source|a)\b[^>]*>/gi)) {
    const tag = match[0], alt = attr(tag, 'alt')
    for (const key of ['src','data-src','data-original','href']) { const value = attr(tag, key); if (value) add(value, alt) }
    for (const key of ['srcset','data-srcset']) for (const part of (attr(tag, key) ?? '').split(/,\s+(?=https?:|\/)/)) { const value = part.trim().replace(/\s+\d+(?:w|x)$/, ''); if (value) add(value, alt) }
  }
  let visited = 0
  const walk = (value: unknown, depth: number) => {
    if (++visited > 2000 || depth > 8) return
    if (Array.isArray(value)) { for (const v of value.slice(0, 200)) walk(v, depth + 1); return }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (['contentUrl','image','imageUrl','originalUrl'].includes(key) && typeof item === 'string') add(item, null)
      else if (typeof item === 'object') walk(item, depth + 1)
    }
  }
  if (/^\s*[\[{]/.test(html)) { try { walk(JSON.parse(html), 0) } catch { /* invalid JSON is ignored */ } }
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (/type=["']application\/(?:ld\+)?json["']/i.test(m[1])) { try { walk(JSON.parse(m[2]), 0) } catch { /* malformed publisher JSON is not executable */ } }
  return found.slice(0, 100).map(({ url, alt }) => discoveryItem.parse({
    candidate: { sourceId: source.id, imageUrl: url, versionKey: 'gallery-v1', sourcePage: source.entryUrl, retrievedAt: observedAt, sha256: null, width: null, height: null, alt: null, attribution: null, sourceType: 'brand_candidate', provenance: { discoveredFrom: source.entryUrl, notes: 'Exact link extracted from publisher metadata; source labels, display rights, AI analysis and editing remain independently unverified.' } },
    publisher: { name: source.publisher, campaign: title, description: description ? plain(attr(description, 'content') ?? '') || null : null, alt, sourcePage: source.entryUrl, hints: { categories: [], aesthetics: [], tags: [] } },
    access: { status: 'unverified', transport: 'owner_metadata', httpStatus: null, contentType: null },
  }))
}
export async function discoverGallery(source: GallerySource, send: typeof fetch = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
  try {
    const url = new URL(source.entryUrl); url.hash = ''
    const response = await send(url.href, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html,application/json' } })
    if (!response.ok) { await response.body?.cancel(); return { status: response.status === 401 || response.status === 403 || response.status === 429 ? 'blocked' as const : 'failed' as const, httpStatus: response.status, items: [], hash: null } }
    if (!/text\/html|application\/json/i.test(response.headers.get('Content-Type') ?? '')) { await response.body?.cancel(); throw new Error('unsupported_gallery') }
    const reader = response.body?.getReader(); if (!reader) throw new Error('missing_gallery')
    const decoder = new TextDecoder(); let size = 0, html = ''
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 512000) throw new Error('gallery_too_large'); html += decoder.decode(chunk.value, { stream: true }) } html += decoder.decode() }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    const items = extractGallery(html, source)
    return { status: items.length ? 'fetched' as const : 'js_required' as const, httpStatus: response.status, items, hash: await catalogDigest(html) }
  } finally { clearTimeout(timer) }
}
