// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest'
import * as THREE from 'three'
import {ExhibitMounts,FRAME_H,FRAME_W} from '../src/spatial/ExhibitMounts'
import type {StagedExhibit} from '../src/spatial/staging'

type Pending={url:string;onLoad:(texture:THREE.Texture)=>void;onError:()=>void}
const stubLoader=()=>{
  const pending:Pending[]=[]
  return {
    pending,
    loader:{load:(url:string,onLoad:(texture:THREE.Texture)=>void,_progress?:unknown,onError?:()=>void)=>{
      pending.push({url,onLoad,onError:onError??(()=>{})})
    }} as unknown as THREE.TextureLoader,
  }
}
const exhibit=(assetId:string):StagedExhibit=>({
  assetId,title:'Study',narrative:'A reading.',image:`/${assetId}.png`,
  attribution:'Attribution',rights:'Rights',hotspots:[],
})
const mountedIds=(mounts:ExhibitMounts):string[]=>{
  const ids:string[]=[]
  mounts.group.traverse(object=>{const id=(object.userData as {assetId?:string}).assetId;if(id)ids.push(id)})
  return [...new Set(ids)]
}

describe('exhibit mount lifecycle',()=>{
  // jsdom has no 2d canvas; the mount shadow only needs gradient stubs.
  beforeEach(()=>{
    HTMLCanvasElement.prototype.getContext=((()=>({
      createRadialGradient:()=>({addColorStop:()=>{}}),
      fillRect:()=>{},
    })) as unknown) as typeof HTMLCanvasElement.prototype.getContext
  })
  it('clears mounts, pickables, and textures when exhibits are replaced',()=>{
    const scene=new THREE.Scene()
    const {pending,loader}=stubLoader()
    const mounts=new ExhibitMounts(scene,loader)
    mounts.setExhibits([exhibit('a')],[1,2].map(()=>({x:0,z:-52})))
    expect(mounts.group.children).toHaveLength(1)
    const texture=new THREE.Texture()
    const disposed=vi.spyOn(texture,'dispose')
    pending[0].onLoad(texture)
    expect(mountedIds(mounts)).toEqual(['a'])
    mounts.setExhibits([exhibit('b')],[])
    expect(mounts.group.children).toHaveLength(1)
    expect(mountedIds(mounts)).toEqual(['b'])
    expect(disposed).toHaveBeenCalledTimes(1)
    mounts.setExhibits([],[])
    expect(mounts.group.children).toHaveLength(0)
    expect(mounts.pick(0,0,new THREE.PerspectiveCamera(),{left:0,top:0,width:1,height:1})).toBeNull()
  })
  it('disposes late textures arriving after their mount was pruned',()=>{
    const scene=new THREE.Scene()
    const {pending,loader}=stubLoader()
    const mounts=new ExhibitMounts(scene,loader)
    mounts.setExhibits([exhibit('a')],[])
    mounts.setExhibits([exhibit('b')],[])
    const late=new THREE.Texture()
    const disposed=vi.spyOn(late,'dispose')
    pending[0].onLoad(late)
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(mountedIds(mounts)).toEqual(['b'])
  })
  it('ignores errors from pruned loads instead of pruning the replacement',()=>{
    const scene=new THREE.Scene()
    const {pending,loader}=stubLoader()
    const mounts=new ExhibitMounts(scene,loader)
    const onArtworkError=vi.fn()
    mounts.onArtworkError=onArtworkError
    mounts.setExhibits([exhibit('a')],[])
    mounts.setExhibits([exhibit('a')],[])
    pending[0].onError()
    expect(onArtworkError).not.toHaveBeenCalled()
    pending[1].onError()
    expect(onArtworkError).toHaveBeenCalledWith('a')
  })
  it('disposes every texture exactly once across repeated staging cycles',()=>{
    const scene=new THREE.Scene()
    const {pending,loader}=stubLoader()
    const mounts=new ExhibitMounts(scene,loader)
    const disposed:(() => void)[]=[]
    for(const id of ['a','b','c']){
      mounts.setExhibits([exhibit(id)],[])
      const texture=new THREE.Texture()
      disposed.push(vi.spyOn(texture,'dispose'))
      pending[pending.length-1].onLoad(texture)
    }
    mounts.setExhibits([],[])
    for(const spy of disposed)expect(spy).toHaveBeenCalledTimes(1)
    expect(mounts.group.children).toHaveLength(0)
  })
  it('fills the rounded frame edge-to-edge with artwork',()=>{
    const scene=new THREE.Scene()
    const {loader}=stubLoader()
    const mounts=new ExhibitMounts(scene,loader)
    mounts.setExhibits([{...exhibit('a'),hotspots:[{id:'h',label:'Detail',x:0.25,y:0.25,brandName:'Brand',productName:'Product',priceUsd:10,assumptions:[]}]}],[])
    let art:THREE.Mesh|null=null,glass=false,loop=false
    mounts.group.traverse(object=>{
      if((object as THREE.Mesh).isMesh&&(object.userData as {assetId?:string}).assetId){
        const mesh=object as THREE.Mesh
        if(mesh.geometry instanceof THREE.PlaneGeometry)art=mesh
      }
      const material=(object as THREE.Mesh).material as THREE.MeshBasicMaterial|undefined
      if(material&&material.vertexColors)glass=true
      if((object as THREE.LineLoop).isLineLoop)loop=true
    })
    expect(art).not.toBeNull()
    const params=(art!.geometry as THREE.PlaneGeometry).parameters
    expect([params.width,params.height]).toEqual([FRAME_W,FRAME_H])
    expect(glass).toBe(true)
    expect(loop).toBe(true)
    const ring=mounts.group.children[0].children.find(child=>child instanceof THREE.Mesh&&child.geometry instanceof THREE.TorusGeometry) as THREE.Mesh
    expect(ring.position.x).toBeCloseTo((0.25-0.5)*FRAME_W)
    expect(ring.position.y).toBeCloseTo(2.6+(0.5-0.25)*FRAME_H)
  })
})
