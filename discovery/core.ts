import { z } from 'zod'
import { discoveryManifest, discoveryUrl, type DiscoveryManifest, type DiscoveredContent } from '../shared/discovery'
import { catalogDigest } from '../worker/catalog-store'
import { extractPage, nodeFor, relevance, safeUrl } from './extract'
export const discoveryConfig=z.strictObject({
  hosts:z.array(z.string().regex(/^[a-z0-9.-]+$/)).min(1).max(16),maxPages:z.number().int().min(1).max(50).default(12),maxDepth:z.number().int().min(0).max(32).default(12),maxImages:z.number().int().min(1).max(300).default(80),maxTimeMs:z.number().int().min(50).max(180000).default(60000),requestTimeoutMs:z.number().int().min(20).max(15000).default(8000),maxBytes:z.number().int().min(1000).max(30000000).default(8000000),maxResponseBytes:z.number().int().min(100).max(2000000).default(500000),delayMs:z.number().int().min(0).max(30000).default(1000),scrolls:z.number().int().min(0).max(12).default(3),interactions:z.number().int().min(0).max(12).default(3),dynamic:z.boolean().default(true),fingerprintImages:z.boolean().default(false),maxRequests:z.number().int().min(1).max(500).default(100),
})
export type DiscoveryConfig=z.infer<typeof discoveryConfig>
export type PageResponse={status:number;type:string;body:string;bytes:number;location?:string;length?:number;sha256?:string;width?:number;height?:number}
export interface DiscoveryTransport { read(url:string,signal:AbortSignal):Promise<PageResponse>; render?(url:string,signal:AbortSignal):Promise<{html:string;interactions:number;incomplete:boolean;url?:string}>; metrics():{requests:number;bytes:number}; close?():Promise<void> }
export async function discover(startUrl:string,input:unknown,transport:DiscoveryTransport,signal?:AbortSignal):Promise<DiscoveryManifest>{
  const config=discoveryConfig.parse(input),url=new URL(discoveryUrl.parse(startUrl)).href,start=Date.now(),reasons=new Set<string>(),pages:DiscoveryManifest['pages']=[],nodes=new Map<string,DiscoveredContent>(),edges:DiscoveryManifest['edges']=[]
  if(!config.hosts.includes(new URL(url).hostname))throw Error('disallowed_start_host')
  const sourceId=`source-${(await catalogDigest(new URL(url).hostname)).slice(0,40)}`
  const queue=[{url,depth:0,parent:null as string|null,score:2}],visited=new Set<string>();let duplicates=0,interactions=0,redirects=0
  const addNode=(n:DiscoveredContent)=>{if(nodes.size>=400&&!nodes.has(n.id)){reasons.add("node_budget");return}if(nodes.has(n.id)){duplicates++;return}const canonical=n.image?.sha256?[...nodes.values()].find(x=>x.image?.sha256===n.image?.sha256&&x.id!==n.id):null;if(canonical){duplicates++;edges.push({from:n.id,to:canonical.id,relation:'variant_of'})}nodes.set(n.id,n)}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),config.maxTimeMs)
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel()
  try{
    while(queue.length){
      if(controller.signal.aborted){reasons.add(signal?.aborted?'cancelled':'time_budget');break}
      if(pages.length>=config.maxPages){reasons.add('page_budget');break}
      if([...nodes.values()].filter(n=>n.kind==='image').length>=config.maxImages){reasons.add('image_budget');break}
      queue.sort((a,b)=>b.score-a.score);const task=queue.shift()!;if(visited.has(task.url))continue;visited.add(task.url)
      if(task.depth>config.maxDepth){reasons.add('depth_budget');continue}
      let response:PageResponse
      try{response=await transport.read(task.url,controller.signal)}catch(error){reasons.add(error instanceof Error&&/^[a-z0-9_]+$/.test(error.message)?error.message:'transport_failed');pages.push({url:task.url,depth:task.depth,parent:task.parent,status:'inaccessible',httpStatus:null});continue}
      if(response.status>=300&&response.status<400){const target=response.location?safeUrl(response.location,task.url):null;if(target&&config.hosts.includes(new URL(target).hostname)&&redirects++<3){queue.push({...task,url:target})}else reasons.add('unsafe_redirect');continue}
      pages.push({url:task.url,depth:task.depth,parent:task.parent,status:response.status===200?'fetched':'inaccessible',httpStatus:response.status})
      if(response.bytes>config.maxResponseBytes||new TextEncoder().encode(response.body).length>config.maxResponseBytes){reasons.add('response_budget');continue}
      if(response.status!==200){reasons.add(response.status===401||response.status===403||response.status===429?'access_restricted':'page_failed');continue}
      if(/^image\/(jpeg|png|webp|avif)/.test(response.type)){
        const image=await nodeFor(sourceId,{url:task.url,kind:'image',title:null,description:null,text:null,attribution:null,method:'direct_image',image:{url:task.url,variants:[task.url],width:response.width??null,height:response.height??null,mime:response.type,bytes:response.length??null,sha256:response.sha256??null,alt:null,quality:0.3,access:'reachable'}});addNode(image);continue
      }
      if(!/text\/html|application\/(?:ld\+)?json|application\/xml|text\/xml/.test(response.type)){reasons.add('unsupported_media');continue}
      let extracted=await extractPage(response.body,task.url,sourceId)
      if(config.dynamic&&transport.render&&extracted.scripted&&extracted.images.length<3){
        try{const original=extracted.page;const rendered=await transport.render(task.url,controller.signal);interactions+=rendered.interactions;const renderedUrl=rendered.url&&safeUrl(rendered.url,task.url)&&config.hosts.includes(new URL(rendered.url).hostname)?rendered.url:task.url;extracted=await extractPage(rendered.html,renderedUrl,sourceId,'rendered_dom');if(renderedUrl!==task.url){addNode(original);edges.push({from:original.id,to:extracted.page.id,relation:'contains'});if(pages.length<config.maxPages)pages.push({url:renderedUrl,depth:Math.min(32,task.depth+1),parent:task.url,status:'fetched',httpStatus:200})}if(rendered.incomplete)reasons.add('dynamic_partial')}catch{reasons.add('dynamic_unavailable')}
      }else if(extracted.scripted)reasons.add('javascript_unverified')
      addNode(extracted.page);for(const context of extracted.contexts)addNode(context);edges.push(...extracted.edges.filter(e=>e.relation==='links_to'||e.from!==extracted.page.id));duplicates+=extracted.duplicates
      for(let image of extracted.images){
        if(!config.hosts.includes(new URL(image.image!.url).hostname)){image=await nodeFor(sourceId,{...image,image:{...image.image!,access:'policy_pending'}});reasons.add('media_host_review_required')}
        if(config.fingerprintImages&&config.hosts.includes(new URL(image.image!.url).hostname))try{
          const media=await transport.read(image.image!.url,controller.signal)
          if(media.status===200&&media.type.startsWith('image/')&&media.sha256)image=await nodeFor(sourceId,{...image,image:{...image.image!,mime:media.type,sha256:media.sha256,width:media.width??image.image!.width,height:media.height??image.image!.height,bytes:media.length??null,access:'reachable'}})
          else reasons.add('image_unverified')
        }catch{reasons.add('image_unverified')}
if([...nodes.values()].filter(n=>n.kind==='image').length>=config.maxImages){reasons.add('image_budget');break}addNode(image);edges.push({from:extracted.page.id,to:image.id,relation:'illustrates'})}
      if(task.parent){const parent=[...nodes.values()].find(n=>n.url===task.parent&&n.kind!=='image');if(parent)edges.push({from:parent.id,to:extracted.page.id,relation:'contains'})}
      const links=[...extracted.links]
      if(/xml/.test(response.type))for(const m of response.body.matchAll(/<loc>([^<]+)<\/loc>/g)){const target=safeUrl(m[1],task.url);if(target)links.push({url:target,label:'collection sitemap'})}
      if(task.depth===0&&!extracted.images.length&&!links.length){links.push({url:new URL('/sitemap.xml',url).href,label:'collection sitemap'})}
      for(const link of links.sort((a,b)=>relevance(b.url,b.label)-relevance(a.url,a.label)).slice(0,100)){if(queue.length>=500){reasons.add('frontier_budget');break}if(!config.hosts.includes(new URL(link.url).hostname)||visited.has(link.url)||queue.some(q=>q.url===link.url)||relevance(link.url,link.label)<0)continue;queue.push({url:link.url,depth:task.depth+1,parent:task.url,score:relevance(link.url,link.label)})}
      if(transport.metrics().bytes>=config.maxBytes){reasons.add('byte_budget');break}
      if(transport.metrics().requests>=config.maxRequests){reasons.add('request_budget');break}
      // Manifest itself is a bounded operator payload, not an arbitrary archive.
      if(JSON.stringify([...nodes.values()]).length>180000){reasons.add('manifest_budget');break}
    }
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);await transport.close?.()}
  return discoveryManifest.parse({schemaVersion:1,jobId:`discovery-${crypto.randomUUID()}`,sourceId,startUrl:url,observedAt:new Date().toISOString(),status:signal?.aborted?'cancelled':reasons.size?(pages.some(p=>p.status==='fetched')?'partial':'blocked'):'complete',stopReasons:[...reasons].slice(0,30),pages,nodes:[...nodes.values()],edges:[...new Map(edges.filter(e=>nodes.has(e.from)&&nodes.has(e.to)).map(e=>[JSON.stringify(e),e])).values()].slice(0,1200),metrics:{...transport.metrics(),duplicates,elapsedMs:Date.now()-start,maxDepth:Math.max(0,...pages.map(p=>p.depth)),dynamicInteractions:interactions},displayPermission:'pending_review',analysisPermission:'pending_review',editsPermission:'pending_review'})
}
