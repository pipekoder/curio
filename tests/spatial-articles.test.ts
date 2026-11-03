import {describe,expect,it,vi} from 'vitest'
import {ARTICLE_CONTRACT_VERSION} from '../shared/editorial-articles'
import {articleStatusCopy,fetchArticleEdition} from '../src/spatial/articles'
import {stageArticleEdition} from '../src/spatial/staging'
import {articleEditionFixture,articleResponseFixture} from './article-fixtures'

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), {status: 200}))
const err = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), {status}))
const call = (fetchImpl: unknown) => fetchArticleEdition('quiet rooms', true, fetchImpl as unknown as typeof fetch)

describe('spatial article edition fetch', () => {
  it('sends the article format with consent and the selected mode', async () => {
    const seen: string[] = []
    const spy = vi.fn(async (_url: unknown, init: {body: string}) => {seen.push(init.body); return new Response('x', {status: 503})})
    await fetchArticleEdition('quiet rooms', true, spy as unknown as typeof fetch, {editorialMode: 'hybrid'})
    expect(JSON.parse(seen[0])).toEqual({prompt: 'quiet rooms', consent: true, editionFormat: ARTICLE_CONTRACT_VERSION, editorialMode: 'hybrid'})
  })
  it('parses a valid article edition without inventing content', async () => {
    const {edition, honest, status} = await call(ok(articleResponseFixture()))
    expect(honest).toBe('meta')
    expect(status).toBeNull()
    expect(edition!.articleEdition.articles).toHaveLength(3)
    expect(edition!.articleEdition.articles[0].images).toHaveLength(3)
  })
  it('continues one Generate action through truthful preparation to a reviewed edition', async () => {
    const responses = [
      new Response(JSON.stringify({status:'preparing',preparation:{retryAfterMs:0},eligibleImages:4,requiredImages:6}),{status:202}),
      new Response(JSON.stringify({status:'preparing',preparation:{retryAfterMs:0},eligibleImages:6,requiredImages:6}),{status:202}),
      new Response(JSON.stringify(articleResponseFixture()),{status:200}),
    ]
    const fetcher=vi.fn(async()=>responses.shift()!)
    const onResponse=vi.fn()
    const result=await fetchArticleEdition('quiet rooms',true,fetcher as unknown as typeof fetch,{onResponse})
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(onResponse).toHaveBeenCalledOnce()
    expect(result.edition?.articleEdition.articles).toHaveLength(3)
    expect(result.honest).toBe('meta')
  })
  it('stages one dock per article with hero-first joined imagery', async () => {
    const {articleEdition, items} = articleEditionFixture()
    const {exhibits, skipped} = stageArticleEdition({articleEdition, items})
    expect(skipped).toBe(0)
    expect(exhibits).toHaveLength(3)
    for (const exhibit of exhibits) {
      expect(exhibit.article!.storyImages).toHaveLength(3)
      expect(exhibit.image).toBe(exhibit.article!.storyImages[0].image)
      expect(exhibit.assetId).toBe(exhibit.article!.storyImages[0].assetId)
      // Mixed brands within one article, captions from the article record.
      const brands = new Set(exhibit.article!.storyImages.map(image => image.brandName))
      expect(brands.size).toBeGreaterThan(1)
      // URLs resolve only from joined items; never constructed from IDs.
      for (const story of exhibit.article!.storyImages) {
        const item = items.find(candidate => candidate.id === story.catalogId && candidate.image.id === story.assetId)!
        expect(story.image).toBe(item.image.path)
        expect(story.alt).toBe(item.image.alt)
      }
    }
  })
  it('stages the two-image Demo minimum without a third-image placeholder', () => {
    const {articleEdition, items} = articleEditionFixture()
    const twoImageEdition = structuredClone(articleEdition)
    twoImageEdition.articles.forEach(article => { article.images.pop() })
    const result = stageArticleEdition({articleEdition: twoImageEdition, items})
    expect(result.exhibits).toHaveLength(3)
    expect(result.exhibits.every(exhibit => exhibit.article?.storyImages.length === 2)).toBe(true)
  })
  it('skips articles with unresolvable images instead of patching them', async () => {
    const {articleEdition, items} = articleEditionFixture()
    const broken = structuredClone(articleEdition)
    broken.articles[0].images[1] = {...broken.articles[0].images[1], catalogId: 'no-such-record'}
    const {exhibits, skipped} = stageArticleEdition({articleEdition: broken, items})
    expect(skipped).toBe(1)
    expect(exhibits).toHaveLength(2)
    expect(exhibits.some(exhibit => exhibit.article!.id === broken.articles[0].id)).toBe(false)
  })
  it('keeps server non-AI states machine-readable', async () => {
    const disabled = await call(err(503, {status: 'disabled', fallbackReason: 'disabled'}))
    expect(disabled.edition).toBeNull()
    expect(disabled.status).toBe('disabled')
    const consent = await call(err(403, {status: 'consent_required', fallbackReason: 'consent_missing'}))
    expect(consent.status).toBe('consent_required')
    const short = await call(err(409, {status: 'insufficient_content', eligibleImages: 9, requiredImages: 15, fallbackReason: 'insufficient_content'}))
    expect(short.status).toBe('insufficient_content')
    expect(short.eligibleImages).toBe(9)
    expect(short.requiredImages).toBe(15)
    const fallback = await call(ok({format: ARTICLE_CONTRACT_VERSION, source: 'deterministic', retrieval: 'd1', cached: false, articleEdition: null, status: 'fallback', fallbackReason: 'editorial_rejected'}))
    expect(fallback.edition).toBeNull()
    expect(fallback.status).toBe('fallback')
    expect(fallback.fallbackReason).toBe('editorial_rejected')
    const offline = await call(vi.fn(async () => {throw Error('offline')}))
    expect(offline.edition).toBeNull()
    expect(offline.status).toBe('request_failed')
  })
  it('fails closed on invalid article payloads', async () => {
    const response = articleResponseFixture()
    response.articleEdition.articles[0] = {...response.articleEdition.articles[0], heroAssetId: response.articleEdition.articles[1].heroAssetId}
    const {edition, status} = await call(ok(response))
    expect(edition).toBeNull()
    expect(status).toBe('request_failed')
  })
  it('discloses every article state with a baseline way out', () => {
    expect(articleStatusCopy({status: 'disabled'} as never).title).toContain('disabled')
    expect(articleStatusCopy({status: 'consent_required'} as never).title).toContain('consent')
    expect(articleStatusCopy({status: 'insufficient_content', eligibleImages: 9, requiredImages: 6} as never).detail).toContain('9 of 6')
    expect(articleStatusCopy({timedOut: true} as never).title).toContain('still being reviewed')
    for (const status of ['disabled', 'consent_required', 'unavailable', 'insufficient_content', 'fallback', 'request_failed', null] as const) {
      expect(articleStatusCopy({status, timedOut: false} as never).detail).toContain('standard edition')
    }
  })
})
