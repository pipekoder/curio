import type {Vec3} from './camera-math'

// Pure Curiosity Journey mathematics: deterministic constellation layout,
// orbit camera, honest edges, surprise selection. No renderer here.
export const NETWORK_CENTER:Vec3=[0,30,-170]
export const NETWORK_RADIUS=26
export const ORBIT_MIN=34
export const ORBIT_MAX=110
export const ORBIT_DEFAULT=64

// Fibonacci sphere: evenly spread, deterministic, stable across renders.
export function layoutNetwork(count:number,center:Vec3=NETWORK_CENTER,radius=NETWORK_RADIUS):Vec3[]{
  if(count<=0)return []
  if(count===1)return [[...center] as Vec3]
  const positions:Vec3[]=[]
  const golden=Math.PI*(3-Math.sqrt(5))
  for(let i=0;i<count;i++){
    const y=1-(i/(count-1))*2
    const shell=Math.sqrt(Math.max(0,1-y*y))
    const theta=golden*i
    positions.push([center[0]+Math.cos(theta)*shell*radius,center[1]+y*radius*0.72,center[2]+Math.sin(theta)*shell*radius])
  }
  return positions
}

// Edge pairs only where both endpoints exist. Deduped, direction-free.
export function buildEdges(assetIds:readonly string[],hints:ReadonlyMap<string,readonly string[]>):[number,number][]{
  const index=new Map(assetIds.map((id,i)=>[id,i]))
  const pairs=new Set<string>()
  for(const [from,list] of hints){
    const a=index.get(from)
    if(a===undefined)continue
    for(const to of list){
      const b=index.get(to)
      if(b===undefined||a===b)continue
      pairs.add(a<b?`${a}:${b}`:`${b}:${a}`)
    }
  }
  return [...pairs].map(key=>key.split(':').map(Number) as [number,number])
}

// Orbit camera around the constellation center. Pitch clamps so the
// visitor never flips under the chamber floor.
export function orbitCamera(center:Vec3,yaw:number,pitch:number,radius:number):{position:Vec3;look:Vec3}{
  const clamped=Math.min(0.9,Math.max(-0.9,pitch))
  const r=Math.min(ORBIT_MAX,Math.max(ORBIT_MIN,radius))
  return {
    position:[center[0]+Math.sin(yaw)*Math.cos(clamped)*r,center[1]+Math.sin(clamped)*r,center[2]+Math.cos(yaw)*Math.cos(clamped)*r],
    look:[...center] as Vec3,
  }
}

// Uniform random pick that never repeats the current highlight. The visitor
// chooses whether to enter; selection never dives on its own.
export function pickSurprise(count:number,exclude=-1,rand:()=>number=Math.random):number{
  if(count<=0)return -1
  if(count===1)return 0
  let pick=Math.floor(rand()*count)
  if(pick===exclude)pick=(pick+1)%count
  return pick
}
