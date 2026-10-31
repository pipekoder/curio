// Assembly choreography bound to the real request lifecycle, never to a
// fixed timer. Stream plays at least its minimum, lattice holds until the
// edition settles (however long that takes), resolve always plays in full.
export type AssemblyPhase='idle'|'stream'|'lattice'|'resolve'|'done'

export class AssemblyDirector{
  phase:AssemblyPhase='idle'
  t=0
  private t0=0
  private saturatedAt=0
  private responded=false
  private settled=false
  constructor(
    private now:()=>number=()=>performance.now(),
    private streamMin=900,
    private latticeMin=700,
    private resolveMs=600,
  ){}

  start():void{
    this.phase='stream'
    this.t=0
    this.t0=this.now()
    this.responded=false
    this.settled=false
  }

  onResponse():void{
    this.responded=true
  }

  onSettled():void{
    this.responded=true
    this.settled=true
  }

  update():{phase:AssemblyPhase;t:number;holdMs:number}{
    const now=this.now()
    if(this.phase==='stream'){
      this.t=Math.min(1,(now-this.t0)/this.streamMin)
      if(this.t>=1&&this.responded){this.phase='lattice';this.t0=now;this.t=0;this.saturatedAt=0}
    }else if(this.phase==='lattice'){
      this.t=Math.min(1,(now-this.t0)/this.latticeMin)
      if(this.t>=1&&this.settled){this.phase='resolve';this.t0=now;this.t=0;this.saturatedAt=0}
    }else if(this.phase==='resolve'){
      this.t=Math.min(1,(now-this.t0)/this.resolveMs)
      if(this.t>=1){this.phase='done';this.t=1}
    }
    if(this.t>=1&&!this.saturatedAt)this.saturatedAt=now
    if(this.t<1)this.saturatedAt=0
    const holdMs=this.phase==='done'||this.phase==='idle'||this.t<1?0:now-this.saturatedAt
    return {phase:this.phase,t:this.t,holdMs}
  }

  reset():void{
    this.phase='idle'
    this.t=0
    this.saturatedAt=0
  }
}
