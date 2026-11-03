// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest'
import * as THREE from 'three'
import {NetworkChamber} from '../src/spatial/NetworkChamber'
import {NETWORK_CENTER} from '../src/spatial/network-math'
import type {CatalogNode} from '../src/spatial/contracts'

const nodes:CatalogNode[]=Array.from({length:12},(_,index)=>({
  assetId:`node-${index}`,kind:'exhibit',label:`Node ${index}`,thumbnail:'',
}))

type ChamberView={nodes:{hit:THREE.Sprite;thumb:THREE.Sprite;base:THREE.Vector3}[];dust:THREE.Points}
const view=(chamber:NetworkChamber)=>chamber as unknown as ChamberView
const positionAttr=(chamber:NetworkChamber)=>view(chamber).dust.geometry.getAttribute('position') as THREE.BufferAttribute
const colorAttr=(chamber:NetworkChamber)=>view(chamber).dust.geometry.getAttribute('color') as THREE.BufferAttribute

function setup():{chamber:NetworkChamber;scene:THREE.Scene;camera:THREE.PerspectiveCamera}{
  const scene=new THREE.Scene()
  const chamber=new NetworkChamber(scene)
  chamber.group.visible=true
  chamber.setNodes(nodes,new Set(['node-0']))
  const camera=new THREE.PerspectiveCamera(55,800/600,0.1,900)
  return {chamber,scene,camera}
}

describe('journey dust constellation',()=>{
  beforeEach(()=>{
    HTMLCanvasElement.prototype.getContext=((()=>({
      createRadialGradient:()=>({addColorStop:()=>{}}),
      fillRect:()=>{},beginPath:()=>{},arc:()=>{},clip:()=>{},stroke:()=>{},drawImage:()=>{},
    })) as unknown) as typeof HTMLCanvasElement.prototype.getContext
  })
  it('renders records as points with no rings or edges',()=>{
    const {chamber}=setup()
    // 12 records plus decorative depth dust in a single draw call.
    expect(positionAttr(chamber).count).toBe(12+450)
    let sprites=0,lines=0
    chamber.group.traverse(object=>{
      if((object as THREE.Sprite).isSprite)sprites++
      if((object as THREE.LineSegments).isLineSegments)lines++
    })
    // Only invisible hits and hidden previews; no outlined circles.
    expect(sprites).toBe(24)
    expect(lines).toBe(0)
  })
  it('stays stationary through idle updates',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    const before=(positionAttr(chamber).array as Float32Array).slice()
    for(let i=0;i<60;i++)chamber.update(camera)
    expect(chamber.group.rotation.y).toBe(0)
    expect(positionAttr(chamber).array as Float32Array).toEqual(before)
  })
  it('shows dust only when zoomed out',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    chamber.update(camera)
    expect(view(chamber).nodes.filter(node=>node.thumb.visible)).toHaveLength(0)
  })
  it('reveals and accents the selected record',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    chamber.setSelected(3)
    chamber.update(camera)
    const shown=view(chamber).nodes.filter(node=>node.thumb.visible)
    expect(shown).toHaveLength(1)
    expect(view(chamber).nodes[3].thumb.visible).toBe(true)
    const accent=new THREE.Color(0xa9c5ff),colors=colorAttr(chamber)
    expect(colors.getX(3)).toBeCloseTo(accent.r,5)
    expect(colors.getY(3)).toBeCloseTo(accent.g,5)
    expect(colors.getZ(3)).toBeCloseTo(accent.b,5)
    chamber.setSelected(-1)
    // Deselection restores the record's own silver tone.
    expect(colors.getX(3)).not.toBeCloseTo(accent.r,5)
  })
  it('reveals only a bounded set of nearby previews when zoomed in',()=>{
    const {chamber,camera}=setup()
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+40)
    chamber.update(camera)
    const shown=view(chamber).nodes.filter(node=>node.thumb.visible).length
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThanOrEqual(8)
  })
  it('still picks records through the invisible hit discs',()=>{
    const scene=new THREE.Scene()
    const chamber=new NetworkChamber(scene)
    chamber.group.visible=true
    chamber.setNodes([nodes[0]],new Set())
    const camera=new THREE.PerspectiveCamera(55,800/600,0.1,900)
    camera.position.set(NETWORK_CENTER[0],NETWORK_CENTER[1],NETWORK_CENTER[2]+64)
    camera.lookAt(...NETWORK_CENTER)
    scene.updateMatrixWorld(true)
    const only=view(chamber).nodes[0]
    const projected=only.base.clone().project(camera)
    const hitX=(projected.x+1)/2*800,hitY=(1-projected.y)/2*600
    expect(chamber.pick(hitX,hitY,camera,{left:0,top:0,width:800,height:600})).toBe(0)
    // A miss in the farthest corner selects nothing.
    const missX=hitX<400?799:0,missY=hitY<300?599:0
    expect(chamber.pick(missX,missY,camera,{left:0,top:0,width:800,height:600})).toBe(-1)
  })
})
