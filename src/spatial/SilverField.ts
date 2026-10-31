import * as THREE from 'three'

export const SILVER=0xf4f5f7
export const GRAPHITE=0x23272e

export function webglAvailable():boolean{
  try{
    const canvas=document.createElement('canvas')
    return !!(canvas.getContext('webgl2')??canvas.getContext('webgl'))
  }catch{return false}
}

export type DisplayTier={pixelRatioCap:number;antialias:boolean;dust:number}
// Mobile thermal tier: coarse pointers get capped pixels, no MSAA, half
// the ambient dust. Desktop keeps full quality.
export function displayTier(coarse:boolean):DisplayTier{
  return coarse
    ?{pixelRatioCap:1.5,antialias:false,dust:300}
    :{pixelRatioCap:2,antialias:true,dust:600}
}

// The infinite silver field: fog void, soft key light, ambient dust.
// Owns renderer + scene only; the CameraRig owns the camera.
export class SilverField{
  readonly renderer:THREE.WebGLRenderer
  readonly scene:THREE.Scene
  private dust:THREE.Points
  private dustSpin=0

  constructor(canvas:HTMLCanvasElement){
    const coarse=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(pointer:coarse)').matches
    const tier=displayTier(coarse)
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:tier.antialias,powerPreference:'high-performance'})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,tier.pixelRatioCap))
    this.renderer.outputColorSpace=THREE.SRGBColorSpace
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure=1.05
    this.scene=new THREE.Scene()
    this.scene.background=new THREE.Color(SILVER)
    this.scene.fog=new THREE.FogExp2(SILVER,0.011)
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xd8dde3,0.9))
    const key=new THREE.DirectionalLight(0xffffff,1.1)
    key.position.set(-18,30,12)
    this.scene.add(key)
    this.dust=SilverField.makeDust(tier.dust)
    this.scene.add(this.dust)
  }

  private static makeDust(count:number):THREE.Points{
    const positions=new Float32Array(count*3)
    for(let i=0;i<count;i++){
      positions[i*3]=(Math.random()-0.5)*240
      positions[i*3+1]=Math.random()*60-6
      positions[i*3+2]=-Math.random()*240+20
    }
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3))
    const sprite=document.createElement('canvas')
    sprite.width=64;sprite.height=64
    const ctx=sprite.getContext('2d')!
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32)
    gradient.addColorStop(0,'rgba(255,255,255,1)')
    gradient.addColorStop(0.4,'rgba(255,255,255,.55)')
    gradient.addColorStop(1,'rgba(255,255,255,0)')
    ctx.fillStyle=gradient
    ctx.fillRect(0,0,64,64)
    const material=new THREE.PointsMaterial({color:0xc9d1d8,size:0.55,map:new THREE.CanvasTexture(sprite),transparent:true,opacity:0.5,sizeAttenuation:true,depthWrite:false})
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
      const disposeOne=(m:THREE.Material)=>{
        const mapped=(m as THREE.PointsMaterial).map as THREE.Texture|undefined
        if(mapped)mapped.dispose()
        m.dispose()
      }
      if(Array.isArray(material))material.forEach(disposeOne)
      else if(material)disposeOne(material)
    })
    this.renderer.dispose()
  }
}
