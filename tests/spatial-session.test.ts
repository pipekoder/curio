import {describe,expect,it,vi} from 'vitest'
import {HudBridge,type SpatialEvent} from '../src/spatial/HudBridge'
import {EXPLORE_SNAPSHOT_KEY,LEGACY_COLLECTION_KEY,SPATIAL_SESSION_KEY,clearSpatialSession,type KeyStore} from '../src/spatial/clear'

const memory=():KeyStore=>{
  const store=new Map<string,string>()
  return {
    getItem:key=>store.get(key)??null,
    setItem:(key,value)=>{store.set(key,value)},
    removeItem:key=>{store.delete(key)},
  }
}

describe('spatial session',()=>{
 it('clears agreed visit keys and reports exactly what existed',()=>{
  const localStorage=memory(),sessionStorage=memory()
  sessionStorage.setItem(SPATIAL_SESSION_KEY,'{}')
  sessionStorage.setItem(EXPLORE_SNAPSHOT_KEY,'{}')
  sessionStorage.setItem('curio.media.operator','owner-token')
  localStorage.setItem(LEGACY_COLLECTION_KEY,'[]')
  localStorage.setItem('unrelated','keep')
  const {removed}=clearSpatialSession({localStorage,sessionStorage})
  expect(removed).toEqual([SPATIAL_SESSION_KEY,EXPLORE_SNAPSHOT_KEY,LEGACY_COLLECTION_KEY])
  expect(sessionStorage.getItem(SPATIAL_SESSION_KEY)).toBeNull()
  expect(localStorage.getItem(LEGACY_COLLECTION_KEY)).toBeNull()
  expect(sessionStorage.getItem('curio.media.operator')).toBe('owner-token')
  expect(localStorage.getItem('unrelated')).toBe('keep')
 })
 it('reports an empty clear honestly',()=>{
  const {removed}=clearSpatialSession({localStorage:memory(),sessionStorage:memory()})
  expect(removed).toEqual([])
 })
 it('bridges scene events to HUD listeners with unsubscribe',()=>{
  const bridge=new HudBridge()
  const seen: SpatialEvent[]=[]
  const unsub=bridge.on(event=>{seen.push(event)})
  bridge.emit({type:'prompt',prompt:'chairs'})
  bridge.emit({type:'arrive',index:2})
  unsub()
  bridge.emit({type:'pick',assetId:'x'})
  expect(seen).toEqual([{type:'prompt',prompt:'chairs'},{type:'arrive',index:2}])
  const spy=vi.fn()
  bridge.on(spy)
  bridge.emit({type:'clear',removed:[]})
  expect(spy).toHaveBeenCalledTimes(1)
 })
})
