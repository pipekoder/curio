import * as THREE from 'three'
import type {CatalogNode} from './contracts'
import {ExhibitMounts} from './ExhibitMounts'
import {NETWORK_CENTER,NETWORK_RADIUS,buildEdges,layoutNetwork,nodeScale,relevanceWeights} from './network-math'

// The Curiosity Journey constellation: one refined particle per real catalog
// node, edges only where edge hints resolve on both ends. No invented
// records, no decorative filler nodes; the chamber scales with the catalog.
//
// The constellation is stationary unless the visitor acts: no idle rotation,
// drift, or zoom. Drag rotates, wheel/pinch zooms, tap selects. Image
// previews stay hidden at rest and reveal progressively — for the selected
// node, plus the nearest few when zoomed in — while the node panel carries
// the full label, artwork, and Enter/Curate actions.
const DOT_SIZE=1.15
const RING_SIZE=2.3
const THUMB_SIZE=3.0
const HIT_SIZE=4.6
const DETAIL=0x7a8ca8
const BRASS=0xb98a3e
const ACCENT=0xa9c5ff
const PEARL=0xf6f9fd
const FAINT=0xd9e2f0
// Zoomed-in reveal: only when the camera is this close to the chamber
// center may nearby nodes show previews, capped so the view stays calm.
const REVEAL_RADIUS=56
const REVEAL_DIST=52
const REVEAL_MAX=8

type ChamberNode={
  dot:THREE.Sprite;ring:THREE.Sprite;thumb:THREE.Sprite;hit:THREE.Sprite;
  url:string;loaded:boolean;base:THREE.Vector3;dotBase:number;assetId:string
}

export class NetworkChamber{
  readonly group=new THREE.Group()
  private raycaster=new THREE.Raycaster()
  private nodes:ChamberNode[]=[]
  private edges:THREE.LineSegments|null=null
  private selected=-1
  private staged=new Set<string>()
  private center=new THREE.Vector3(...NETWORK_CENTER)

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
    const dotMap=ExhibitMounts.flare()
    const make=(material:THREE.SpriteMaterial,size:number,index:number)=>{
      const sprite=new THREE.Sprite(material)
      sprite.scale.setScalar(size)
      sprite.position.set(...positions[index])
      sprite.userData={index}
      return sprite
    }
    nodes.forEach((node,index)=>{
      const scale=nodeScale(weights[index])
      const dot=make(new THREE.SpriteMaterial({map:dotMap,transparent:true,fog:false,depthWrite:false}),DOT_SIZE*scale,index)
      ;(dot.material as THREE.SpriteMaterial).color.set(stagedIds.has(node.assetId)?PEARL:FAINT)
      const dotBase=0.72+0.28*weights[index]
      ;(dot.material as THREE.SpriteMaterial).opacity=dotBase
      const ring=make(new THREE.SpriteMaterial({map:NetworkChamber.ringTexture(),transparent:true,fog:false,depthWrite:false,opacity:0.8}),RING_SIZE*scale,index)
      const thumb=make(new THREE.SpriteMaterial({color:0xe8ecf1,transparent:true,fog:false}),THUMB_SIZE*scale,index)
      thumb.visible=false
      const hit=make(new THREE.SpriteMaterial({colorWrite:false,depthWrite:false}),HIT_SIZE,index)
      this.group.add(dot,ring,thumb,hit)
      this.nodes.push({dot,ring,thumb,hit,url:node.thumbnail,loaded:false,base:new THREE.Vector3(...positions[index]),dotBase,assetId:node.assetId})
      this.paintRing(index)
    })
    if(edgePairs.length){
      const array=new Float32Array(edgePairs.length*6)
      edgePairs.forEach(([a,b],i)=>{
        array.set([positions[a][0],positions[a][1],positions[a][2],positions[b][0],positions[b][1],positions[b][2]],i*6)
      })
      const geometry=new THREE.BufferGeometry()
      geometry.setAttribute('position',new THREE.BufferAttribute(array,3))
      this.edges=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x7a8ca8,transparent:true,opacity:0.3,fog:false}))
      this.group.add(this.edges)
    }
  }

  // Circular-cropped artwork so revealed nodes read as discs. Same-origin
  // imagery needs no CORS handling; on failure the pearl dot stays and the
  // HUD panel carries the label. Textures load lazily on first reveal, so a
  // zoomed-out chamber fetches no thumbnails at all.
  private loadThumb(node:ChamberNode):void{
    if(node.loaded||!node.url)return
    node.loaded=true
    const thumb=node.thumb
    const image=new Image()
    // Anonymous CORS: a tainted canvas would throw at WebGL upload time, so
    // uncooperative hosts fail here instead and keep the pearl dot.
    image.crossOrigin='anonymous'
    image.onerror=()=>{/* Pearl dot stays; the HUD panel carries the label. */}
    image.onload=()=>{
      // A pruned node is detached before its thumbnail arrives; the pearl
      // dot stays and nothing revoked is ever drawn.
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
    image.src=node.url
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
    if(previous>=0&&this.nodes[previous])this.paintRing(previous)
    if(index>=0&&this.nodes[index])this.paintRing(index)
  }

  private paintRing(index:number):void{
    const node=this.nodes[index]
    if(!node)return
    ;(node.ring.material as THREE.SpriteMaterial).color.set(index===this.selected?ACCENT:this.staged.has(node.assetId)?BRASS:DETAIL)
  }

  // Stationary by default: reveal state follows the camera and selection,
  // but nothing moves on its own. Reduced motion needs no special case.
  update(camera?:THREE.Camera):void{
    if(!this.group.visible)return
    const nearby:number[]=[]
    if(camera&&camera.position.distanceTo(this.center)<REVEAL_RADIUS){
      const scored:[number,number][]=[]
      for(let i=0;i<this.nodes.length;i++){
        const dist=this.nodes[i].base.distanceTo(camera.position)
        if(dist<REVEAL_DIST)scored.push([dist,i])
      }
      scored.sort((a,b)=>a[0]-b[0])
      for(let k=0;k<scored.length&&k<REVEAL_MAX;k++)nearby.push(scored[k][1])
    }
    this.nodes.forEach((node,index)=>{
      const revealed=index===this.selected||nearby.includes(index)
      if(revealed&&!node.loaded)this.loadThumb(node)
      node.thumb.visible=revealed
      node.dot.visible=!revealed
    })
  }

  // Clear exhale: the constellation breathes outward and dissolves.
  disperse(t:number):void{
    const clamped=Math.min(1,Math.max(0,t))
    const eased=1-Math.pow(1-clamped,2)
    this.nodes.forEach(node=>{
      const position=node.base.clone().sub(this.center).multiplyScalar(eased*1.6).add(node.base)
      const sprites=[node.dot,node.ring,node.thumb],bases=[node.dotBase,0.8,1]
      sprites.forEach((sprite,i)=>{
        sprite.position.copy(position)
        ;(sprite.material as THREE.SpriteMaterial).opacity=bases[i]*(1-eased)
      })
      node.hit.position.copy(position)
    })
    if(this.edges)(this.edges.material as THREE.LineBasicMaterial).opacity=0.3*(1-eased)
  }

  pick(clientX:number,clientY:number,camera:THREE.Camera,rect:{left:number;top:number;width:number;height:number}):number{
    if(!this.group.visible)return -1
    this.raycaster.setFromCamera(new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1,
    ),camera)
    const hits=this.raycaster.intersectObjects(this.nodes.map(node=>node.hit),false)
    return (hits[0]?.object.userData as {index?:number}|undefined)?.index??-1
  }

  private clear():void{
    // Only thumbnails own their textures; dots and rings share statics.
    for(const node of this.nodes){
      const owned=(node.thumb.material as THREE.SpriteMaterial).map
      if(owned)owned.dispose()
      for(const sprite of [node.dot,node.ring,node.thumb,node.hit])(sprite.material as THREE.Material).dispose()
    }
    this.nodes=[]
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
