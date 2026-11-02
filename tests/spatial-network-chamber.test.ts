// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest'
import * as THREE from 'three'
import {NetworkChamber} from '../src/spatial/NetworkChamber'
import {NETWORK_CENTER} from '../src/spatial/network-math'
import type {CatalogNode} from '../src/spatial/contracts'

const nodes:CatalogNode[]=Array.from({length:12},(_,index)=>({
  assetId:`node-${index}`,kind:'exhibit',label:`Node ${index}`,thumbnail:'',
}))

function roles(chamber:NetworkChamber,role:string):THREE.Sprite[]{
  const found:THREE.Sprite[]=[]
  chamber.group.traverse(object=>{
    if((object as THREE.Sprite).isSprite&&(object.userData as {role?:string}).role===role)found.push(object as THREE.Sprite)
  })
  return found.sort((a,b)=>((a.userData as {index:number}).index-(b.userData as {index:number}).index))
}

function setup():{chamber:NetworkChamber;scene:THREE.Scene;camera:THREE.PerspectiveCamera}{
  const scene=new THREE.Scene()
  const chamber=new NetworkChamber(scene)
  chamber.group.visible=true
  chamber.setNodes(nodes,new Set(['node-0']))
  const camera=new THREE.PerspectiveCamera(55,800/600,0.1,900)
  return {chamber,scene,camera}
}

describe('journey constellation',()=>{
  beforeEach(()=>{
    HTMLCanvasElement.prototype.getContext=((()=>({
      createRadialGradient:()=>({addColorStop:()=>{}}),
      fillRect:()=>{},beginPath:()=>{},arc:()=>{},clip:()=>{},stroke:()=>{},drawImage:()=>{},
    })) as unknown) as typeof HTMLCanvasElement.prototype.getContext
  })
  it('stays stationary through idle updates',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    const before=roles(chamber,'dot').map(dot=>dot.position.clone())
    for(let i=0;i<60;i++)chamber.update(camera)
    expect(chamber.group.rotation.y).toBe(0)
    roles(chamber,'dot').forEach((dot,index)=>expect(dot.position.equals(before[index])).toBe(true))
  })
  it('shows particles instead of thumbnails when zoomed out',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    chamber.update(camera)
    expect(roles(chamber,'thumb').filter(thumb=>thumb.visible)).toHaveLength(0)
    expect(roles(chamber,'dot').filter(dot=>dot.visible)).toHaveLength(12)
  })
  it('reveals the selected record while the rest stay particles',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    chamber.setSelected(3)
    chamber.update(camera)
    const thumbs=roles(chamber,'thumb'),dots=roles(chamber,'dot')
    expect(thumbs.filter(thumb=>thumb.visible)).toHaveLength(1)
    expect(thumbs[3].visible).toBe(true)
    expect(dots[3].visible).toBe(false)
    expect(dots.filter(dot=>dot.visible)).toHaveLength(11)
  })
  it('reveals only a bounded set of nearby previews when zoomed in',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+40)
    chamber.update(camera)
    const shown=roles(chamber,'thumb').filter(thumb=>thumb.visible).length
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThanOrEqual(8)
  })
  it('still picks nodes through the invisible hit discs',()=>{
    const {chamber,scene,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    camera.lookAt(...NETWORK_CENTER)
    scene.updateMatrixWorld(true)
    const dots=roles(chamber,'dot')
    const projected=dots[5].position.clone().project(camera)
    const picked=chamber.pick(
      (projected.x+1)/2*800,-(projected.y-1)/2*600,
      camera,{left:0,top:0,width:800,height:600},
    )
    expect(picked).toBe(5)
  })
})
