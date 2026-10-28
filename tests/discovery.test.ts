// @vitest-environment node
import {expect,it} from 'vitest'
import {discover,type DiscoveryTransport} from '../discovery/core'
import {extractPage} from '../discovery/extract'
import {authorizeUrl,isPublicIPv4,robotsAllows,robotsDelay,SecureDiscoveryTransport,resolvePublicAddress} from '../discovery/network'
const root='https://fixture.example.com/gallery'
const config={hosts:['fixture.example.com'],dynamic:false,delayMs:0,maxDepth:12}
it('adaptively reaches products beyond three levels, retaining query/hash routes, variants and metadata',async()=>{
 const read=async(url:string)=>{const level=Number(new URL(url).searchParams.get('level')??0);return{status:200,type:'text/html',body:level<6?`<h1>Collection ${level}</h1><a href="?level=${level+1}#/gallery">Product collection</a>`:'<h1>Synthetic product</h1><meta name="description" content="Original fixture description"><picture><source srcset="/small.jpg 300w, /large.jpg 1600w"><img src="/small.jpg" alt="Original test shape"></picture><img src="/large.jpg">',bytes:100}}
 const m=await discover(root,{...config,maxPages:10},{read,metrics:()=>({requests:7,bytes:700})})
 expect(m.metrics.maxDepth).toBe(6);expect(m.pages[6].url).toContain('level=6#/gallery');expect(m.nodes.some(n=>n.image?.url.endsWith('/large.jpg'))).toBe(true)
 expect(m.nodes.find(n=>n.image?.url.endsWith('/large.jpg'))!.image!.variants).toContain('https://fixture.example.com/small.jpg')
 expect(m.metrics.duplicates).toBeGreaterThan(0);expect(m.edges.some(e=>e.relation==='contains')).toBe(true);expect(m.displayPermission).toBe('pending_review')
})
it('reports bounded partial results, depth limits, redirects, unsupported types and cancellation',async()=>{
 const endless:DiscoveryTransport={read:async(url)=>({status:200,type:'text/html',body:`<h1>Gallery</h1><a href="/gallery/${new URL(url).pathname.length}">Next collection</a>`,bytes:1}),metrics:()=>({requests:0,bytes:0})}
 expect((await discover(root,{...config,maxPages:2},endless)).stopReasons).toContain('page_budget')
 expect((await discover(root,{...config,maxDepth:0},endless)).stopReasons).toContain('depth_budget')
 expect((await discover(root,config,{read:async()=>({status:302,type:'text/html',body:'',bytes:0,location:'http://169.254.169.254/'}),metrics:()=>({requests:1,bytes:0})})).stopReasons).toContain('unsafe_redirect')
 expect((await discover(root,config,{read:async()=>({status:200,type:'application/octet-stream',body:'',bytes:1}),metrics:()=>({requests:1,bytes:1})})).stopReasons).toContain('unsupported_media')
 const controller=new AbortController();controller.abort();expect((await discover(root,config,endless,controller.signal)).status).toBe('cancelled')
})
it('extracts structured publisher context without inventing missing descriptions or attributes',async()=>{
 const result=await extractPage('<h1>Gallery</h1><script type="application/ld+json">{"@type":"Product","name":"Synthetic fold","description":"Fixture only","image":"https://fixture.example.com/fold.png"}</script>',root,'fixture')
 expect(result.images[0].title).toBe('Synthetic fold');expect(result.images[0].description).toBe('Fixture only')
 expect(result.images[0].attribution).toBeNull();expect(result.images[0].image?.sha256).toBeNull()
})
it('rejects SSRF, credentials, sensitive queries, off-policy hosts and non-public IPv4 ranges',()=>{
 for(const url of ['http://fixture.example.com','https://127.0.0.1/','https://0x7f000001/','https://[::1]/','https://user:secret@fixture.example.com/','https://fixture.example.com/?token=secret','https://other.example.com/','https://metadata.google.internal/'])expect(()=>authorizeUrl(url,['fixture.example.com'])).toThrow()
 for(const ip of ['127.0.0.1','169.254.169.254','10.1.1.1','100.64.0.1','172.16.0.1','192.168.0.1','192.0.2.1','198.18.0.1','203.0.113.1','224.1.1.1','::ffff:127.0.0.1'])expect(isPublicIPv4(ip)).toBe(false)
 expect(isPublicIPv4('8.8.8.8')).toBe(true)
})
it('honors robots groups, longest matches, exact allows and conservative wildcards',()=>{
 const policy='User-agent: *\nDisallow: /\nAllow: /$\nUser-agent: Other\nAllow: /'
 expect(robotsAllows(policy,'/')).toBe(true);expect(robotsAllows(policy,'/private')).toBe(false)
 expect(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/open','/private/open')).toBe(true)
 expect(robotsDelay('User-agent: *\nCrawl-delay: 5')).toBe(5000)
})
it('fails closed behind an unverified proxy instead of bypassing DNS pinning or managed egress',async()=>{
 if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY){const {discoveryConfig}=await import('../discovery/core');const t=new SecureDiscoveryTransport(discoveryConfig.parse(config));await expect(t.read(root,new AbortController().signal)).rejects.toThrow('proxy_dns_pinning_unverified');expect(t.metrics().requests).toBe(0)}
})

it('pins only a validated public DNS answer and rejects a changed/private resolution or a stalled lookup',async()=>{
 expect(await resolvePublicAddress('fixture.example.com',async()=>[{address:'8.8.8.8'}])).toBe('8.8.8.8')
 await expect(resolvePublicAddress('fixture.example.com',async()=>[{address:'127.0.0.1'}])).rejects.toThrow('unsafe_dns')
 await expect(resolvePublicAddress('fixture.example.com',async()=>[{address:'8.8.8.8'},{address:'10.0.0.1'}])).rejects.toThrow('unsafe_dns')
 await expect(resolvePublicAddress('fixture.example.com',()=>new Promise(()=>{}),10)).rejects.toThrow('request_timeout')
 const controller=new AbortController();controller.abort();await expect(resolvePublicAddress('fixture.example.com',undefined,10,controller.signal)).rejects.toThrow('cancelled')
})
