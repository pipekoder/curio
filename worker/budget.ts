import { z } from 'zod'

// One SQLite DO serializes every reservation. Charges are never refunded:
// even a failed provider request may have incurred a charge upstream.
export class InferenceBudget {
  constructor(private state: DurableObjectState) {
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS demo_leases (id TEXT PRIMARY KEY, tester TEXT NOT NULL, expires INTEGER NOT NULL)')
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS reservation_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, units INTEGER NOT NULL, outcome TEXT NOT NULL, policy TEXT NOT NULL)')
  }
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url)
    const now=Date.now(),minute=60000,hour=3600000,day=86400000
    if(request.method==='GET'&&url.pathname==='/status'){
      const policy=z.strictObject({ceiling:z.number().int().min(1).max(500),daily:z.number().int().min(1).max(160),demo:z.boolean()}).safeParse({ceiling:Number(url.searchParams.get('ceiling')),daily:Number(url.searchParams.get('daily')),demo:url.searchParams.get('demo')==='true'})
      if(!policy.success)return Response.json({error:'Invalid status policy'},{status:400})
      const used=(key:string)=>this.state.storage.sql.exec<{count:number}>('SELECT count FROM counters WHERE key = ?',key).toArray()[0]?.count??0
      const lifetimeUsed=used('lifetime'),dayUsed=used(`day:${Math.floor(now/day)}`)
      const recent=this.state.storage.sql.exec<{at:number;units:number;outcome:string;policy:string}>('SELECT at,units,outcome,policy FROM reservation_events ORDER BY id DESC LIMIT 20').toArray()
      return Response.json({mode:policy.data.demo?'demo':'standard',lifetime:{total:policy.data.ceiling,used:lifetimeUsed,remaining:Math.max(0,policy.data.ceiling-lifetimeUsed),resetAt:null},day:{total:policy.data.daily,used:dayUsed,remaining:Math.max(0,policy.data.daily-dayUsed),resetAt:new Date((Math.floor(now/day)+1)*day).toISOString()},hourResetAt:new Date((Math.floor(now/hour)+1)*hour).toISOString(),testerLimits:policy.data.demo?{hour:40,day:120,maxConcurrent:2}:null,recent:recent.map(row=>({...row,at:new Date(row.at).toISOString()}))})
    }
    if(request.method!=='POST')return new Response(null,{status:405})
    if(url.pathname==='/finish'){
      const finished=z.strictObject({id:z.string().uuid(),outcome:z.enum(['completed','fallback','error'])}).safeParse(await request.json())
      if(!finished.success)return Response.json({error:'Invalid completion'},{status:400})
      this.state.storage.transactionSync(()=>{
        const active=this.state.storage.sql.exec<{id:string}>('SELECT id FROM demo_leases WHERE id = ?',finished.data.id).toArray()[0]
        if(active){this.state.storage.sql.exec('DELETE FROM demo_leases WHERE id = ?',finished.data.id);this.record(Date.now(),0,finished.data.outcome,'demo')}
      })
      return Response.json({released:true})
    }
    if(url.pathname!=='/reserve'&&url.pathname!=='/')return new Response(null,{status:404})
    const parsed=z.strictObject({ip:z.string().regex(/^[a-f0-9]{64}$/),ceiling:z.number().int().min(1).max(500),daily:z.number().int().min(1).max(160).default(20),demo:z.boolean().default(false),demoTester:z.string().regex(/^[a-f0-9]{64}$/).optional(),units:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]).default(1),samAssetId:z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),editorialPilot:z.boolean().optional()}).safeParse(await request.json())
    if(!parsed.success)return Response.json({error:'Invalid reservation'},{status:400})
    const {ip,ceiling,daily,demo,demoTester,units,samAssetId,editorialPilot=false}=parsed.data
    if((!demo&&(ceiling>100||daily!==20||demoTester))||(demo&&(ceiling<daily||demoTester&&units!==4))||(editorialPilot&&(units!==4||samAssetId)))return Response.json({error:'Invalid policy'},{status:400})
    const result=this.state.storage.transactionSync(()=>{
      this.state.storage.sql.exec('DELETE FROM counters WHERE expires > 0 AND expires <= ?',now)
      this.state.storage.sql.exec('DELETE FROM demo_leases WHERE expires <= ?',now)
      if(demoTester){
        const active=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT COUNT(*) AS count,MIN(expires) AS expires FROM demo_leases WHERE tester = ?',demoTester).toArray()[0]
        if((active?.count??0)>=2){this.record(now,units,'concurrency_denied','demo');return {allowed:false,retryAfter:Math.max(1,Math.ceil(((active?.expires??now+minute)-now)/1000))}}
      }
      const counters=[
        ...(samAssetId?[{key:`sam-once:${samAssetId}`,limit:1,expires:0}]:[]),
        {key:'lifetime',limit:ceiling,expires:0},
        {key:`day:${Math.floor(now/day)}`,limit:daily,expires:(Math.floor(now/day)+1)*day},
        {key:`hour:${ip}:${Math.floor(now/hour)}`,limit:demoTester?40:editorialPilot?8:units===4?4:3,expires:(Math.floor(now/hour)+1)*hour},
        ...(demoTester?[{key:`tester-hour:${demoTester}:${Math.floor(now/hour)}`,limit:40,expires:(Math.floor(now/hour)+1)*hour},{key:`tester-day:${demoTester}:${Math.floor(now/day)}`,limit:120,expires:(Math.floor(now/day)+1)*day}]:[]),
        {key:`cooldown:${ip}`,limit:demoTester?2:1,expires:now+minute},
      ]
      for(const counter of counters){
        const row=this.state.storage.sql.exec<{count:number;expires:number}>('SELECT count,expires FROM counters WHERE key = ?',counter.key).toArray()[0]
        const cost=counter.key.startsWith('cooldown:')||counter.key.startsWith('sam-once:')?1:units
        if((row?.count??0)+cost>counter.limit){this.record(now,units,'limit_denied',demo?'demo':'standard');return {allowed:false,retryAfter:counter.expires?Math.max(1,Math.ceil(((row?.expires??counter.expires)-now)/1000)):86400}}
      }
      for(const counter of counters)this.state.storage.sql.exec('INSERT INTO counters(key,count,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+excluded.count',counter.key,counter.key.startsWith('cooldown:')||counter.key.startsWith('sam-once:')?1:units,counter.expires)
      const reservationId=demoTester?crypto.randomUUID():undefined
      if(reservationId)this.state.storage.sql.exec('INSERT INTO demo_leases(id,tester,expires) VALUES(?,?,?)',reservationId,demoTester,now+180000)
      this.record(now,units,'reserved',demo?'demo':'standard')
      return {allowed:true,retryAfter:0,...(reservationId?{reservationId}:{})}
    })
    return Response.json(result)
  }
  private record(at:number,units:number,outcome:string,policy:string){
    this.state.storage.sql.exec('INSERT INTO reservation_events(at,units,outcome,policy) VALUES(?,?,?,?)',at,units,outcome,policy)
    this.state.storage.sql.exec('DELETE FROM reservation_events WHERE id NOT IN(SELECT id FROM reservation_events ORDER BY id DESC LIMIT 50)')
  }
}
