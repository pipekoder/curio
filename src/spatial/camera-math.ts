// Pure camera mathematics for the Silver Field rig. Framework-free so the
// motion model is unit-tested without a renderer.
export type Vec3=[number,number,number]
export const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value))
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t

// Exponential smoothing toward target. Returns target when time or rate is degenerate.
export function dampedStep(current:number,target:number,lambda:number,dt:number):number{
  if(!(dt>0)||!(lambda>0))return target
  return current+(target-current)*(1-Math.exp(-lambda*dt))
}

export type Waypoint={d:number;p:Vec3}
// Piecewise-linear path position. Distance clamps to the waypoint range.
export function splinePosition(d:number,waypoints:readonly Waypoint[]):Vec3{
  if(!waypoints.length)return [0,0,0]
  if(d<=waypoints[0].d)return [...waypoints[0].p] as Vec3
  for(let i=1;i<waypoints.length;i++){
    if(d<=waypoints[i].d){
      const a=waypoints[i-1],b=waypoints[i],span=b.d-a.d||1,t=(d-a.d)/span
      return [lerp(a.p[0],b.p[0],t),lerp(a.p[1],b.p[1],t),lerp(a.p[2],b.p[2],t)]
    }
  }
  return [...waypoints[waypoints.length-1].p] as Vec3
}

// Advisory magnetic pull toward the nearest dock within radius. Returns the
// adjusted distance; strength peaks at the dock and falls off quadratically.
export function dockMagnet(d:number,docks:readonly number[],radius:number,strength=0.35):number{
  if(!(radius>0))return d
  let best=0,bestDist=Infinity
  for(const dock of docks){
    const dist=Math.abs(dock-d)
    if(dist<bestDist){bestDist=dist;best=dock}
  }
  if(bestDist>=radius)return d
  const falloff=1-bestDist/radius
  return d+(best-d)*strength*falloff*falloff
}

// The magnet never locks: above this scroll velocity the pull is ignored.
export function magnetEscape(velocity:number,threshold:number):boolean{
  return Math.abs(velocity)>threshold
}

// Promenade composition: mounts march leftward at a fixed step while the
// camera carries the matching lateral bias, so every active mount frames
// front-center with its back-left neighbor peeking past it. Spatial while
// exploring, frontal when reading: the artwork arrives facing the reader.
export const MOUNT_X0=0
export const MOUNT_STEP=3.6
export function mountX(index:number):number{
  return MOUNT_X0-index*MOUNT_STEP
}
// Rigid lateral camera offset for distance d: 0 at the first dock,
// -(count-1)*MOUNT_STEP at the last, linear between, clamped outside.
// The bias equals the active mount's x at every dock, so the reading
// position is centered without rotating the scene.
export function lateralBias(d:number,docks:readonly number[],count:number):number{
  if(docks.length<2||count<2)return 0
  const span=docks[docks.length-1]-docks[0]
  if(span<=0)return 0
  const t=Math.min(1,Math.max(0,(d-docks[0])/span))
  return 0-t*(count-1)*MOUNT_STEP
}

// Depth-based mount opacity: 1 at the reading focus, easing to 0.6 a full
// dock spacing away. Smooth in between so approaching mounts clarify and
// departing mounts fade with no jumps.
export function depthOpacity(distance:number,dock:number,range=40):number{
  if(!(range>0))return 1
  const t=clamp(1-Math.abs(distance-dock)/range,0,1)
  return 0.6+0.4*t*t*(3-2*t)
}

// Promenade layout: origin rest, one dock per exhibit down-axis, an overlook
// past the last mount. Pure so the camera path is unit-tested.
export function exhibitLayout(count:number,spacing=40,startZ=-40):{waypoints:Waypoint[];docks:number[];mounts:{x:number;z:number}[];pathLength:number}{
  const waypoints:Waypoint[]=[{d:0,p:[0,2.2,26]}]
  const docks:number[]=[]
  const mounts:{x:number;z:number}[]=[]
  for(let i=0;i<count;i++){
    const d=60+i*spacing
    docks.push(d)
    waypoints.push({d,p:[0,2.2,startZ-i*spacing]})
    mounts.push({x:mountX(i),z:startZ-i*spacing-12})
  }
  const pathLength=60+Math.max(0,count-1)*spacing+50
  waypoints.push({d:pathLength,p:[0,6,startZ-Math.max(0,count-1)*spacing-50]})
  return {waypoints,docks,mounts,pathLength}
}

// Native scroll offset to path distance. Guards unsettled layout.
export function scrollToDistance(scrollY:number,maxScroll:number,pathLength:number):number{
  if(!(maxScroll>0)||!(pathLength>0))return 0
  return clamp(scrollY/maxScroll,0,1)*pathLength
}
