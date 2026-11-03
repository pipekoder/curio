import type {Vec3} from './camera-math'

// Pure Curiosity Journey mathematics: deterministic constellation layout,
// orbit camera, honest edges, surprise selection. No renderer here.
export const NETWORK_CENTER:Vec3=[0,30,-170]
export const NETWORK_RADIUS=26
export const ORBIT_MIN=34
export const ORBIT_MAX=110
export const ORBIT_DEFAULT=64

// Fibonacci sphere: evenly spread, deterministic, stable across renders.
// Optional weights pull relevant nodes nearer the center: staged exhibits
// and their direct neighbors sit close and large; the rest extends outward.
export function layoutNetwork(count:number,center:Vec3=NETWORK_CENTER,radius=NETWORK_RADIUS,weights?:readonly number[]):Vec3[]{
  if(count<=0)return []
  if(count===1)return [[...center] as Vec3]
  const positions:Vec3[]=[]
  const golden=Math.PI*(3-Math.sqrt(5))
  for(let i=0;i<count;i++){
    const y=1-(i/(count-1))*2
    const shell=Math.sqrt(Math.max(0,1-y*y))
    const theta=golden*i
    const w=weights?Math.min(1,Math.max(0,weights[i]??0.5)):1
    const r=weights?radius*(1.18-0.55*w):radius
    positions.push([center[0]+Math.cos(theta)*shell*r,center[1]+y*r*0.72,center[2]+Math.sin(theta)*shell*r])
  }
  return positions
}

// Grounded relevance only: staged exhibits first, their direct edge
// neighbors second, everything else distant. No staged exhibits (before
// the first edition) keeps every node at a neutral middle distance.
export function relevanceWeights(staged:ReadonlySet<number>,edges:readonly (readonly [number,number])[],count:number):number[]{
  const weights=new Array(count).fill(0.15)
  if(!staged.size)return new Array(count).fill(0.6)
  const neighbors=new Set<number>()
  for(const [a,b] of edges){
    if(staged.has(a)&&!staged.has(b))neighbors.add(b)
    if(staged.has(b)&&!staged.has(a))neighbors.add(a)
  }
  for(const i of staged)if(i>=0&&i<count)weights[i]=1
  for(const i of neighbors)weights[i]=0.55
  return weights
}

// Node prominence follows relevance: 0.72 at the far edge, 1.28 nearest.
export function nodeScale(weight:number):number{
  const w=Math.min(1,Math.max(0,weight))
  return 0.72+0.56*w
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

// Deterministic stream so the dust cloud is stable across renders.
export function mulberry(seed:number):()=>number{
  let a=seed
  return ()=>{
    a|=0;a=a+0x6D2B79F5|0
    let t=Math.imul(a^a>>>15,1|a)
    t=t+Math.imul(t^t>>>7,61|t)^t
    return((t^t>>>14)>>>0)/4294967296
  }
}

// Volumetric dust: center-weighted points through a flattened ellipsoid, a
// denser heart plus a sparse halo. Genuine depth in every axis, no shell,
// grid, or ring. Deterministic for the given stream.
export function layoutDust(count:number,center:Vec3,radius:number,rand:()=>number):Vec3[]{
  const pts:Vec3[]=[]
  for(let i=0;i<count;i++){
    const g=()=>(rand()+rand()+rand())/1.5-1
    const spread=i%5===0?1.15:0.75
    pts.push([center[0]+g()*radius*spread,center[1]+g()*radius*0.55*spread,center[2]+g()*radius*0.85*spread])
  }
  return pts
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
