import {expect,it} from 'vitest'
import {SPATIAL_SESSION_KEY} from '../src/spatial/clear'
import {loadExplorationSession,markExplorationOutcome,saveExplorationSession} from '../src/spatial/exploration-session'

const store=()=>{
  const data=new Map<string,string>()
  return {
    getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value)},
    raw:()=>data.get(SPATIAL_SESSION_KEY),
  }
}
const id='123e4567-e89b-42d3-a456-426614174000'

it('round-trips an unfinished exploration for refresh-resume',()=>{
  const storage=store()
  saveExplorationSession(storage,{version:1,prompt:'Quiet Nordic interiors',startedAt:1700000000000,explorationId:id,mode:'lite',format:'articles'})
  expect(loadExplorationSession(storage)).toEqual({version:1,prompt:'Quiet Nordic interiors',startedAt:1700000000000,explorationId:id,mode:'lite',format:'articles'})
})

it('loads legacy records without an exploration identity',()=>{
  const storage=store()
  saveExplorationSession(storage,{version:1,prompt:'Quiet rooms',startedAt:1700000000000})
  expect(loadExplorationSession(storage)).toEqual({version:1,prompt:'Quiet rooms',startedAt:1700000000000})
})

it('rejects corrupt, foreign or malformed records',()=>{
  const storage=store()
  expect(loadExplorationSession(storage)).toBeNull()
  storage.setItem(SPATIAL_SESSION_KEY,'not json')
  expect(loadExplorationSession(storage)).toBeNull()
  storage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:2,prompt:'x',startedAt:1}))
  expect(loadExplorationSession(storage)).toBeNull()
  storage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:1,prompt:'x',startedAt:1,explorationId:'junk'}))
  expect(loadExplorationSession(storage)).toBeNull()
  storage.setItem(SPATIAL_SESSION_KEY,JSON.stringify({version:1,prompt:'',startedAt:1}))
  expect(loadExplorationSession(storage)).toBeNull()
})

it('marks the outcome only for the exploration that owns the record',()=>{
  const storage=store()
  saveExplorationSession(storage,{version:1,prompt:'Quiet rooms',startedAt:1,explorationId:id})
  markExplorationOutcome(storage,'00000000-0000-4000-8000-000000000000','completed')
  expect(loadExplorationSession(storage)).not.toHaveProperty('outcome')
  markExplorationOutcome(storage,id,'completed')
  expect(loadExplorationSession(storage)).toMatchObject({explorationId:id,outcome:'completed'})
})
