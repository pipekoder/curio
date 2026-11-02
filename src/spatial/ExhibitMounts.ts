import * as THREE from 'three'
import type {StagedExhibit} from './staging'

export type Pick={assetId:string;hotspotId?:string}

// Liquid-glass frame dimensions shared with the assembly lattice.
export const FRAME_W=8.0
export const FRAME_H=5.4
const FRAME_R=0.45
const BOARD_D=0.12
const ART_Z=0.07
const RING_Z=0.078
const HOT_Z=0.09

function roundedRect(w:number,h:number,r:number):THREE.Shape{
  const shape=new THREE.Shape(),x=-w/2,y=-h/2
  shape.moveTo(x+r,y)
  shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r)
  shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r)
  shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y)
  return shape
}

// Floating glass mounts: rounded slab, edge-to-edge artwork, translucent
// corner band with a hairline highlight, brass hotspot rings. One group
// per staged exhibit along the promenade.
export class ExhibitMounts{
  readonly group=new THREE.Group()
  onArtworkError?:(assetId:string)=>void
  private loader:THREE.TextureLoader
  private raycaster=new THREE.Raycaster()
  private pickables:THREE.Object3D[]=[]
  private floats:{group:THREE.Group;baseY:number;phase:number}[]=[]
  // Mount lifecycle: every clear starts a new epoch, so asynchronous
  // texture callbacks can tell whether their mount is still staged. A
  // detached mount group keeps its children (art.parent stays set), so
  // scene-graph parenting cannot serve as this guard.
  private epoch=0

  constructor(scene:THREE.Scene,loader=new THREE.TextureLoader()){
    this.loader=loader
    scene.add(this.group)
  }

  setExhibits(exhibits:readonly StagedExhibit[],mounts:readonly {x:number;z:number}[]):void{
    this.clear()
    const epoch=this.epoch
    exhibits.forEach((exhibit,index)=>{
      const at=mounts[index]??{x:0,z:-52-index*40}
      const mount=new THREE.Group()
      mount.position.set(at.x,0,at.z)
      const slab=new THREE.ExtrudeGeometry(roundedRect(FRAME_W,FRAME_H,FRAME_R),{depth:BOARD_D,bevelEnabled:false})
      slab.translate(0,0,-BOARD_D/2)
      const board=new THREE.Mesh(
        slab,
        new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9,metalness:0}),
      )
      board.position.y=2.6
      mount.add(board)
      // Artwork shares the slab's rounded silhouette exactly, so no square
      // image corner can escape the glass perimeter. ShapeGeometry emits raw
      // XY coordinates as UVs, hence the static remap to 0..1 here.
      const artGeo=new THREE.ShapeGeometry(roundedRect(FRAME_W,FRAME_H,FRAME_R),12)
      {
        const positions=artGeo.getAttribute('position')
        const uvs=artGeo.getAttribute('uv')
        for(let i=0;i<positions.count;i++){
          uvs.setXY(i,positions.getX(i)/FRAME_W+0.5,positions.getY(i)/FRAME_H+0.5)
        }
      }
      const art=new THREE.Mesh(
        artGeo,
        new THREE.MeshBasicMaterial({color:0xe8ecf1}),
      )
      art.position.set(0,2.6,ART_Z)
      art.userData={assetId:exhibit.assetId} as Pick
      mount.add(art)
      this.pickables.push(art)
      const band=new THREE.Shape(roundedRect(FRAME_W,FRAME_H,FRAME_R).getPoints(12))
      band.holes.push(new THREE.Path(roundedRect(FRAME_W-0.5,FRAME_H-0.5,FRAME_R-0.22).getPoints(12)))
      const bandGeo=new THREE.ShapeGeometry(band,12)
      {
        const positions=bandGeo.getAttribute('position')
        const colors=new Float32Array(positions.count*3)
        const cool=new THREE.Color(0xdfe9f8),warm=new THREE.Color(0xf7ecf3),tint=new THREE.Color()
        for(let i=0;i<positions.count;i++){
          tint.copy(cool).lerp(warm,(positions.getX(i)+FRAME_W/2)/FRAME_W)
          colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b
        }
        bandGeo.setAttribute('color',new THREE.BufferAttribute(colors,3))
      }
      const glass=new THREE.Mesh(bandGeo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1}))
      glass.position.set(0,2.6,RING_Z)
      mount.add(glass)
      for(const [fx,fy] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const){
        const flare=new THREE.Sprite(new THREE.SpriteMaterial({map:ExhibitMounts.flare(),transparent:true,opacity:0.85,depthWrite:false}))
        flare.scale.setScalar(1.6)
        flare.position.set(fx*(FRAME_W/2-0.25),2.6+fy*(FRAME_H/2-0.25),RING_Z+0.003)
        mount.add(flare)
      }
      const frame=new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(roundedRect(FRAME_W-0.05,FRAME_H-0.05,FRAME_R-0.02).getPoints(24)),
        new THREE.LineBasicMaterial({color:0x101219}),
      )
      frame.position.set(0,2.6,RING_Z)
      mount.add(frame)
      this.loader.load(exhibit.image,texture=>{
        // A texture arriving after its mount was pruned is disposed rather
        // than attached, so revoked artwork cannot resurface.
        if(epoch!==this.epoch){texture.dispose();return}
        texture.colorSpace=THREE.SRGBColorSpace
        ;(art.material as THREE.MeshBasicMaterial).map=texture
        ;(art.material as THREE.MeshBasicMaterial).color.set(0xffffff)
        ;(art.material as THREE.MeshBasicMaterial).needsUpdate=true
      },undefined,()=>{
        // A stale error must not prune a replacement mount staged under the
        // same asset ID.
        if(epoch!==this.epoch)return
        this.onArtworkError?.(exhibit.assetId)
      })
      for(const hotspot of exhibit.hotspots){
        const ring=new THREE.Mesh(
          new THREE.TorusGeometry(0.16,0.028,12,32),
          new THREE.MeshBasicMaterial({color:0xb98a3e}),
        )
        ring.position.set((hotspot.x-0.5)*FRAME_W,2.6+(0.5-hotspot.y)*FRAME_H,HOT_Z)
        mount.add(ring)
        const hit=new THREE.Mesh(
          new THREE.CircleGeometry(0.5,20),
          new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}),
        )
        hit.position.copy(ring.position)
        hit.userData={assetId:exhibit.assetId,hotspotId:hotspot.id} as Pick
        mount.add(hit)
        this.pickables.push(hit)
      }
      const shadow=new THREE.Mesh(
        new THREE.PlaneGeometry(7.6,2.2),
        new THREE.MeshBasicMaterial({map:ExhibitMounts.blob(),transparent:true,opacity:0.35,depthWrite:false}),
      )
      shadow.rotation.x=-Math.PI/2
      shadow.position.y=0.02
      mount.add(shadow)
      this.group.add(mount)
      this.floats.push({group:mount,baseY:0,phase:index*1.3})
    })
  }

  private static flareTexture:THREE.Texture|null=null
  private static flare():THREE.Texture{
    if(!ExhibitMounts.flareTexture){
      const canvas=document.createElement('canvas')
      canvas.width=64;canvas.height=64
      const ctx=canvas.getContext('2d')!
      const gradient=ctx.createRadialGradient(32,32,1,32,32,30)
      gradient.addColorStop(0,'rgba(255,255,255,1)')
      gradient.addColorStop(0.3,'rgba(205,222,250,.75)')
      gradient.addColorStop(0.6,'rgba(244,224,240,.42)')
      gradient.addColorStop(1,'rgba(244,224,240,0)')
      ctx.fillStyle=gradient
      ctx.fillRect(0,0,64,64)
      ExhibitMounts.flareTexture=new THREE.CanvasTexture(canvas)
    }
    return ExhibitMounts.flareTexture
  }
  private static blobTexture:THREE.Texture|null=null
  private static blob():THREE.Texture{
    if(!ExhibitMounts.blobTexture){
      const canvas=document.createElement('canvas')
      canvas.width=128;canvas.height=64
      const ctx=canvas.getContext('2d')!
      const gradient=ctx.createRadialGradient(64,32,4,64,32,60)
      gradient.addColorStop(0,'rgba(70,80,92,.55)')
      gradient.addColorStop(1,'rgba(70,80,92,0)')
      ctx.fillStyle=gradient
      ctx.fillRect(0,0,128,64)
      ExhibitMounts.blobTexture=new THREE.CanvasTexture(canvas)
    }
    return ExhibitMounts.blobTexture
  }

  update(elapsed:number,reducedMotion:boolean):void{
    if(reducedMotion)return
    for(const float of this.floats)float.group.position.y=float.baseY+Math.sin(elapsed*0.6+float.phase)*0.08
  }

  // Resolve pop as particles dissolve: 0 at materialization, 1 at rest.
  setResolve(t:number):void{
    const clamped=Math.min(1,Math.max(0,t))
    const eased=1-Math.pow(1-clamped,3)
    this.group.scale.setScalar(0.94+0.06*eased)
  }

  pick(clientX:number,clientY:number,camera:THREE.Camera,rect:{left:number;top:number;width:number;height:number}):Pick|null{
    const pointer=new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1,
    )
    this.raycaster.setFromCamera(pointer,camera)
    const hits=this.raycaster.intersectObjects(this.pickables,false)
    return (hits[0]?.object.userData as Pick|undefined)??null
  }

  private clear():void{
    this.epoch++
    this.pickables=[]
    this.floats=[]
    this.group.traverse(object=>{
      const mesh=object as THREE.Mesh
      if(mesh.geometry)mesh.geometry.dispose()
      const material=mesh.material as THREE.Material|undefined
      if(material){
        const mapped=(material as THREE.MeshBasicMaterial).map
        if(mapped&&mapped!==ExhibitMounts.blobTexture&&mapped!==ExhibitMounts.flareTexture)mapped.dispose()
        material.dispose()
      }
    })
    this.group.clear()
  }

  dispose():void{
    this.clear()
    this.group.parent?.remove(this.group)
  }
}
