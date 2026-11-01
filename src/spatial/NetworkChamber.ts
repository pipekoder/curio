import * as THREE from 'three'
import type {CatalogNode} from './contracts'
import {NETWORK_CENTER,NETWORK_RADIUS,buildEdges,layoutNetwork,nodeScale,relevanceWeights} from './network-math'

// The Curiosity Journey constellation: one sprite per real catalog node,
// edges only where edge hints resolve on both ends. No invented records,
// no decorative filler nodes; the chamber scales with the catalog.
const NODE_SIZE=3.4
const RING_SIZE=4.4
const DETAIL=0x7a8ca8
const BRASS=0xb98a3e
const ACCENT=0xa9c5ff

export class NetworkChamber{
  readonly group=new THREE.Group()
  private raycaster=new THREE.Raycaster()
  private thumbs:THREE.Sprite[]=[]
  private rings:THREE.Sprite[]=[]
  private base:THREE.Vector3[]=[]
  private ringBase:number[]=[]
  private edges:THREE.LineSegments|null=null
  private selected=-1
  private staged=new Set<string>()
  private idleMs=0

  constructor(scene:THREE.Scene){
    this.group.visible=false
    scene.add(this.group)
  }

  setNodes(nodes:readonly CatalogNode[],stagedIds:ReadonlySet<string>):void{
    this.clear()
    this.staged=new Set(stagedIds)
    const hints=new Map(nodes.map(node=>[node.assetId,node.edgeHints??[]] as const))
    const edgePairs=buildEdges(nodes.map(node=>node.assetId),hints)
    const stagedIndexes=new Set(nodes.map((node,index)=>stagedIds.has(node.assetId)?index:-1).filter(i=>i>=0))
    const weights=relevanceWeights(stagedIndexes,edgePairs,nodes.length)
    const positions=layoutNetwork(nodes.length,NETWORK_CENTER,NETWORK_RADIUS,weights)
    nodes.forEach((node,index)=>{
      const [x,y,z]=positions[index]
      const scale=nodeScale(weights[index])
      const thumb=new THREE.Sprite(new THREE.SpriteMaterial({color:0xe8ecf1,transparent:true,fog:false}))
      thumb.scale.set(NODE_SIZE*scale,NODE_SIZE*scale,1)
      thumb.position.set(x,y,z)
      thumb.userData={index,assetId:node.assetId}
      const ring=new THREE.Sprite(new THREE.SpriteMaterial({map:NetworkChamber.ringTexture(),transparent:true,fog:false,depthWrite:false}))
      ring.scale.set(RING_SIZE*scale,RING_SIZE*scale,1)
      ring.position.set(x,y,z)
      this.group.add(thumb,ring)
      this.loadThumb(node.thumbnail,thumb)
      this.thumbs.push(thumb)
      this.rings.push(ring)
      this.ringBase.push(RING_SIZE*scale)
      this.base.push(new THREE.Vector3(x,y,z))
      this.paintRing(index)
    })
    if(edgePairs.length){
      const array=new Float32Array(edgePairs.length*6)
      edgePairs.forEach(([a,b],i)=>{
        array.set([positions[a][0],positions[a][1],positions[a][2],positions[b][0],positions[b][1],positions[b][2]],i*6)
      })
      const geometry=new THREE.BufferGeometry()
      geometry.setAttribute('position',new THREE.BufferAttribute(array,3))
      this.edges=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x7a8ca8,transparent:true,opacity:0.45,fog:false}))
      this.group.add(this.edges)
    }
  }

  // Circular-cropped artwork so nodes read as discs inside their rings.
  // Same-origin imagery needs no CORS handling; on failure the graphite
  // disc stays and the HUD panel carries the label.
  private loadThumb(url:string,thumb:THREE.Sprite):void{
    if(!url)return
    const image=new Image()
    // Anonymous CORS: a tainted canvas would throw at WebGL upload time, so
    // uncooperative hosts fail here instead and keep the graphite disc.
    image.crossOrigin='anonymous'
    image.onerror=()=>{/* Graphite disc stays; the HUD panel carries the label. */}
    image.onload=()=>{
      // A pruned node is detached before its thumbnail arrives; the graphite
      // disc stays and nothing revoked is ever drawn.
      if(!thumb.parent)return
      const size=256,canvas=document.createElement('canvas')
      canvas.width=size;canvas.height=size
      const ctx=canvas.getContext('2d')
      if(!ctx)return
      ctx.beginPath()
      ctx.arc(size/2,size/2,size/2,0,Math.PI*2)
      ctx.clip()
      const side=Math.min(image.width,image.height)
      ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,size,size)
      const texture=new THREE.CanvasTexture(canvas)
      texture.colorSpace=THREE.SRGBColorSpace
      const material=thumb.material as THREE.SpriteMaterial
      material.map=texture
      material.color.set(0xffffff)
      material.needsUpdate=true
    }
    image.src=url
  }

  private static ring:THREE.Texture|null=null
  private static ringTexture():THREE.Texture{
    if(!NetworkChamber.ring){
      const canvas=document.createElement('canvas')
      canvas.width=128;canvas.height=128
      const ctx=canvas.getContext('2d')!
      ctx.strokeStyle='rgba(255,255,255,1)'
      ctx.lineWidth=7
      ctx.beginPath()
      ctx.arc(64,64,54,0,Math.PI*2)
      ctx.stroke()
      NetworkChamber.ring=new THREE.CanvasTexture(canvas)
    }
    return NetworkChamber.ring
  }

  setSelected(index:number):void{
    const previous=this.selected
    this.selected=index
    if(previous>=0&&this.rings[previous])this.paintRing(previous)
    if(index>=0&&this.rings[index])this.paintRing(index)
  }

  private paintRing(index:number):void{
    const ring=this.rings[index]
    if(!ring)return
    const thumb=this.thumbs[index]
    const stagedNode=thumb!==undefined&&this.staged.has((thumb.userData as {assetId?:string}).assetId??'')
    ;(ring.material as THREE.SpriteMaterial).color.set(index===this.selected?ACCENT:stagedNode?BRASS:DETAIL)
  }

  // Slow constellation drift; pauses while the visitor orbits, resumes idle.
  update(elapsed:number,dt:number,interacting:boolean,reducedMotion:boolean):void{
    if(!this.group.visible)return
    this.idleMs=interacting?0:this.idleMs+dt*1000
    if(!reducedMotion&&!interacting&&this.idleMs>2500)this.group.rotation.y+=dt*0.025
    if(this.selected>=0&&this.rings[this.selected]&&!reducedMotion){
      const pulse=1+Math.sin(elapsed*3.2)*0.07
      const base=this.ringBase[this.selected]??RING_SIZE
      this.rings[this.selected].scale.set(base*pulse,base*pulse,1)
    }
  }

  // Clear exhale: the constellation breathes outward and dissolves.
  disperse(t:number):void{
    const clamped=Math.min(1,Math.max(0,t))
    const eased=1-Math.pow(1-clamped,2)
    this.thumbs.forEach((thumb,i)=>{
      const direction=this.base[i].clone().sub(new THREE.Vector3(...NETWORK_CENTER))
      thumb.position.copy(this.base[i].clone().add(direction.multiplyScalar(eased*1.6)))
      ;(thumb.material as THREE.SpriteMaterial).opacity=1-eased
      const ring=this.rings[i]
      ring.position.copy(thumb.position)
      ;(ring.material as THREE.SpriteMaterial).opacity=1-eased
    })
    if(this.edges)(this.edges.material as THREE.LineBasicMaterial).opacity=0.45*(1-eased)
  }

  pick(clientX:number,clientY:number,camera:THREE.Camera,rect:{left:number;top:number;width:number;height:number}):number{
    if(!this.group.visible)return -1
    this.raycaster.setFromCamera(new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1,
    ),camera)
    const hits=this.raycaster.intersectObjects(this.thumbs,false)
    return (hits[0]?.object.userData as {index?:number}|undefined)?.index??-1
  }

  get count():number{
    return this.thumbs.length
  }

  private clear():void{
    for(const sprite of [...this.thumbs,...this.rings]){
      const material=sprite.material as THREE.SpriteMaterial
      if(material.map&&material.map!==NetworkChamber.ring)material.map.dispose()
      material.dispose()
    }
    this.thumbs=[]
    this.rings=[]
    this.base=[]
    this.ringBase=[]
    this.edges?.geometry.dispose()
    ;(this.edges?.material as THREE.Material|undefined)?.dispose()
    this.edges=null
    this.selected=-1
    this.group.clear()
  }

  dispose():void{
    this.clear()
    this.group.parent?.remove(this.group)
  }
}
