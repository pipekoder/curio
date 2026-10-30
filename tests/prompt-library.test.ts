import {describe,expect,it} from 'vitest'
import {cleanSlotValue,composeLibraryPrompt,defaultSlotValues,promptTemplates} from '../src/prompt-library'
import {editorialPrompt,interpretEditorialPrompt} from '../shared/editorial-intent'

describe('curated prompt library',()=>{
 it('provides five distinct complete discovery sentences through the existing validated prompt contract',()=>{
  expect(promptTemplates).toHaveLength(5)
  expect(new Set(promptTemplates.map(template=>template.id)).size).toBe(5)
  for(const template of promptTemplates){
   expect(template.parts).toHaveLength(template.slots.length+1)
   const prompt=composeLibraryPrompt(template,defaultSlotValues(template))
   expect(editorialPrompt.safeParse({prompt,consent:false}).success).toBe(true)
   expect(()=>interpretEditorialPrompt({prompt,consent:false})).not.toThrow()
  }
 })
 it('composes selected and custom words deterministically without control characters',()=>{
  const template=promptTemplates[0]
  const values={...defaultSlotValues(template),subject:' ceramic\n studios  ',place:'Tokyo'}
  expect(composeLibraryPrompt(template,values)).toBe('Introduce me to ceramic studios in Tokyo with an emphasis on original design.')
  expect(cleanSlotValue('  light\t and\n space  ')).toBe('light and space')
 })
 it('keeps surprise directions tied to known slots and within prompt limits',()=>{
  for(const template of promptTemplates)for(const suggestion of template.surprise){
   expect(template.slots.some(slot=>slot.id===suggestion.slot)).toBe(true)
   const prompt=composeLibraryPrompt(template,{...defaultSlotValues(template),[suggestion.slot]:suggestion.value})
   expect(editorialPrompt.safeParse({prompt,consent:false}).success).toBe(true)
  }
 })
})
