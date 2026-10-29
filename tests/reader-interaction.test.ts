import {describe,expect,it} from 'vitest'
import {initialReaderInteraction,readerInteraction} from '../src/reader-interaction'

describe('Reader interaction transitions',()=>{
 it('reveals details only after Explore and restores the spread on close',()=>{
  expect(readerInteraction(initialReaderInteraction,{type:'toggleDetail'})).toEqual(initialReaderInteraction)
  const explore=readerInteraction(initialReaderInteraction,{type:'toggleExplore'})
  const detail=readerInteraction(explore,{type:'toggleDetail'})
  expect(detail).toEqual({featureIndex:0,exploring:true,detailOpen:true})
  expect(readerInteraction(detail,{type:'closeDetail'})).toEqual(explore)
  expect(readerInteraction(detail,{type:'toggleExplore'})).toEqual(initialReaderInteraction)
 })
 it('keeps the selected feature independent of object selection',()=>{
  const page=readerInteraction(initialReaderInteraction,{type:'changeFeature',index:1})
  const explore=readerInteraction(page,{type:'toggleExplore'})
  const detail=readerInteraction(explore,{type:'toggleDetail'})
  expect(readerInteraction(detail,{type:'closeDetail'}).featureIndex).toBe(1)
  expect(readerInteraction(detail,{type:'changeFeature',index:0})).toEqual(initialReaderInteraction)
 })
})
