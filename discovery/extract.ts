import { parseHTML } from 'linkedom'
import { discoveryUrl, type DiscoveredContent } from '../shared/discovery'
import { contentNodeId, contentFingerprint } from '../worker/discovery-store'
export const safeUrl=(value:string,base:string)=>{try{const u=new URL(value,base);return discoveryUrl.safeParse(u.href).success?u.href:null}catch{return null}}
const plain=(value:string|null|undefined)=>value?.replace(/\s+/g,' ').trim().slice(0,1500)||null
export function pageKind(url:string,title=''):DiscoveredContent['kind'] {const s=url+' '+title;return /product|\/p\//i.test(s)?'product':/story|article|news\//i.test(s)?'story':/collection|category/i.test(s)?'collection':/gallery|showroom|lookbook/i.test(s)?'gallery':'page'}
export const relevance=(url:string,label='')=> /login|checkout|privacy|cookie|account|contact|terms|wishlist|cart|sign.in|\.pdf(?:\?|$)/i.test(url+' '+label)?-1:/gallery|collection|product|image|editorial|story|residence|category|press|next|more|lookbook/i.test(url+' '+label)?1:0.2
export async function nodeFor(source:string,data:Omit<DiscoveredContent,'id'|'fingerprint'>):Promise<DiscoveredContent>{const clean={url:data.url,kind:data.kind,title:data.title,description:data.description,text:data.text,attribution:data.attribution,image:data.image,method:data.method};return {...clean,id:await contentNodeId(source,clean.url,clean.kind),fingerprint:await contentFingerprint(clean)}}
export async function extractPage(body:string,url:string,source:string,method:DiscoveredContent['method']='html') {
  if(new TextEncoder().encode(body).length>2000000)throw Error('response_budget')
  const {document}=parseHTML(body), title=plain(document.querySelector('h1')?.textContent??document.querySelector('title')?.textContent)
  const description=plain(document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content'))
  const copy=document.querySelector('article,main')?.cloneNode(true) as HTMLElement|null; copy?.querySelectorAll('script,style,nav,footer').forEach(n=>n.remove())
  const text=plain(copy?.textContent)
  const page=await nodeFor(source,{url,kind:pageKind(url,title??''),title,description,text,attribution:plain(document.querySelector('meta[name=author],meta[name=copyright]')?.getAttribute('content')),image:null,method})
  const contexts:DiscoveredContent[]=[];const images:DiscoveredContent[]=[],links:{url:string;label:string}[]=[], edges:{from:string;to:string;relation:'illustrates'|'links_to'}[]=[]
  let duplicates=0
  const add=async(values:string[],alt:string|null,width:number|null=null,height:number|null=null,context:{title?:string;description?:string;attribution?:string;license?:string;parentId?:string}={})=>{
    if(images.length>=300)return
    const variants=[...new Set(values.map(v=>safeUrl(v,url)).filter((v):v is string=>Boolean(v)))].filter(v=>!/logo|sprite|favicon|icon/i.test(new URL(v).pathname)).slice(0,12)
    if(!variants.length)return
    const original=variants[0]
    const match=images.find(i=>i.image?.variants.some(v=>variants.includes(v)))
    if(match){duplicates++;const at=images.indexOf(match);images[at]=await nodeFor(source,{...match,image:{...match.image!,variants:[...new Set([...match.image!.variants,...variants])].slice(0,12),alt:match.image!.alt??plain(alt)}});if(context.parentId)edges.push({from:context.parentId,to:images[at].id,relation:'illustrates'});return}
    images.push(await nodeFor(source,{url:original,kind:'image',title:plain(context.title)??null,description:plain(context.description)??description,text:null,attribution:plain(context.attribution),method,image:{url:original,variants,width:width&&width>0?width:null,height:height&&height>0?height:null,mime:null,bytes:null,sha256:null,alt:plain(alt),quality:Math.min(1,0.2+(alt?0.2:0)+(width&&width>=1000?0.3:0)+(description?0.1:0)+(variants.length>1?0.2:0)),access:'unverified',...(context.license&&safeUrl(context.license,url)?{licenseEvidence:[safeUrl(context.license,url)!]}:{})}}))
    if(context.parentId)edges.push({from:context.parentId,to:images.at(-1)!.id,relation:'illustrates'})
  }
  const srcset=(s:string)=>s.split(',').map(p=>{const [u,size]=p.trim().split(/\s+/);return{u,size:Number(size?.replace(/[wx]$/,''))||0}}).sort((a,b)=>b.size-a.size).map(p=>p.u)
  for(const el of document.querySelectorAll('img,source')) {
    const values=[el.getAttribute('data-original'),...srcset(el.getAttribute('srcset')??el.getAttribute('data-srcset')??''),el.getAttribute('data-src'),el.getAttribute('src')].filter((s):s is string=>Boolean(s))
    await add(values,el.getAttribute('alt'),Number(el.getAttribute('width'))||null,Number(el.getAttribute('height'))||null)
  }
  for(const el of document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]'))if(el.getAttribute('content'))await add([el.getAttribute('content')!],null)
  for(const el of document.querySelectorAll('a[href]')) {const target=safeUrl(el.getAttribute('href')!,url);if(!target)continue;if(/\.(png|jpe?g|webp|avif)(?:\?|$)/i.test(target))await add([target],plain(el.textContent));else if(links.length<500)links.push({url:target,label:plain(el.textContent)??''})}
  let scanned=0
  const walk=async(value:unknown,depth=0,context:{title?:string;description?:string;attribution?:string;license?:string;parentId?:string}={})=>{
    if(++scanned>1500||depth>12)return
    if(Array.isArray(value)){for(const x of value.slice(0,100))await walk(x,depth+1,context);return}
    if(!value||typeof value!=='object')return
    const row=value as Record<string,unknown>, ctx:{title?:string;description?:string;attribution?:string;license?:string;parentId?:string}={...context,title:typeof row.name==='string'?row.name:context.title,description:typeof row.description==='string'?row.description:context.description,attribution:typeof row.creditText==='string'?row.creditText:typeof row.copyrightNotice==='string'?row.copyrightNotice:context.attribution,license:typeof row.license==='string'?row.license:context.license}
    const type=String(row['@type']??'');const target=typeof row.url==='string'?safeUrl(row.url,url):null
    if(target&&contexts.length<100&&/Product|Article|CollectionPage/.test(type)){const child=await nodeFor(source,{url:target,kind:type.includes('Product')?'product':type.includes('Article')?'story':'collection',title:plain(ctx.title),description:plain(ctx.description),text:null,attribution:plain(ctx.attribution),image:null,method:'json_ld'});if(child.id!==page.id){contexts.push(child);edges.push({from:context.parentId??page.id,to:child.id,relation:'links_to'});ctx.parentId=child.id}}
    if(typeof row.contentUrl==='string')await add([row.contentUrl],null,null,null,ctx)
    for(const [key,v]of Object.entries(row)) {
      if(['image','imageUrl','originalUrl','thumbnailUrl'].includes(key)&&typeof v==='string')await add([v],null,null,null,ctx)
      if(['url','next','nextPage'].includes(key)&&typeof v==='string'){const target=safeUrl(v,url);if(target&&links.length<500)links.push({url:target,label:key})}
      if(typeof v==='object')await walk(v,depth+1,ctx)
    }
  }
  for(const el of document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"]')){try{await walk(JSON.parse(el.textContent??''))}catch{/* invalid publisher data is not evaluated */}}
  if(/^\s*[[{]/.test(body)){try{await walk(JSON.parse(body))}catch{/* no executable fallback */}}
  for(const image of images)edges.push({from:page.id,to:image.id,relation:'illustrates'})
  return {page,images,links,edges,contexts,duplicates,scripted:document.querySelectorAll('script[src]').length>0}
}
