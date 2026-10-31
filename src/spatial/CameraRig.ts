import * as THREE from 'three'
import {dockMagnet,dampedStep,magnetEscape,scrollToDistance,splinePosition,type Vec3,type Waypoint} from './camera-math'

// Scroll-driven camera on a fixed spline. The page genuinely scrolls; the
// camera follows with damping. Reduced motion snaps instead of gliding.
export type RigOptions={
  waypoints:readonly Waypoint[]
  docks:readonly number[]
  reducedMotion:boolean
  onArrive?:(index:number)=>void
}

const DOCK_RADIUS=14
const ESCAPE_VELOCITY=900

export class CameraRig{
  readonly camera:THREE.PerspectiveCamera
  private distance=0
  private target=0
  private lastTarget=0
  private arrived=-1
  private lookAhead=18
  private focus:{dock:number;mountX:number;mountZ:number}|null=null
  private focusBlend=0
  private cinematic:number|null=null

  constructor(private opts:RigOptions,aspect:number){
    this.camera=new THREE.PerspectiveCamera(55,aspect,0.1,900)
    this.apply(0)
  }

  get state():{distance:number;cameraZ:number;cameraY:number;nearest:number}{
    return {distance:this.distance,cameraZ:this.camera.position.z,cameraY:this.camera.position.y,nearest:this.nearestDock()}
  }

  setPath(waypoints:readonly Waypoint[],docks:readonly number[]):void{
    this.opts={...this.opts,waypoints,docks}
    this.arrived=-1
  }

  setFocus(focus:{dock:number;mountX:number;mountZ:number}|null):void{
    this.focus=focus
  }

  // Cinematic floor during assembly: the visitor may run ahead by scrolling,
  // but the camera never falls behind the choreography.
  setCinematic(distance:number|null):void{
    this.cinematic=distance
  }

  nearestDock():number{
    let best=-1,bestDist=Infinity
    this.opts.docks.forEach((dock,index)=>{
      const dist=Math.abs(dock-this.distance)
      if(dist<bestDist){bestDist=dist;best=index}
    })
    return bestDist<=20?best:-1
  }

  setScroll(scrollY:number,maxScroll:number,pathLength:number):void{
    this.target=scrollToDistance(scrollY,maxScroll,pathLength)
  }

  update(dt:number):void{
    const effective=this.cinematic==null?this.target:Math.max(this.target,this.cinematic)
    const velocity=dt>0?(effective-this.lastTarget)/dt:0
    this.lastTarget=effective
    this.distance=this.opts.reducedMotion?effective:dampedStep(this.distance,effective,4.5,dt)
    let settled=this.distance
    if(!this.opts.reducedMotion&&!magnetEscape(velocity,ESCAPE_VELOCITY))settled=dockMagnet(settled,this.opts.docks,DOCK_RADIUS)
    this.focusBlend=this.opts.reducedMotion?(this.focus?1:0):dampedStep(this.focusBlend,this.focus?1:0,5,dt)
    this.apply(settled)
    const arrived=this.opts.docks.findIndex(dock=>Math.abs(settled-dock)<2)
    if(arrived!==this.arrived){this.arrived=arrived;if(arrived>=0)this.opts.onArrive?.(arrived)}
  }

  private apply(d:number):void{
    const [x,y,z]=splinePosition(d,this.opts.waypoints)
    const look=splinePosition(d+this.lookAhead,this.opts.waypoints)
    if(this.focus&&this.focusBlend>0.001){
      const t=this.focusBlend
      const ix=this.focus.mountX,iy=2.4,iz=this.focus.mountZ+6
      this.camera.position.set(x+(ix-x)*t,y+(iy-y)*t,z+(iz-z)*t)
      this.camera.lookAt(look[0]+(ix-look[0])*t,look[1]+(2.6-look[1])*t,look[2]+(this.focus.mountZ-look[2])*t)
      return
    }
    this.camera.position.set(x,y,z)
    this.camera.lookAt(look[0],look[1],look[2])
  }

  resize(aspect:number):void{
    this.camera.aspect=aspect
    this.camera.updateProjectionMatrix()
  }

  static originPath():{waypoints:Waypoint[];pathLength:number}{
    // Phase 0 travel: origin rest point to promenade overlook. Exhibit
    // waypoints arrive with Phase 1 mounts.
    return {waypoints:[{d:0,p:[0,2.2,26]},{d:90,p:[0,3.4,-64]}],pathLength:90}
  }
}

export type {Vec3}
