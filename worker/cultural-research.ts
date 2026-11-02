import {z} from 'zod'
import {isSafeHttpsUrl} from '../shared/url-policy'

const researchInput=z.strictObject({query:z.string().trim().min(3).max(160),urls:z.array(z.url().max(2048)).min(1).max(3),quote:z.string().trim().min(3).max(200).optional()})
export type ResearchInput=z.infer<typeof researchInput>
export type ResearchSource={id:string;url:string;origin:string;retrievedAt:string;sha256:string;excerpt:string;passage:{id:string;start:number;end:number;documentSha256:string;textSha256:string};relevance:number;sourceQuality:number;rank:number;quoteMatch:'text_match_only_not_rights_verified'|'not_found'|null;verification:'pending';rights:'pending';attribution:{author:null;publishedAt:null}}
type Cache={match(request:Request):Promise<Response|undefined>;put(request:Request,response:Response):Promise<void>}
const normalize=(value:string)=>value.replace(/\s+/g,' ').trim()
const safeUrl=(raw:string,allowlist:ReadonlySet<string>)=>{
 const url=new URL(raw)
 if(!isSafeHttpsUrl(raw)||!allowlist.has(url.origin))throw Error('Research source is not allowlisted')
 for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key)
 url.searchParams.sort()
 return url
}
const textFromHtml=(html:string)=>normalize(html.replace(/<(?:script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|svg|template)\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>'))
async function bounded(response:Response){
 const type=response.headers.get('content-type')?.split(';')[0].toLowerCase()
 if(!response.ok||!['text/html','text/plain'].includes(type??'')||Number(response.headers.get('content-length')??0)>131072)throw Error('Unavailable or unsupported research source')
 const reader=response.body?.getReader();if(!reader)throw Error('Empty research source')
 let size=0,result='';const decoder=new TextDecoder()
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>131072)throw Error('Research source exceeds bound');result+=decoder.decode(chunk.value,{stream:true})}result+=decoder.decode()}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 return type==='text/html'?textFromHtml(result):normalize(result)
}
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')
const terms=(query:string)=>[...new Set(query.toLowerCase().match(/[a-z]{4,}/g)??[])].slice(0,12)

// Retrieval is evidence collection, never automatic factual or copyright approval.
export async function researchPublicSources(input:unknown,origins:string,dependencies:{fetcher?:typeof fetch;cache?:Cache;sourceQuality?:Readonly<Record<string,number>>;onPassage?:(proof:{id:string;sourceId:string;documentSha256:string;textSha256:string;start:number;end:number;url:string})=>Promise<void>}={}){
 const request=researchInput.parse(input),allowlist=new Set(origins.split(',').map(value=>value.trim()).filter(Boolean).map(value=>new URL(value).origin))
 if(!allowlist.size||allowlist.size>20)throw Error('Research allowlist unavailable')
 const urls=[...new Set(request.urls.map(raw=>safeUrl(raw,allowlist).href))]
 const results:ResearchSource[]=[]
 for(const url of urls){
  const cacheKey=new Request(url),hit=await dependencies.cache?.match(cacheKey)
  const response=hit??await (dependencies.fetcher??fetch)(url,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html, text/plain'}})
  const text=await bounded(response)
  const retrievedAt=hit?.headers.get('X-Curio-Retrieved-At')??new Date().toISOString()
  if(!hit&&dependencies.cache)await dependencies.cache.put(cacheKey,new Response(text,{headers:{'Content-Type':'text/plain','Cache-Control':'max-age=86400','X-Curio-Retrieved-At':retrievedAt}}))
  const sha256=await digest(text),queryTerms=terms(request.query),lower=text.toLowerCase()
  const matched=queryTerms.filter(term=>lower.includes(term)).length,relevance=queryTerms.length?matched/queryTerms.length:0
  if(relevance===0)continue
  const first=queryTerms.map(term=>lower.indexOf(term)).filter(index=>index>=0).sort((a,b)=>a-b)[0]??0
  const start=Math.max(0,first-160),end=Math.min(text.length,first+1840),excerpt=text.slice(start,end)
  const id=`source:${(await digest(url)).slice(0,32)}`,passageId=`passage:${(await digest(`${url}:${sha256}:${start}:${end}`)).slice(0,32)}`
  const textSha256=await digest(excerpt)
  await dependencies.onPassage?.({id:passageId,sourceId:id,documentSha256:sha256,textSha256,start,end,url})
  const origin=new URL(url).origin,configuredQuality=dependencies.sourceQuality?.[origin],sourceQuality=typeof configuredQuality==='number'&&configuredQuality>=0&&configuredQuality<=1?configuredQuality:0.5
  results.push({id,url,origin,retrievedAt,sha256,excerpt,passage:{id:passageId,start,end,documentSha256:sha256,textSha256},relevance,sourceQuality,rank:0.8*relevance+0.2*sourceQuality,quoteMatch:request.quote?(text.includes(normalize(request.quote))?'text_match_only_not_rights_verified':'not_found'):null,verification:'pending',rights:'pending',attribution:{author:null,publishedAt:null}})
 }
 const seen=new Set<string>()
 return {sources:results.sort((a,b)=>b.rank-a.rank).filter(item=>!seen.has(item.sha256)&&Boolean(seen.add(item.sha256))),modelCalls:0 as const,mode:'lexical_only' as const}
}
