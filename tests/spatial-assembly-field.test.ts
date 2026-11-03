// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest'
import * as THREE from 'three'
import {AssemblyField} from '../src/spatial/AssemblyField'

const TARGET={x:0,y:2.6,z:-52}

function settledPositions():Float32Array{
  const scene=new THREE.Scene()
  const field=new AssemblyField(scene,TARGET)
  field.update('lattice',0,0)
  const points=scene.children.find(child=>(child as THREE.Points).isPoints) as THREE.Points
  const positions=points.geometry.getAttribute('position')
  const count=positions.count
  expect(count).toBe(3380)
  expect((points.material as THREE.PointsMaterial).size).toBe(0.25)
  field.dispose(scene)
  return (positions.array as Float32Array).slice()
}

describe('assembly particle field',()=>{
  beforeEach(()=>{
    HTMLCanvasElement.prototype.getContext=((()=>({
      createRadialGradient:()=>({addColorStop:()=>{}}),
      fillRect:()=>{},
    })) as unknown) as typeof HTMLCanvasElement.prototype.getContext
  })
  it('forms a dense-centered radial cloud with soft falloff and depth',()=>{
    const array=settledPositions()
    const count=array.length/3
    let inner=0,tail=0,corner=0
    let zSum=0,zSquare=0,maxRadius=0
    for(let i=0;i<count;i++){
      const dx=array[i*3]-TARGET.x,dy=array[i*3+1]-TARGET.y,dz=array[i*3+2]-TARGET.z-0.3
      const radius=Math.hypot(dx,dy)
      if(radius<2)inner++
      if(Math.abs(dx)>4.2||Math.abs(dy)>2.9)tail++
      if(Math.hypot(Math.abs(dx)-4,Math.abs(dy)-2.7)<0.3)corner++
      if(radius>maxRadius)maxRadius=radius
      zSum+=dz;zSquare+=dz*dz
    }
    // Dense center: far above the old uniform rectangle's share.
    expect(inner/count).toBeGreaterThan(0.45)
    // Soft tail escapes the old rectangular boundary; nothing piles on it.
    expect(tail/count).toBeGreaterThan(0.02)
    expect(corner/count).toBeLessThan(0.02)
    expect(maxRadius).toBeLessThan(16)
    // Gaussian depth instead of a thin slab.
    const zMean=zSum/count
    expect(Math.sqrt(zSquare/count-zMean*zMean)).toBeGreaterThan(0.4)
  })
})
