import * as THREE from 'three'
import type {StagedExhibit} from './staging'

export type Pick={assetId:string;hotspotId?:string}

// Floating glass mounts: white board, hairline frame, artwork plane, brass
// hotspot rings. One group per staged exhibit along the promenade.
export class ExhibitMounts{
  readonly group=new THREE.Group()
  private loader=new THREE.TextureLoader()
  private raycaster=new THREE.Raycaster()
  private pickables:THREE.Object3D[]=[]
  private floats:{group:THREE.Group;baseY:number;phase:number}[]=[]

  constructor(scene:THREE.Scene){
    scene.add(this.group)
  }

  setExhibits(exhibits:readonly StagedExhibit[],mounts:readonly {x:number;z:number}[]):void{
    this.clear()
    exhibits.forEach((exhibit,index)=>{
      const at=mounts[index]??{x:0,z:-52-index*40}
      const mount=new THREE.Group()
      mount.position.set(at.x,0,at.z)
      const board=new THREE.Mesh(
        new THREE.BoxGeometry(8.8,6.2,0.1),
        new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9,metalness:0}),
      )
      board.position.y=2.6
      mount.add(board)
      const frame=new THREE.LineSegments(
        new THREE.EdgesGeometry(board.geometry),
        new THREE.LineBasicMaterial({color:0x3a4048}),
      )
      frame.position.copy(board.position)
      mount.add(frame)
      const art=new THREE.Mesh(
        new THREE.PlaneGeometry(7.8,5.2),
        new THREE.MeshBasicMaterial({color:0xe3e7ec}),
      )
      art.position.set(0,2.6,0.06)
      art.userData={assetId:exhibit.assetId} as Pick
      mount.add(art)
      this.pickables.push(art)
      this.loader.load(exhibit.image,texture=>{
        texture.colorSpace=THREE.SRGBColorSpace
        ;(art.material as THREE.MeshBasicMaterial).map=texture
        ;(art.material as THREE.MeshBasicMaterial).color.set(0xffffff)
        ;(art.material as THREE.MeshBasicMaterial).needsUpdate=true
      },undefined,()=>{/* Placeholder board stays; the rail still shows content. */})
      for(const hotspot of exhibit.hotspots){
        const ring=new THREE.Mesh(
          new THREE.TorusGeometry(0.16,0.028,12,32),
          new THREE.MeshBasicMaterial({color:0xb98a3e}),
        )
        ring.position.set((hotspot.x-0.5)*7.8,2.6+(0.5-hotspot.y)*5.2,0.09)
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
        new THREE.PlaneGeometry(8.4,2.4),
        new THREE.MeshBasicMaterial({map:ExhibitMounts.blob(),transparent:true,opacity:0.35,depthWrite:false}),
      )
      shadow.rotation.x=-Math.PI/2
      shadow.position.y=0.02
      mount.add(shadow)
      this.group.add(mount)
      this.floats.push({group:mount,baseY:0,phase:index*1.3})
    })
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
    this.pickables=[]
    this.floats=[]
    this.group.traverse(object=>{
      const mesh=object as THREE.Mesh
      if(mesh.geometry)mesh.geometry.dispose()
      const material=mesh.material as THREE.Material|undefined
      if(material){
        const mapped=(material as THREE.MeshBasicMaterial).map
        if(mapped&&mapped!==ExhibitMounts.blobTexture)mapped.dispose()
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
