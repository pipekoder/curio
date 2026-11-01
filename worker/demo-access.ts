import { timingSafeEqual } from 'hono/utils/buffer'
import type { Bindings } from './index'

const cookieName='__Host-curio-demo'
const hour=3600000
const encode=(value:string)=>new TextEncoder().encode(value)
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')
async function hmac(salt:string,value:string){
  const key=await crypto.subtle.importKey('raw',encode(salt),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return hex(await crypto.subtle.sign('HMAC',key,encode(value)))
}
const validId=(value:string)=>/^[a-z0-9_-]{1,40}$/.test(value)

export function demoCapsValid(env:Bindings){
  const daily=Number(env.EDITORIAL_DEMO_DAILY_UNITS),lifetime=Number(env.EDITORIAL_DEMO_LIFETIME_UNITS)
  return Number.isInteger(daily)&&daily>=4&&daily<=160&&Number.isInteger(lifetime)&&lifetime>=daily&&lifetime<=500
}
export function demoPolicyEnabled(env:Bindings){
  return env.EDITORIAL_DEMO_BUDGET_ENABLED==='true'&&env.MAGAZINE_AI_ENABLED==='true'&&env.EDITORIAL_REVIEW_ENABLED==='true'
    &&env.EDITORIAL_PUBLIC_AI_ENABLED==='true'&&demoCapsValid(env)
    &&Boolean(env.INFERENCE_BUDGET&&env.RATE_LIMIT_SALT&&env.RATE_LIMIT_SALT.length>=32)
}

export async function issueDemoSession(request:Request,env:Bindings){
  const origin=env.PUBLIC_APP_ORIGIN,ip=request.headers.get('CF-Connecting-IP')??'',auth=request.headers.get('Authorization')??''
  if(!demoPolicyEnabled(env)||!origin||request.headers.get('Origin')!==origin||!ip||ip.length>64||!auth.startsWith('Bearer ')||auth.length>512)
    return new Response(JSON.stringify({error:'Demo access unavailable.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  const token=auth.slice(7)
  if(token.length<32)return new Response(JSON.stringify({error:'Demo access unavailable.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  let identity:string|null=null
  let credentialMarker:string|null=null
  if(env.CATALOG_OPERATOR_ENABLED==='true'&&env.CATALOG_OPERATOR_TOKEN&&env.CATALOG_OPERATOR_TOKEN.length>=32&&await timingSafeEqual(token,env.CATALOG_OPERATOR_TOKEN)){
    identity='owner';credentialMarker=env.CATALOG_OPERATOR_TOKEN
  }
  if(!identity&&env.EDITORIAL_TESTER_TOKEN_HASHES){
    const digest=await crypto.subtle.digest('SHA-256',encode(token)),hash=hex(digest)
    const entries=env.EDITORIAL_TESTER_TOKEN_HASHES.slice(0,4000).split(',').slice(0,10).map(part=>part.trim().split(':'))
    for(const [id,expected] of entries)if(validId(id)&&/^[a-f0-9]{64}$/.test(expected)&&await timingSafeEqual(hash,expected)){identity=`tester_${id}`;credentialMarker=expected}
  }
  if(!identity||!credentialMarker)return new Response(JSON.stringify({error:'Demo access unavailable.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
  const expiry=Date.now()+hour,ipHash=await hmac(env.RATE_LIMIT_SALT!,`demo-ip:${ip}`)
  const credentialHash=await hmac(env.RATE_LIMIT_SALT!,`demo-credential:${credentialMarker}`)
  const payload=`${identity}.${expiry}.${ipHash}.${credentialHash}`,signature=await hmac(env.RATE_LIMIT_SALT!,`demo-session:${payload}`)
  return new Response(JSON.stringify({authorized:true,expiresAt:new Date(expiry).toISOString()}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`${cookieName}=${payload}.${signature}; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict`}})
}

export async function demoIdentity(request:Request,env:Bindings,ip:string):Promise<string|null>{
  if(!demoPolicyEnabled(env))return null
  const cookie=request.headers.get('Cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)
  if(!cookie||cookie.length>320)return null
  const parts=cookie.split('.')
  if(parts.length!==5)return null
  const [identity,expiryText,ipHash,credentialHash,signature]=parts
  if(identity!=='owner'&&!/^tester_[a-z0-9_-]{1,40}$/.test(identity))return null
  let marker:string|undefined
  if(identity==='owner'){
    if(env.CATALOG_OPERATOR_ENABLED!=='true'||!env.CATALOG_OPERATOR_TOKEN||env.CATALOG_OPERATOR_TOKEN.length<32)return null
    marker=env.CATALOG_OPERATOR_TOKEN
  }else marker=env.EDITORIAL_TESTER_TOKEN_HASHES?.slice(0,4000).split(',').slice(0,10).map(part=>part.trim().split(':')).find(([id,hash])=>id===identity.slice(7)&&/^[a-f0-9]{64}$/.test(hash))?.[1]
  if(!marker||!await timingSafeEqual(credentialHash,await hmac(env.RATE_LIMIT_SALT!,`demo-credential:${marker}`)))return null
  const expiry=Number(expiryText)
  if(!Number.isSafeInteger(expiry)||expiry<Date.now()||expiry>Date.now()+hour)return null
  const expectedIp=await hmac(env.RATE_LIMIT_SALT!,`demo-ip:${ip}`)
  if(!await timingSafeEqual(ipHash,expectedIp))return null
  const expected=await hmac(env.RATE_LIMIT_SALT!,`demo-session:${identity}.${expiryText}.${ipHash}.${credentialHash}`)
  return await timingSafeEqual(signature,expected)?identity:null
}

export function clearDemoSession(request:Request,env:Bindings){
  if(!env.PUBLIC_APP_ORIGIN||request.headers.get('Origin')!==env.PUBLIC_APP_ORIGIN)return new Response(null,{status:403})
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store','Set-Cookie':`${cookieName}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`}})
}
