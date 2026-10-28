import { createHash } from 'node:crypto'
import { imageDimensions } from '../worker/asset-classifier'
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { chromium, type Browser } from '@playwright/test'
import { discoveryUrl } from '../shared/discovery'
import type { DiscoveryConfig, DiscoveryTransport, PageResponse } from './core'
const blocked=new BlockList()
for(const [base,bits]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(base,bits,'ipv4')
export const isPublicIPv4=(address:string)=>isIP(address)===4&&!blocked.check(address,'ipv4')
export function authorizeUrl(url:string,hosts:readonly string[]){const parsed=discoveryUrl.parse(url);const u=new URL(parsed);if(isIP(u.hostname)||!hosts.includes(u.hostname)||u.port)throw Error('disallowed_host');return u}
export async function resolvePublicAddress(host:string,resolve:(host:string)=>Promise<{address:string}[]>=h=>lookup(h,{all:true,family:4}),timeoutMs=8000,signal?:AbortSignal){
  if(signal?.aborted)throw Error('cancelled')
  let timer:ReturnType<typeof setTimeout>|undefined;let abort:()=>void=()=>{}
  try{
    const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('request_timeout')),timeoutMs);abort=()=>reject(Error('cancelled'));signal?.addEventListener('abort',abort,{once:true})})
    const addresses=await Promise.race([resolve(host),timeout]);if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw Error('unsafe_dns');return addresses[0].address
  }finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export class SecureDiscoveryTransport implements DiscoveryTransport {
  private requests=0;private bytes=0;private browser?:Browser;private last=0;private extraDelay=0;private robots=new Map<string,string>();private deadline=Date.now();private locked=Promise.resolve()
  constructor(private config:DiscoveryConfig){this.deadline=Date.now()+config.maxTimeMs}
  metrics(){return{requests:this.requests,bytes:this.bytes}}
  private async raw(url:string,signal:AbortSignal):Promise<PageResponse>{
    const u=authorizeUrl(url,this.config.hosts)
    // Proxy DNS resolution cannot be safely pinned with the available generic
    // CONNECT contract. Fail closed instead of bypassing a managed proxy or
    // pretending that a preflight DNS lookup eliminates rebinding.
    if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)throw Error('proxy_dns_pinning_unverified')
    if(signal.aborted||Date.now()>this.deadline)throw Error('cancelled')
    if(this.requests>=this.config.maxRequests)throw Error('request_budget')
    this.requests++
    const wait=Math.max(0,this.last+Math.max(this.config.delayMs,this.extraDelay)-Date.now());if(wait)await new Promise<void>(r=>setTimeout(r,wait));this.last=Date.now()
    if(signal.aborted||Date.now()>this.deadline)throw Error('time_budget')
    const requestDeadline=Math.min(this.deadline,Date.now()+this.config.requestTimeoutMs)
    const address=await resolvePublicAddress(u.hostname,undefined,Math.max(1,requestDeadline-Date.now()),signal)
    // Fresh connection with pinned validated IPv4, original TLS server name and
    // certificate validation. No second DNS resolution, redirects, cookies/auth.
    return new Promise<PageResponse>((resolve,reject)=>{
      const req=request(u,{method:!this.config.fingerprintImages&&/\.(png|jpe?g|webp|avif)(?:\?|$)/i.test(u.href)?'HEAD':'GET',agent:false,servername:u.hostname,lookup:(_host,_options,cb)=>cb(null,address,4),headers:{'User-Agent':'CurioDiscovery/1.0','Accept':'text/html,application/json,application/xml,image/*','Accept-Encoding':'identity'},signal},res=>{
        const type=String(res.headers['content-type']??'').split(';')[0],location=res.headers.location
        if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();reject(Error('unsupported_encoding'));return}
        if(res.statusCode!==200){res.resume();resolve({status:res.statusCode??502,type,body:'',bytes:0,location});return}
        if(!/^(text\/(html|xml|plain|css|javascript)|application\/(json|ld\+json|xml|javascript)|image\/(jpeg|png|webp|avif))$/.test(type)){res.destroy();reject(Error('unsupported_media'));return}
        if(type.startsWith('image/')&&!this.config.fingerprintImages){res.destroy();resolve({status:200,type,body:'',bytes:0,length:Number(res.headers['content-length'])||undefined});return}
        const chunks:Buffer[]=[];let size=0
        res.on('data',(chunk:Buffer)=>{size+=chunk.length;this.bytes+=chunk.length;if(size>this.config.maxResponseBytes||this.bytes>this.config.maxBytes){res.destroy(Error('byte_budget'));return}chunks.push(chunk)})
        res.on('error',reject);res.on('end',()=>{const data=Buffer.concat(chunks);let width:number|undefined,height:number|undefined;if(type.startsWith('image/')){try{[width,height]=imageDimensions(data,type as 'image/png'|'image/jpeg'|'image/webp')}catch{/* dimensions remain unverified */}}resolve({status:200,type,body:type.startsWith('image/')?'':data.toString('utf8'),bytes:size,location,length:size,...(type.startsWith('image/')?{sha256:createHash('sha256').update(data).digest('hex'),width,height}:{})})})
      });const timer=setTimeout(()=>req.destroy(Error('request_timeout')),Math.max(1,requestDeadline-Date.now()));req.on('close',()=>clearTimeout(timer));req.setTimeout(this.config.requestTimeoutMs,()=>req.destroy(Error('request_timeout')));req.on('error',reject);req.end()
    })
  }
  async read(url:string,signal:AbortSignal):Promise<PageResponse>{
    // One shared queue for HTTP and every browser request: bounded concurrency 1.
    let unlock!:()=>void;const predecessor=this.locked;this.locked=new Promise<void>(r=>{unlock=r});await predecessor
    try{
      const u=authorizeUrl(url,this.config.hosts)
      if(!this.robots.has(u.origin)){
        const policy=await this.raw(new URL('/robots.txt',u).href,signal)
        if(policy.status!==200&&policy.status!==404)throw Error('robots_unavailable')
        const delay=robotsDelay(policy.body);if(delay>30000)throw Error('robots_delay_exceeds_budget');this.extraDelay=Math.max(this.extraDelay,delay);this.robots.set(u.origin,policy.status===404?'':policy.body)
      }
      if(!robotsAllows(this.robots.get(u.origin)!,u.pathname+u.search))throw Error('robots_disallowed')
      return await this.raw(url,signal)
    }finally{unlock()}
  }
  async render(url:string,signal:AbortSignal){
    if(signal.aborted)throw Error('cancelled')
    if(!this.browser)this.browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']})
    const context=await this.browser.newContext({serviceWorkers:'block',acceptDownloads:false,userAgent:'CurioDiscovery/1.0'})
    let incomplete=false,interactions=0,observedRequests=0
    const abort=()=>{void context.close()};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
    await context.routeWebSocket('**',route=>route.close())
    await context.route('**/*',async route=>{
      const r=route.request()
      if(++observedRequests>this.config.maxRequests){incomplete=true;await route.abort();void context.close();return}
      if(r.method()!=='GET'||['image','media','font'].includes(r.resourceType())){incomplete=true;await route.abort();return}
      try{const response=await this.read(r.url(),signal);if(response.status!==200){incomplete=true;await route.abort();return}await route.fulfill({status:200,contentType:response.type,body:response.body})}catch{incomplete=true;await route.abort()}
    })
    const page=await context.newPage();page.on('popup',popup=>{void popup.close()});page.on('download',download=>{void download.cancel()})
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:this.config.requestTimeoutMs})
      for(let i=0;i<this.config.scrolls;i++){if(signal.aborted)throw Error('cancelled');await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(150);interactions++}
      const buttons=page.getByRole('button',{name:/^(load more|show more|next|next image|view images|view image|open image|open gallery)$/i})
      for(let i=0;i<this.config.interactions;i++){if(signal.aborted)throw Error('cancelled');const button=buttons.first();if(!await button.isVisible().catch(()=>false))break;await button.click({timeout:1000});await page.waitForTimeout(150);interactions++}
      return{html:await page.content(),url:page.url(),interactions,incomplete:incomplete||interactions>=this.config.scrolls+this.config.interactions}
    }finally{signal.removeEventListener('abort',abort);await context.close()}
  }
  async close(){await this.browser?.close()}
}
function robotGroups(body:string){
  const groups:{agents:string[];rules:{key:string;value:string}[]}[]=[];let current={agents:[] as string[],rules:[] as {key:string;value:string}[]}
  for(const raw of body.split(/\r?\n/)){const line=raw.split('#')[0].trim(),at=line.indexOf(':');if(at<0)continue;const key=line.slice(0,at).toLowerCase(),value=line.slice(at+1).trim();if(key==='user-agent'){if(current.rules.length){groups.push(current);current={agents:[],rules:[]}}current.agents.push(value.toLowerCase())}else if(current.agents.length)current.rules.push({key,value})}
  groups.push(current);const specific=groups.filter(g=>g.agents.some(a=>a.includes('curiodiscovery')))
  return (specific.length?specific:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules).slice(0,2000)
}
export function robotsDelay(body:string){return Math.max(0,...robotGroups(body).filter(r=>r.key==='crawl-delay').map(r=>Number.isFinite(Number(r.value))?Number(r.value)*1000:0))}
export function robotsAllows(body:string,path:string){
  const rules=robotGroups(body).filter(r=>['allow','disallow'].includes(r.key)&&r.value&&r.value.length<512).flatMap(r=>{
    if(r.key==='allow'&&r.value.includes('*'))return[] // conservative: never widen a wildcard allow
    const exact=r.value.endsWith('$'),prefix=r.value.split('*')[0].replace(/\$$/,'')
    return (exact&&!r.value.includes('*')?path===prefix:path.startsWith(prefix))?[{prefix,allow:r.key==='allow'}]:[]
  })
  rules.sort((a,b)=>b.prefix.length-a.prefix.length||Number(b.allow)-Number(a.allow));return rules[0]?.allow??true
}
