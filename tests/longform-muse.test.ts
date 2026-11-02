import {expect,it,vi} from 'vitest'
import {longformMuseModel} from '../worker/longform-muse'
import type {LongformInput} from '../worker/longform-editorial'

const version=`version-${'a'.repeat(64)}`
const input:LongformInput={prompt:'Explore the design of daily rituals',voice:'Editorial',knowledgeVersion:'v3',sources:Array.from({length:4},(_,index)=>({id:`source-${index}`,kind:'brand_product',assetVersionId:version,text:`Owner-provided mockup fact ${index}`,verified:true,rightsApproved:true,digest:'b'.repeat(64)}))}
it('uses one bounded Muse call for a private outline with no autonomous retries',async()=>{
  const outline={title:'Four Ideas About Everyday Rituals',thesis:'A distinct set of grounded questions about objects and their roles in everyday life.',sections:Array.from({length:4},(_,i)=>({id:`section-${i+1}`,heading:`Distinct editorial theme ${i+1}`,purpose:`Explore a separate grounded theme for this editorial section ${i+1}.`,sourceIds:[`source-${i}`]}))}
  const fetcher=vi.fn(async(_url:unknown,init:RequestInit)=>{const payload=JSON.parse(String(init.body));expect(payload.model).toBe('muse-spark-1.3');expect(payload.stream).toBe(false);expect(payload.response_format.type).toBe('json_schema');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(outline)}}]}))})
  expect(await longformMuseModel('test-key',fetcher as typeof fetch).outline(input)).toEqual(outline)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('fails closed on provider failure without retrying',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:429}))
  await expect(longformMuseModel('test-key',fetcher as typeof fetch).outline(input)).rejects.toThrow('Long-form model unavailable; no automatic retry')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
