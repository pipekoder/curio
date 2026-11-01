// Browsers may omit Origin on same-origin GETs. Require both browser request
// context and a same-origin Referer in that case; writes always need Origin.
export function allowedOperatorOrigin(request:Request,publicOrigin:string){
  const origin=request.headers.get('Origin')
  if(origin!==null)return origin===publicOrigin
  if(request.method!=='GET'||request.headers.get('Sec-Fetch-Site')?.toLowerCase()!=='same-origin')return false
  const referer=request.headers.get('Referer')
  if(!referer)return false
  try{return new URL(referer).origin===new URL(publicOrigin).origin}catch{return false}
}
