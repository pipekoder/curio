import * as THREE from 'three'
import type {CatalogNode} from './contracts'
import {ExhibitMounts} from './ExhibitMounts'
import {NETWORK_CENTER,NETWORK_RADIUS,layoutDust,mulberry} from './network-math'

// The Curiosity Journey as silver dust: one fine particle per real catalog
// record in a single draw call, plus dimmer decorative dust for depth. No
// rings, no edges, no diagram: an atmospheric 3D cloud of silver-white
// points over the light editorial field, with scene fog falloff.
//
// The cloud is stationary unless the visitor acts: no idle rotation, drift,
// or zoom. Drag rotates, wheel/pinch zooms, tap selects through invisible
// hit discs. Image previews stay hidden at rest and fade in progressively
// for the selected record plus the nearest few when zoomed in, while the
// node panel carries the full label, artwork, and Enter/Curate actions.
const DUST_SIZE=0.4
const DUST_EXTRA=450
const THUMB_SIZE=3.0
const HIT_SIZE=4.6
const ACCENT=0xa9c5ff
// Zoomed-in reveal: only when the camera is this close to the chamber
// center may nearby records show previews, capped so the view stays calm.
const REVEAL_RADIUS=56
const REVEAL_DIST=52
const REVEAL_MAX=8

type ChamberNode={hit:THREE.Sprite;thumb:THREE.Sprite;url:string;loaded:boolean;base:THREE.Vector3;revealAt:number}

export class NetworkChamber{
  readonly group=new THREE.Group()
  private raycaster=new THREE.Raycaster()
  private nodes:ChamberNode[]=[]
  private dust:THREE.Points|null=null
  private baseColors=new Float32Array(0)
  private allBases=new Float32Array(0)
  private selected=-1
  private center=new THREE.Vector3(...NETWORK_CENTER)

  constructor(scene:THREE.Scene){
    this.group.visible=false
    scene.add(this.group)
  }

  setNodes(nodes:readonly CatalogNode[],stagedIds:ReadonlySet<string>):void{
    this.clear()
    const rand=mulberry(7)
    const real=layoutDust(nodes.length,NETWORK_CENTER,NETWORK_RADIUS*0.8,rand)
    const decor=layoutDust(DUST_EXTRA,NETWORK_CENTER,NETWORK_RADIUS*1.3,rand)
    const total=nodes.length+DUST_EXTRA
    const positions=new Float32Array(total*3),colors=new Float32Array(total*3)
    const silver=(dim:number)=>{
      const v=dim+rand()*0.14
      return [v*0.94,v*0.99,v*1.06]
    }
    nodes.forEach((node,index)=>{
      const [x,y,z]=real[index]
      positions.set([x,y,z],index*3)
      colors.set(stagedIds.has(node.assetId)?silver(0.3):silver(0.38),index*3)
      const hit=new THREE.Sprite(new THREE.SpriteMaterial({colorWrite:false,depthWrite:false}))
      hit.scale.setScalar(HIT_SIZE)
      hit.position.set(x,y,z)
      hit.userData={index}
      const thumb=new THREE.Sprite(new THREE.SpriteMaterial({color:0xe8ecf1,transparent:true,fog:false,opacity:0}))
      thumb.scale.setScalar(THUMB_SIZE)
      thumb.position.set(x,y,z)
      thumb.visible=false
      this.group.add(hit,thumb)
      this.nodes.push({hit,thumb,url:node.thumbnail,loaded:false,base:new THREE.Vector3(x,y,z),revealAt:0})
    })
    decor.forEach(([x,y,z],k)=>{
      const at=(nodes.length+k)*3
      positions.set([x,y,z],at)
      colors.set(silver(0.66),at)
    })
    const geometry=new THREE.BufferGeometry()
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3))
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3))
    this.dust=new THREE.Points(geometry,new THREE.PointsMaterial({size:DUST_SIZE,map:ExhibitMounts.flare(),vertexColors:true,transparent:true,opacity:1,depthWrite:false}))
    this.dust.frustumCulled=false
    this.group.add(this.dust)
    this.baseColors=colors.slice()
    this.allBases=positions.slice()
  }

  // Circular-cropped artwork so revealed records read as discs. Same-origin
  // imagery needs no CORS handling; on failure the dust point stays and the
  // HUD panel carries the label. Textures load lazily on first reveal, so a
  // zoomed-out chamber fetches no thumbnails at all.
  private loadThumb(node:ChamberNode):void{
    if(node.loaded||!node.url)return
    node.loaded=true
    const thumb=node.thumb
    const image=new Image()
    // Anonymous CORS: a tainted canvas would throw at WebGL upload time, so
    // uncooperative hosts fail here instead and keep the dust point.
    image.crossOrigin='anonymous'
    image.onerror=()=>{/* Dust point stays; the HUD panel carries the label. */}
    image.onload=()=>{
      // A pruned node is detached before its thumbnail arrives; the dust
      // point stays and nothing revoked is ever drawn.
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

  setSelected(index:number):void{
    if(!this.dust)return
    const colors=this.dust.geometry.getAttribute('color') as THREE.BufferAttribute
    const paint=(i:number,accent:boolean)=>{
      if(accent){
        const tint=new THREE.Color(ACCENT)
        colors.setXYZ(i,tint.r,tint.g,tint.b)
      }else colors.setXYZ(i,this.baseColors[i*3],this.baseColors[i*3+1],this.baseColors[i*3+2])
    }
    if(this.selected>=0&&this.nodes[this.selected])paint(this.selected,false)
    this.selected=index
    if(index>=0&&this.nodes[index])paint(index,true)
    colors.needsUpdate=true
  }

  // Stationary by default: reveal state follows the camera and selection,
  // but nothing moves on its own. Reduced motion needs no special case.
  update(camera?:THREE.Camera):void{
    if(!this.group.visible||!this.dust)return
    const radius=camera?camera.position.distanceTo(this.center):Infinity
    const nearby:number[]=[]
    if(camera&&radius<REVEAL_RADIUS){
      const scored:[number,number][]=[]
      for(let i=0;i<this.nodes.length;i++){
        const dist=this.nodes[i].base.distanceTo(camera.position)
        if(dist<REVEAL_DIST)scored.push([dist,i])
      }
      scored.sort((a,b)=>a[0]-b[0])
      for(let k=0;k<scored.length&&k<REVEAL_MAX;k++)nearby.push(scored[k][1])
    }
    // Zooming in dims the dust as previews emerge; near points never blob.
    ;(this.dust.material as THREE.PointsMaterial).opacity=0.55+0.45*Math.min(1,Math.max(0,(radius-38)/26))
    const positions=this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const now=performance.now()
    let moved=false
    this.nodes.forEach((node,index)=>{
      const revealed=index===this.selected||nearby.includes(index)
      if(revealed&&!node.loaded)this.loadThumb(node)
      if(revealed&&!node.thumb.visible){node.thumb.visible=true;node.revealAt=now}
      if(!revealed&&node.thumb.visible){node.thumb.visible=false;(node.thumb.material as THREE.SpriteMaterial).opacity=0}
      if(revealed){
        const material=node.thumb.material as THREE.SpriteMaterial
        material.opacity=Math.min(1,(now-node.revealAt)/350)
      }
      // A revealed record hides its dust point so the preview reads clean.
      const hiddenY=node.base.y+100000
      const y=positions.getY(index)
      if(revealed&&y!==hiddenY){positions.setY(index,hiddenY);moved=true}
      else if(!revealed&&y!==node.base.y){positions.setY(index,node.base.y);moved=true}
    })
    if(moved)positions.needsUpdate=true
  }

  // Clear exhale: the constellation breathes outward and dissolves.
  disperse(t:number):void{
    if(!this.dust)return
    const eased=1-Math.pow(1-Math.min(1,Math.max(0,t)),2)
    const positions=this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const array=positions.array as Float32Array,bases=this.allBases,center=this.center
    for(let i=0;i<array.length;i+=3){
      array[i]=bases[i]+(bases[i]-center.x)*eased*1.6
      array[i+1]=bases[i+1]+(bases[i+1]-center.y)*eased*1.6
      array[i+2]=bases[i+2]+(bases[i+2]-center.z)*eased*1.6
    }
    positions.needsUpdate=true
    ;(this.dust.material as THREE.PointsMaterial).opacity=1-eased
    this.nodes.forEach((node,index)=>{
      node.hit.position.set(array[index*3],array[index*3+1],array[index*3+2])
      node.thumb.position.copy(node.hit.position)
      ;(node.thumb.material as THREE.SpriteMaterial).opacity=1-eased
    })
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
    // Only thumbnails own their textures; the dust shares statics.
    for(const node of this.nodes){
      const owned=(node.thumb.material as THREE.SpriteMaterial).map
      if(owned)owned.dispose()
      ;(node.hit.material as THREE.Material).dispose()
      ;(node.thumb.material as THREE.Material).dispose()
    }
    this.nodes=[]
    this.dust?.geometry.dispose()
    ;(this.dust?.material as THREE.Material|undefined)?.dispose()
    this.dust=null
    this.selected=-1
    this.group.clear()
  }

  dispose():void{
    this.clear()
    this.group.parent?.remove(this.group)
  }
}
