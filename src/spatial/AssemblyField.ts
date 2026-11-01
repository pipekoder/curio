import * as THREE from 'three'
import type {AssemblyPhase} from './assembly'

// Convergence particles for Generate: stream from a shell around the first
// mount, settle onto its face grid, dissolve as the exhibit resolves.
const COUNT=2600
const FACE_W=7.8
const FACE_H=5.2

export class AssemblyField{
  private points:THREE.Points
  private geometry=new THREE.BufferGeometry()
  private material:THREE.PointsMaterial
  private start:Float32Array
  private control:Float32Array
  private grid:Float32Array
  private seed:Float32Array

  constructor(scene:THREE.Scene,private target:{x:number;y:number;z:number}={x:-2.4,y:2.6,z:-52}){
    this.start=new Float32Array(COUNT*3)
    this.control=new Float32Array(COUNT*3)
    this.grid=new Float32Array(COUNT*3)
    this.seed=new Float32Array(COUNT)
    const positions=new Float32Array(COUNT*3)
    const colors=new Float32Array(COUNT*3)
    const silver=new THREE.Color(0xdce4ee),brass=new THREE.Color(0xb98a3e)
    for(let i=0;i<COUNT;i++){
      const theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1),radius=40+Math.random()*50
      this.start[i*3]=target.x+radius*Math.sin(phi)*Math.cos(theta)
      this.start[i*3+1]=target.y+radius*Math.sin(phi)*Math.sin(theta)*0.6
      this.start[i*3+2]=target.z+radius*Math.cos(phi)
      this.control[i*3]=target.x+(Math.random()-0.5)*36
      this.control[i*3+1]=target.y+(Math.random()-0.5)*22
      this.control[i*3+2]=target.z+(Math.random()-0.5)*36
      const onFrame=Math.random()<0.3
      const gx=(Math.random()-0.5)*FACE_W,gy=(Math.random()-0.5)*FACE_H
      this.grid[i*3]=target.x+(onFrame?Math.sign(gx||1)*FACE_W/2:gx)
      this.grid[i*3+1]=target.y+(onFrame?Math.sign(gy||1)*FACE_H/2:gy)
      this.grid[i*3+2]=target.z+0.15+Math.random()*0.4
      this.seed[i]=Math.random()*Math.PI*2
      positions[i*3]=this.start[i*3];positions[i*3+1]=this.start[i*3+1];positions[i*3+2]=this.start[i*3+2]
      const color=Math.random()<0.15?brass:silver
      colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b
    }
    this.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3))
    this.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3))
    this.material=new THREE.PointsMaterial({size:0.5,vertexColors:true,map:AssemblyField.softSprite(),transparent:true,opacity:0.9,sizeAttenuation:true,depthWrite:false})
    this.points=new THREE.Points(this.geometry,this.material)
    this.points.frustumCulled=false
    scene.add(this.points)
  }

  update(phase:AssemblyPhase,t:number,elapsed:number):void{
    if(phase==='idle'||phase==='done'){
      this.points.visible=false
      return
    }
    this.points.visible=true
    const positions=this.geometry.getAttribute('position') as THREE.BufferAttribute
    const array=positions.array as Float32Array
    const eased=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2
    const settled=phase!=='stream'||t>=1
    for(let i=0;i<COUNT;i++){
      let x:number,y:number,z:number
      if(!settled){
        const u=1-eased
        x=u*u*this.start[i*3]+2*u*eased*this.control[i*3]+eased*eased*this.grid[i*3]
        y=u*u*this.start[i*3+1]+2*u*eased*this.control[i*3+1]+eased*eased*this.grid[i*3+1]
        z=u*u*this.start[i*3+2]+2*u*eased*this.control[i*3+2]+eased*eased*this.grid[i*3+2]
      }else{
        const breathe=Math.sin(elapsed*2+this.seed[i])*0.15
        // Holds bloom outward so a slow edition still fills the frame;
        // resolve contracts back onto the mount face as it fades in.
        const spread=phase==='lattice'?1+eased*0.7:phase==='resolve'?1.7-eased*0.7:t>=1?1.7:1
        x=this.target.x+(this.grid[i*3]-this.target.x)*spread+breathe*0.4
        y=this.target.y+(this.grid[i*3+1]-this.target.y)*spread+breathe
        z=this.grid[i*3+2]+breathe*0.4+(spread-1)*Math.sin(this.seed[i]*3)*1.5
      }
      array[i*3]=x;array[i*3+1]=y;array[i*3+2]=z
    }
    positions.needsUpdate=true
    this.material.opacity=phase==='resolve'?0.85*(1-eased):0.9
  }

  private static softSprite():THREE.Texture{
    const sprite=document.createElement('canvas')
    sprite.width=64;sprite.height=64
    const ctx=sprite.getContext('2d')!
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32)
    gradient.addColorStop(0,'rgba(255,255,255,1)')
    gradient.addColorStop(0.5,'rgba(255,255,255,.8)')
    gradient.addColorStop(1,'rgba(255,255,255,0)')
    ctx.fillStyle=gradient
    ctx.fillRect(0,0,64,64)
    return new THREE.CanvasTexture(sprite)
  }

  dispose(scene:THREE.Scene):void{
    scene.remove(this.points)
    this.geometry.dispose()
    this.material.map?.dispose()
    this.material.dispose()
  }
}
