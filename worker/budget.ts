import {z} from 'zod'
import {articlePreparationPolicy} from './article-preparation-policy'
import {DEFAULT_RATE_POLICY,ratePolicy} from './budget-policy'
import {demoTestingPolicy} from './demo-testing-policy'
import type {BudgetDenial,BudgetLimitType} from '../shared/budget-diagnostic'

// One SQLite DO serializes every reservation. Charges are never refunded:
// even a failed provider request may have incurred a charge upstream.
export class InferenceBudget {
  constructor(private state:DurableObjectState){
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_leases (id TEXT PRIMARY KEY, tester TEXT NOT NULL, expires INTEGER NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS article_prep_leases (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS reservation_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, units INTEGER NOT NULL, outcome TEXT NOT NULL, policy TEXT NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_reset_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, scope TEXT NOT NULL, ip_digest TEXT NOT NULL, tester_digest TEXT)')
  }
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url),now=Date.now(),minute=60000,hour=3600000,day=86400000
    if(url.pathname==='/status'&&(request.method==='GET'||request.method==='POST')){
      const input=request.method==='POST'?await request.json():{ceiling:Number(url.searchParams.get('ceiling')),daily:Number(url.searchParams.get('daily')),demo:url.searchParams.get('demo')==='true'}
      const parsed=z.strictObject({ceiling:z.number().int().min(1).max(500),daily:z.number().int().min(1).max(160),demo:z.boolean(),rates:ratePolicy.default(DEFAULT_RATE_POLICY),ip:z.string().regex(/^[a-f0-9]{64}$/).optional(),demoTester:z.string().regex(/^[a-f0-9]{64}$/).optional(),demoTestingPolicy:demoTestingPolicy.optional(),articlePreparationPolicy:articlePreparationPolicy.optional()}).safeParse(input)
      if(!parsed.success||!parsed.data.demo&&(parsed.data.ceiling>100||parsed.data.daily>100)||parsed.data.demoTestingPolicy&&(!parsed.data.demo||!parsed.data.demoTester||!parsed.data.ip))return Response.json({error:'Invalid status policy'},{status:400})
      const {ceiling,daily,ip,demoTester,rates,articlePreparationPolicy:prep,demoTestingPolicy:testing}=parsed.data
      const counterCache=new Map<string,{count:number;expires:number}>()
      const counter=(key:string)=>{if(!counterCache.has(key)){
        const row=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT count,expires FROM counters WHERE key = ?',key).toArray()[0]
        counterCache.set(key,row&&row.expires>0&&row.expires<=now?{count:0,expires:0}:row??{count:0,expires:0})
      }return counterCache.get(key)!}
      const used=(key:string)=>counter(key).count
      const lifetimeUsed=used('lifetime'),dayUsed=used(`day:${Math.floor(now/day)}`)
      const recent=this.state.storage.sql.exec<{at:number;units:number;outcome:string;policy:string}>('SELECT at,units,outcome,policy FROM reservation_events ORDER BY id DESC LIMIT 20').toArray()
      const recentDenials:Record<string,number>={}
      for(const row of recent)if(row.outcome.startsWith('denied:')){const kind=row.outcome.slice(7);recentDenials[kind]=(recentDenials[kind]??0)+1}
      const perIp=ip?{
        hourly:{used:used(`hour:${ip}:${Math.floor(now/hour)}`),standardLimit:rates.standardHourlyUnits,reviewedLimit:rates.reviewedHourlyUnits,pilotLimit:rates.pilotHourlyUnits,testerLimit:demoTester?rates.testerHourlyUnits:null,remainingForTester:demoTester?Math.max(0,rates.testerHourlyUnits-used(`hour:${ip}:${Math.floor(now/hour)}`)):null,remainingForStandard:Math.max(0,rates.standardHourlyUnits-used(`hour:${ip}:${Math.floor(now/hour)}`)),remainingForReviewed:Math.max(0,rates.reviewedHourlyUnits-used(`hour:${ip}:${Math.floor(now/hour)}`)),remainingForPilot:Math.max(0,rates.pilotHourlyUnits-used(`hour:${ip}:${Math.floor(now/hour)}`)),resetAt:new Date((Math.floor(now/hour)+1)*hour).toISOString()},
        cooldown:{used:used(`cooldown:${ip}`),limit:demoTester?2:1,remaining:Math.max(0,(demoTester?2:1)-used(`cooldown:${ip}`)),windowSeconds:rates.cooldownSeconds,resetAt:counter(`cooldown:${ip}`).expires?new Date(counter(`cooldown:${ip}`).expires).toISOString():null},
        ...(prep?{articlePreparation:{hourly:{used:used(`article-prep-hour:${ip}:${Math.floor(now/hour)}`),limit:prep.maxPerHour,remaining:Math.max(0,prep.maxPerHour-used(`article-prep-hour:${ip}:${Math.floor(now/hour)}`)),resetAt:new Date((Math.floor(now/hour)+1)*hour).toISOString()},daily:{used:used(`article-prep-day:${ip}:${Math.floor(now/day)}`),limit:prep.maxPerDay,remaining:Math.max(0,prep.maxPerDay-used(`article-prep-day:${ip}:${Math.floor(now/day)}`)),resetAt:new Date((Math.floor(now/day)+1)*day).toISOString()},window:{used:used(`article-prep-cooldown:${ip}`),limit:prep.windowLimit,remaining:Math.max(0,prep.windowLimit-used(`article-prep-cooldown:${ip}`)),seconds:prep.windowSeconds,resetAt:counter(`article-prep-cooldown:${ip}`).expires?new Date(counter(`article-prep-cooldown:${ip}`).expires).toISOString():null},concurrentLimit:prep.concurrency}}:{}),
      }:null
      const tester=demoTester?{hour:{used:used(`tester-hour:${demoTester}:${Math.floor(now/hour)}`),limit:rates.testerHourlyUnits,remaining:Math.max(0,rates.testerHourlyUnits-used(`tester-hour:${demoTester}:${Math.floor(now/hour)}`)),resetAt:new Date((Math.floor(now/hour)+1)*hour).toISOString()},day:{used:used(`tester-day:${demoTester}:${Math.floor(now/day)}`),limit:rates.testerDailyUnits,remaining:Math.max(0,rates.testerDailyUnits-used(`tester-day:${demoTester}:${Math.floor(now/day)}`)),resetAt:new Date((Math.floor(now/day)+1)*day).toISOString()},concurrent:{used:this.state.storage.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM demo_leases WHERE tester = ? AND expires > ?',demoTester,now).toArray()[0]?.count??0,limit:rates.testerConcurrent}}:null
      const windowMs=testing?testing.windowSeconds*1000:0,windowReset=testing?(Math.floor(now/windowMs)+1)*windowMs:0
      const windowUsed=testing?used(`demo-testing:${demoTester}:${testing.windowSeconds}:${Math.floor(now/windowMs)}`):0
      const blocker=testing?(lifetimeUsed+4>ceiling?'global_lifetime':dayUsed+4>daily?'global_daily':(tester?.concurrent.used??0)>=rates.testerConcurrent?'demo_tester_concurrency':(tester?.day.used??0)+4>rates.testerDailyUnits?'demo_tester_daily':windowUsed+4>testing.windowUnits?'demo_testing_window':null):null
      return Response.json({mode:parsed.data.demo?'demo':'standard',lifetime:{total:ceiling,used:lifetimeUsed,remaining:Math.max(0,ceiling-lifetimeUsed),resetAt:null},day:{total:daily,used:dayUsed,remaining:Math.max(0,daily-dayUsed),resetAt:new Date((Math.floor(now/day)+1)*day).toISOString()},hourResetAt:new Date((Math.floor(now/hour)+1)*hour).toISOString(),testerLimits:parsed.data.demo?{hour:rates.testerHourlyUnits,day:rates.testerDailyUnits,maxConcurrent:rates.testerConcurrent}:null,perIp,tester,...(testing?{demoTestingWindow:{seconds:testing.windowSeconds,limit:testing.windowUnits,used:windowUsed,remaining:Math.max(0,testing.windowUnits-windowUsed),resetAt:new Date(windowReset).toISOString(),canReserveFourUnits:!blocker,blockingLimitType:blocker}}:{}),effectiveRates:rates,recentDenials,recent:recent.map(row=>({...row,at:new Date(row.at).toISOString()}))})
    }
    if(request.method!=='POST')return new Response(null,{status:405})
    if(url.pathname==='/reset-demo'){
      const parsed=z.strictObject({ip:z.string().regex(/^[a-f0-9]{64}$/),demoTester:z.string().regex(/^[a-f0-9]{64}$/).optional(),windowSeconds:z.number().int().min(300).max(3600),articlePreparation:z.boolean()}).safeParse(await request.json())
      if(!parsed.success)return Response.json({error:'Invalid reset scope.'},{status:400})
      const {ip,demoTester,windowSeconds,articlePreparation}=parsed.data
      const keys=[`hour:${ip}:${Math.floor(now/hour)}`,`cooldown:${ip}`]
      if(demoTester)keys.push(`tester-hour:${demoTester}:${Math.floor(now/hour)}`,`demo-testing:${demoTester}:${windowSeconds}:${Math.floor(now/(windowSeconds*1000))}`)
      if(articlePreparation)keys.push(`article-prep-hour:${ip}:${Math.floor(now/hour)}`,`article-prep-cooldown:${ip}`)
      const scope=demoTester?(articlePreparation?'operator_ip,tester,article_preparation':'operator_ip,tester'):(articlePreparation?'operator_ip,article_preparation':'operator_ip')
      this.state.storage.transactionSync(()=>{
        for(const key of keys)this.state.storage.sql.exec('DELETE FROM counters WHERE key = ?',key)
        this.state.storage.sql.exec('INSERT INTO demo_reset_events(at,action,scope,ip_digest,tester_digest) VALUES(?,?,?,?,?)',now,'reset_demo_usage',scope,ip,demoTester??null)
      })
      return Response.json({resetApplied:true,operatorIpReset:true,testerWindowReset:Boolean(demoTester),articlePreparationReset:articlePreparation})
    }
    if(url.pathname==='/finish'){
      const finished=z.strictObject({id:z.string().uuid(),outcome:z.enum(['completed','fallback','error'])}).safeParse(await request.json())
      if(!finished.success)return Response.json({error:'Invalid completion'},{status:400})
      this.state.storage.transactionSync(()=>{
        const active=this.state.storage.sql.exec<{id:string}>('SELECT id FROM demo_leases WHERE id = ?',finished.data.id).toArray()[0]
        if(active){this.state.storage.sql.exec('DELETE FROM demo_leases WHERE id = ?',finished.data.id);this.record(Date.now(),0,finished.data.outcome,'demo')}
        const preparation=this.state.storage.sql.exec<{id:string}>('SELECT id FROM article_prep_leases WHERE id = ?',finished.data.id).toArray()[0]
        if(preparation){this.state.storage.sql.exec('DELETE FROM article_prep_leases WHERE id = ?',finished.data.id);this.record(Date.now(),0,finished.data.outcome,'article_preparation')}
      })
      return Response.json({released:true})
    }
    if(url.pathname!=='/reserve'&&url.pathname!=='/')return new Response(null,{status:404})
    const parsed=z.strictObject({ip:z.string().regex(/^[a-f0-9]{64}$/),ceiling:z.number().int().min(1).max(500),daily:z.number().int().min(1).max(160).default(20),demo:z.boolean().default(false),demoTester:z.string().regex(/^[a-f0-9]{64}$/).optional(),demoTestingPolicy:demoTestingPolicy.optional(),units:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]).default(1),samAssetId:z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),editorialPilot:z.boolean().optional(),articlePreparation:z.boolean().optional(),articlePreparationPolicy:articlePreparationPolicy.optional(),rates:ratePolicy.default(DEFAULT_RATE_POLICY)}).safeParse(await request.json())
    if(!parsed.success)return Response.json({error:'Invalid reservation'},{status:400})
    const {ip,ceiling,daily,demo,demoTester,demoTestingPolicy:testing,units,samAssetId,editorialPilot=false,articlePreparation=false,articlePreparationPolicy:prep,rates}=parsed.data
    if((!demo&&(ceiling>100||daily>100||demoTester))||(demo&&(ceiling<daily||demoTester&&units!==4))||(editorialPilot&&(units!==4||samAssetId))||(articlePreparation&&(units!==1||samAssetId||editorialPilot||demoTester||!prep))||(!articlePreparation&&prep)||(testing&&(!demo||!demoTester||units!==4||samAssetId||articlePreparation)))return Response.json({error:'Invalid policy'},{status:400})
    const result=this.state.storage.transactionSync(()=>{
      this.state.storage.sql.exec('DELETE FROM counters WHERE expires > 0 AND expires <= ?',now)
      this.state.storage.sql.exec('DELETE FROM demo_leases WHERE expires <= ?',now)
      this.state.storage.sql.exec('DELETE FROM article_prep_leases WHERE expires <= ?',now)
      const deny=(limitType:BudgetLimitType,limit:number,used:number,measure:BudgetDenial['measure'],expires:number,policy:string)=>{
        const denial:BudgetDenial={limitType,limit,used,remaining:Math.max(0,limit-used),requestedUnits:units,measure,...(expires?{retryAfterSeconds:Math.max(1,Math.ceil((expires-now)/1000)),resetAt:new Date(expires).toISOString()}:{})}
        this.record(now,units,`denied:${limitType}`,policy)
        return {allowed:false,retryAfter:denial.retryAfterSeconds??86400,denial}
      }
      if(prep){
        const active=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT COUNT(*) AS count,MIN(expires) AS expires FROM article_prep_leases').toArray()[0]
        if((active?.count??0)>=prep.concurrency)return deny('article_preparation_concurrency',prep.concurrency,active?.count??0,'concurrent',active?.expires??now+30000,'article_preparation')
      }
      if(demoTester){
        const active=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT COUNT(*) AS count,MIN(expires) AS expires FROM demo_leases WHERE tester = ?',demoTester).toArray()[0]
        if((active?.count??0)>=rates.testerConcurrent)return deny('demo_tester_concurrency',rates.testerConcurrent,active?.count??0,'concurrent',active?.expires??now+minute,'demo')
      }
      const counters:{key:string;limit:number;expires:number;type:BudgetLimitType;measure:BudgetDenial['measure'];cost:number}[]=[
        ...(samAssetId?[{key:`sam-once:${samAssetId}`,limit:1,expires:0,type:'sam_once_per_asset' as const,measure:'requests' as const,cost:1}]:[]),
        {key:'lifetime',limit:ceiling,expires:0,type:'global_lifetime',measure:'units',cost:units},
        {key:`day:${Math.floor(now/day)}`,limit:daily,expires:(Math.floor(now/day)+1)*day,type:'global_daily',measure:'units',cost:units},
        ...(!testing?[{key:articlePreparation?`article-prep-hour:${ip}:${Math.floor(now/hour)}`:`hour:${ip}:${Math.floor(now/hour)}`,limit:prep?.maxPerHour??(demoTester?rates.testerHourlyUnits:editorialPilot?rates.pilotHourlyUnits:units===4?rates.reviewedHourlyUnits:rates.standardHourlyUnits),expires:(Math.floor(now/hour)+1)*hour,type:articlePreparation?'article_preparation_hourly' as const:'per_ip_hourly' as const,measure:'units' as const,cost:units}]:[]),
        ...(prep?[{key:`article-prep-day:${ip}:${Math.floor(now/day)}`,limit:prep.maxPerDay,expires:(Math.floor(now/day)+1)*day,type:'article_preparation_daily' as const,measure:'units' as const,cost:units}]:[]),
        ...(demoTester?[...(!testing?[{key:`tester-hour:${demoTester}:${Math.floor(now/hour)}`,limit:rates.testerHourlyUnits,expires:(Math.floor(now/hour)+1)*hour,type:'demo_tester_hourly' as const,measure:'units' as const,cost:units}]:[]),{key:`tester-day:${demoTester}:${Math.floor(now/day)}`,limit:rates.testerDailyUnits,expires:(Math.floor(now/day)+1)*day,type:'demo_tester_daily' as const,measure:'units' as const,cost:units}]:[]),
        ...(testing?[{key:`demo-testing:${demoTester}:${testing.windowSeconds}:${Math.floor(now/(testing.windowSeconds*1000))}`,limit:testing.windowUnits,expires:(Math.floor(now/(testing.windowSeconds*1000))+1)*testing.windowSeconds*1000,type:'demo_testing_window' as const,measure:'units' as const,cost:units}]:[{key:articlePreparation?`article-prep-cooldown:${ip}`:`cooldown:${ip}`,limit:prep?.windowLimit??(demoTester?2:1),expires:now+(prep?prep.windowSeconds*1000:rates.cooldownSeconds*1000),type:articlePreparation?'article_preparation_window' as const:'per_ip_cooldown' as const,measure:'requests' as const,cost:1}]),
      ]
      for(const counter of counters){
        const row=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT count,expires FROM counters WHERE key = ?',counter.key).toArray()[0]
        if((row?.count??0)+counter.cost>counter.limit)return deny(counter.type,counter.limit,row?.count??0,counter.measure,row?.expires??counter.expires,articlePreparation?'article_preparation':demo?'demo':'standard')
      }
      for(const counter of counters)this.state.storage.sql.exec('INSERT INTO counters(key,count,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count',counter.key,counter.cost,counter.expires)
      const reservationId=demoTester||prep?crypto.randomUUID():undefined
      if(reservationId&&demoTester)this.state.storage.sql.exec('INSERT INTO demo_leases(id,tester,expires) VALUES(?,?,?)',reservationId,demoTester,now+180000)
      if(reservationId&&prep)this.state.storage.sql.exec('INSERT INTO article_prep_leases(id,expires) VALUES(?,?)',reservationId,now+30000)
      this.record(now,units,'reserved',articlePreparation?'article_preparation':demo?'demo':'standard')
      return {allowed:true,retryAfter:0,...(reservationId?{reservationId}:{})}
    })
    return Response.json(result)
  }
  private record(at:number,units:number,outcome:string,policy:string){
    this.state.storage.sql.exec('INSERT INTO reservation_events(at,units,outcome,policy) VALUES(?,?,?,?)',at,units,outcome,policy)
    this.state.storage.sql.exec('DELETE FROM reservation_events WHERE id NOT IN(SELECT id FROM reservation_events ORDER BY id DESC LIMIT 50)')
  }
}
