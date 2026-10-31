import {describe,expect,it} from 'vitest'
import {displayTier} from '../src/spatial/SilverField'

describe('display tiers',()=>{
 it('caps pixels, MSAA, and dust on coarse pointers',()=>{
  expect(displayTier(true)).toEqual({pixelRatioCap:1.5,antialias:false,dust:300})
 })
 it('keeps full quality on fine pointers',()=>{
  expect(displayTier(false)).toEqual({pixelRatioCap:2,antialias:true,dust:600})
 })
})
