import { expect,it } from 'vitest'
import { groupObjects } from '../shared/object-groups'
import { authoredDemo } from '../shared/decoder'
import { catalog } from '../shared/catalog'
const demo = authoredDemo(catalog[0])!
const box = (id:string,x:number,y:number,width:number,height:number) => ({...demo.regions[0], id,box:{x,y,width,height}})
it('preserves overlapping distinct objects, duplicates raw input and ordering invariance',()=>{
  const a=box('sam-1',.15,.4,.3,.4),b=box('sam-2',.2,.4,.3,.4)
  const r={...demo,regions:[a,b]}
  expect(groupObjects(r).objects).toHaveLength(2)
  const groups=groupObjects({...r,regions:[a,{...a,id:'sam-3'}]}, {'sam-1':{objectKey:'armchair'},'sam-3':{objectKey:'sofa'}})
  expect(groups.objects).toHaveLength(2)
  expect(groups.raw).toEqual([a,{...a,id:'sam-3'}])
  expect(groupObjects(r)).toEqual({...groupObjects({...r,regions:[b,a]}),raw:r.regions})
})
it('flags near duplicates without forcing a merge; neither overlap nor adjacency implies identity',()=>{
  const a=box('a',.1,.1,.3,.3), b=box('b',.101,.1,.3,.3), c=box('c',.4,.1,.3,.3)
  expect(groupObjects({...demo,regions:[a,b,c]}).objects.map(o=>o.memberIds)).toEqual([['a'],['b'],['c']])
  expect(groupObjects({...demo,regions:[a,b,c]}).possibleDuplicates).toEqual([['a','b']])
})
it('groups reviewed adjacent fragments, prevents bridge chains and supports suppression',()=>{
  const regions=[box('a',0,.1,.2,.2),box('b',.21,.1,.2,.2),box('c',.42,.1,.2,.2)]
  const hints={a:{objectKey:'foreground-sofa'},b:{objectKey:'foreground-sofa'},c:{objectKey:'foreground-sofa'}}
  expect(groupObjects({...demo,regions},hints).objects.map(o=>o.memberIds)).toEqual([['a','b'],['c']])
  const suppressed=groupObjects({...demo,regions},{...hints,c:{suppress:true}})
  expect(suppressed.suppressedIds).toEqual(['c']);expect(suppressed.raw).toHaveLength(3)
  expect(groupObjects({...demo,regions:[]}).objects).toEqual([])
})
it('handles a seven-box SYNTHETIC seating scenario without claiming it reconstructs the private Norm capture',()=>{
 const regions=[box('sam-1',.8,.5,.15,.25),box('sam-2',.3,.7,.3,.2),box('sam-3',.35,.7,.3,.2),box('sam-4',.02,.5,.25,.3),box('sam-5',.4,.72,.25,.2),box('sam-6',.45,.7,.2,.2),box('sam-7',.65,.55,.2,.2)]
 const hints=Object.fromEntries(['sam-2','sam-3','sam-5','sam-6'].map(id=>[id,{objectKey:'reviewed-foreground'}]))
 const grouped=groupObjects({...demo,regions},{...hints,'sam-1':{objectKey:'reviewed-armchair'},'sam-4':{objectKey:'reviewed-left-sofa'},'sam-7':{suppress:true}})
 expect(grouped.objects.map(o=>o.memberIds)).toEqual([['sam-1'],['sam-2','sam-3','sam-5','sam-6'],['sam-4']])
 expect(grouped.raw).toHaveLength(7)
 expect(grouped.suppressedIds).toEqual(['sam-7'])
 expect(grouped.objects[1].confidence).toBeNull()
})
