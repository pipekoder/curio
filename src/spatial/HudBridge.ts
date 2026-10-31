// The only React<->scene seam. React pushes UI state in; the scene emits
// visitor events out. No fetching, no DOM, no three.js here.
export type SpatialEvent=
  |{type:'prompt';prompt:string}
  |{type:'arrive';index:number}
  |{type:'pick';assetId:string}
  |{type:'network';open:boolean}
  |{type:'dive';assetId:string}
  |{type:'surprise';assetId:string}
  |{type:'clear';removed:string[]}

export class HudBridge{
  private listeners=new Set<(event:SpatialEvent)=>void>()
  on(listener:(event:SpatialEvent)=>void):()=>void{
    this.listeners.add(listener)
    return ()=>{this.listeners.delete(listener)}
  }
  emit(event:SpatialEvent):void{
    for(const listener of [...this.listeners])listener(event)
  }
}
