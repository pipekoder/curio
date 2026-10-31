import * as THREE from 'three'

export const SILVER=0xf4f5f7
export const GRAPHITE=0x23272e

export function webglAvailable():boolean{
  try{
    const canvas=document.createElement('canvas')
    return !!(canvas.getContext('webgl2')??canvas.getContext('webgl'))
  }catch{return false}
}

// The infinite silver field: fog void, soft key light, ambient dust.
// Owns renderer + scene only; the CameraRig owns the camera.
export class SilverField{
  readonly renderer:THREE.WebGLRenderer
  readonly scene:THREE.Scene
  private dust:THREE.Points
  private dustSpin=0

  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
    const coarse=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(pointer:coarse)').matches
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1.5:2))
    this.renderer.outputColorSpace=THREE.SRGBColorSpace
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure=1.05
    this.scene=new THREE.Scene()
    this.scene.background=new THREE.Color(SILVER)
    this.scene.fog=new THREE.FogExp2(SILVER,0.016)
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xd8dde3,0.9))
    const key=new THREE.DirectionalLight(0xffffff,1.1)
    key.position.set(-18,30,12)
    this.scene.add(key)
    this.dust=SilverField.makeDust()
    this.scene.add(this.dust)
  }

  private static makeDust():THREE.Points{
    const count=600,positions=new Float32Array(count*3)
    for(let i=0;i<count;i++){
      positions[i*3]=(Math.random()-0.5)*240
      positions[i*3+1]=Math.random()*60-6
      positions[i*3+2]=-Math.random()*240+20
    }
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3))
    const material=new THREE.PointsMaterial({color:0xcfd6dc,size:0.35,transparent:true,opacity:0.55,sizeAttenuation:true,depthWrite:false})
    return new THREE.Points(geometry,material)
  }

  // Ambient drift only. Exhibit and camera motion live in their own modules.
  update(dt:number,reducedMotion:boolean):void{
    if(reducedMotion||!(dt>0))return
    this.dustSpin+=dt*0.004
    this.dust.rotation.y=this.dustSpin
  }

  render(camera:THREE.Camera):void{
    this.renderer.render(this.scene,camera)
  }

  resize(width:number,height:number):void{
    this.renderer.setSize(width,height,false)
  }

  dispose():void{
    this.scene.traverse(object=>{
      const mesh=object as THREE.Mesh
      if(mesh.geometry)mesh.geometry.dispose()
      const material=mesh.material as THREE.Material|THREE.Material[]|undefined
      if(Array.isArray(material))material.forEach(m=>m.dispose())
      else if(material)material.dispose()
    })
    this.renderer.dispose()
  }
}
