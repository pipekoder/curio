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
  private lastTime=0
  private arrived=-1
  private lookAhead=18

  constructor(private opts:RigOptions,aspect:number){
    this.camera=new THREE.PerspectiveCamera(55,aspect,0.1,900)
    this.apply(0)
  }

  get state():{distance:number;cameraZ:number}{
    return {distance:this.distance,cameraZ:this.camera.position.z}
  }

  setScroll(scrollY:number,maxScroll:number,pathLength:number,now:number):void{
    this.target=scrollToDistance(scrollY,maxScroll,pathLength)
    this.lastTime=now
  }

  update(dt:number,now:number):void{
    const velocity=dt>0?(this.target-this.lastTarget)/dt:0
    this.lastTarget=this.target
    this.lastTime=now
    this.distance=this.opts.reducedMotion?this.target:dampedStep(this.distance,this.target,4.5,dt)
    let settled=this.distance
    if(!this.opts.reducedMotion&&!magnetEscape(velocity,ESCAPE_VELOCITY))settled=dockMagnet(settled,this.opts.docks,DOCK_RADIUS)
    this.apply(settled)
    const arrived=this.opts.docks.findIndex(dock=>Math.abs(settled-dock)<2)
    if(arrived!==this.arrived){this.arrived=arrived;if(arrived>=0)this.opts.onArrive?.(arrived)}
  }

  private apply(d:number):void{
    const [x,y,z]=splinePosition(d,this.opts.waypoints)
    this.camera.position.set(x,y,z)
    const look=splinePosition(d+this.lookAhead,this.opts.waypoints)
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
