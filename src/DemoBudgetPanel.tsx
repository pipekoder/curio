import {useCallback,useEffect,useState} from 'react'

type BudgetStatus={
  demoTesting:{enabled:boolean;authenticated:boolean;active:boolean}
  lifetime:{total:number;used:number;remaining:number}
  day:{total:number;used:number;remaining:number;resetAt:string}
  perIp:{hourly:{used:number;resetAt:string}}|null
  demoTestingWindow?:{limit:number;used:number;remaining:number;resetAt:string}
}
type ResetResult={resetApplied:boolean;globalLimitBlocking:'global_lifetime'|'global_daily'|null}
const endpoint='/api/operator/catalog/intelligence/budget'
async function budgetRequest<T>(path:string,token:string,method:'GET'|'POST'='GET'){
  const response=await fetch(`${endpoint}${path}`,{method,credentials:'same-origin',headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})})
  let value:T&{error?:string}
  try{value=await response.json() as T&{error?:string}}catch{throw Error(`Budget request failed (${response.status}).`)}
  if(!response.ok)throw Error(value.error??`Budget request failed (${response.status}).`)
  return value
}
export default function DemoBudgetPanel({token}:{token:string}){
  const [status,setStatus]=useState<BudgetStatus|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const refresh=useCallback(async()=>{const next=await budgetRequest<BudgetStatus>('/status',token);setStatus(next);return next},[token])
  useEffect(()=>{let active=true;void budgetRequest<BudgetStatus>('/status',token).then(value=>{if(active){setStatus(value);setError('')}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Budget status unavailable.')});return()=>{active=false}},[token])
  const reset=async()=>{
    if(!status?.demoTesting.enabled||!window.confirm('Reset your current Demo testing rate limits? Daily and lifetime usage will remain unchanged.'))return
    setBusy(true);setError('');setNotice('')
    try{
      const result=await budgetRequest<ResetResult>('/reset-demo',token,'POST')
      if(!result.resetApplied)throw Error('Demo usage reset was not confirmed.')
      const next=await refresh()
      const blocker=result.globalLimitBlocking??(next.lifetime.remaining<4?'global_lifetime':next.day.remaining<4?'global_daily':null)
      setNotice(blocker?`Short-term usage reset. The shared ${blocker==='global_lifetime'?'lifetime':'daily'} limit still blocks another four-unit generation.`:'Demo usage reset. Current short-term allowances are available again.')
    }catch(cause){setError(cause instanceof Error?cause.message:'Demo usage reset failed.')}finally{setBusy(false)}
  }
  return <section className="studio-panel studio-budget" aria-label="AI Budget and Demo Usage"><div><span>AI BUDGET / DEMO USAGE</span><h2>Testing allowance</h2><p>Current operator and Demo Tester limits. Shared AI usage is never erased.</p></div><div className="studio-budget-content">
    {status?<><p><strong>Demo Testing Mode:</strong> {status.demoTesting.enabled?'Active':'Inactive'}</p><dl><dt>Current ordinary IP hourly usage</dt><dd>{status.perIp?.hourly.used??'Unavailable'} units</dd>{status.demoTestingWindow&&<><dt>Demo 15-minute usage</dt><dd>{status.demoTestingWindow.used} / {status.demoTestingWindow.limit} units</dd></>}<dt>Remaining daily units</dt><dd>{status.day.remaining} / {status.day.total}</dd><dt>Remaining lifetime units</dt><dd>{status.lifetime.remaining} / {status.lifetime.total}</dd><dt>Next automatic reset</dt><dd>{status.demoTestingWindow?.resetAt??status.perIp?.hourly.resetAt??status.day.resetAt}</dd></dl>{status.demoTesting.enabled&&<><p>{status.demoTesting.authenticated?'Authenticated Demo Tester session active.':'No Demo Tester session. Reset applies to this operator IP and Article Preparation limits.'}</p><button type="button" disabled={busy} onClick={()=>void reset()}>{busy?'Resetting…':'Reset Demo Usage'}</button></>}</>:<p>Budget status unavailable.</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="studio-error">{error}</p>}
  </div></section>
}
