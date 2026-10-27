import { expect, it, vi, afterEach } from 'vitest'
import { extractGallery, discoverGallery } from '../worker/gallery-ingestion'
import { gallerySources } from '../worker/asset-sources'
import { imageDimensions, readAnalysisImage, classifyWithMeta, mockUnderstanding } from '../worker/asset-classifier'
const source=gallerySources.find(s=>s.id==='norm-residence-project')!
afterEach(()=>vi.unstubAllGlobals())
it('extracts exact publisher links, lazy sources, JSON metadata and deduplicates without executing scripts',()=>{
 const html=`<h1>Publisher project</h1><img src="/photo.jpg" alt="Publisher description"><source srcset="/photo.jpg 1x, /second.webp 2x"><a href="https://evil.example/x.jpg">No</a><img src="http://127.0.0.1/x.jpg"><img src="/logo.jpg"><script type="application/ld+json">{"image":"https://normcph.com/third.png"}</script><script>throw Error('not executed')</script>`
 const items=extractGallery(html,source)
 expect(items.map(i=>i.candidate.imageUrl)).toEqual(['https://normcph.com/photo.jpg','https://normcph.com/second.webp','https://normcph.com/third.png'])
 expect(items[0].candidate.alt).toBeNull();expect(items[0].publisher.alt).toBe('Publisher description');expect(items[0].publisher.hints.categories).toEqual([])
})
it('bounds metadata and handles JS-only, blocked and unexpected MIME sources explicitly',async()=>{
 expect(()=>extractGallery('x'.repeat(512001),source)).toThrow()
 const send=vi.fn(async()=>new Response('<div>Enable JavaScript</div>',{headers:{'Content-Type':'text/html'}}))
 expect((await discoverGallery(source,send as typeof fetch)).status).toBe('js_required')
 expect(send.mock.calls[0]).toBeDefined()
 expect((await discoverGallery(source,vi.fn(async()=>new Response('',{status:403})) as typeof fetch)).status).toBe('blocked')
 await expect(discoverGallery(source,vi.fn(async()=>new Response('bad',{headers:{'Content-Type':'image/jpeg'}})) as typeof fetch)).rejects.toThrow('unsupported_gallery')
 await expect(discoverGallery(source,vi.fn(async()=>new Response('x'.repeat(512001),{headers:{'Content-Type':'text/html'}})) as typeof fetch)).rejects.toThrow('gallery_too_large')
})
it('validates image byte dimensions and rejects changed fingerprints before model access',async()=>{
 const bytes=new Uint8Array(24),v=new DataView(bytes.buffer);v.setUint32(0,0x89504e47);v.setUint32(4,0x0d0a1a0a);v.setUint32(12,0x49484452);v.setUint32(16,100);v.setUint32(20,50)
 expect(imageDimensions(bytes,'image/png')).toEqual([100,50]);expect(()=>imageDimensions(new Uint8Array(2),'image/jpeg')).toThrow()
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes,{headers:{'Content-Type':'image/png'}})))
 const permit={imageUrl:'https://normcph.com/test.png',sha256:'a'.repeat(64),width:100,height:50,mime:'image/png' as const,analysisEvidence:'TEST ONLY'}
 await expect(readAnalysisImage(permit,new AbortController().signal)).rejects.toMatchObject({code:'media_fingerprint_changed'})
 await expect(readAnalysisImage({...permit,width:101},new AbortController().signal)).rejects.toMatchObject({code:'image_dimensions_changed'})
})
it('uses only the fixed Meta model and rejects executable/extra model fields and incorrect asset bindings',async()=>{
 const id='version-'+'a'.repeat(64),sha='b'.repeat(64),result={...mockUnderstanding(id),imageSha256:sha}
 const send=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})))
 vi.stubGlobal('fetch',send)
 expect(await classifyWithMeta(id,sha,'data:image/png;base64,TEST','FAKE',new AbortController().signal)).toEqual(result)
 const [url,init]=send.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://api.meta.ai/v1/chat/completions')
 expect(JSON.parse(String(init.body)).model).toBe('muse-spark-1.3');expect(init.redirect).toBe('error')
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...result,code:'alert(1)'})}}]}))))
 await expect(classifyWithMeta(id,sha,'data:image/png;base64,TEST','FAKE',new AbortController().signal)).rejects.toThrow()
})
