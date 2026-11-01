import {expect,it} from 'vitest'
import {loadEditorialSources} from '../worker/editorial-sources'

const versionId=`version-${'a'.repeat(64)}`
const row=(product_name:string)=>({version_id:versionId,brand_name:'Northline',brand_story:'A fictional design studio.',brand_description:'',country:null,product_name,product_description:'A fictional object.',category:'objects',materials_json:'[]',price_minor:null,currency:null,campaign_name:null,campaign_description:null})
const database=(rows:unknown[])=>({prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}) as unknown as D1Database

it('retains a single consistent owner-supplied product source',async()=>{
 const sources=await loadEditorialSources(database([row('Arc Chair')]),[versionId])
 expect(sources.find(source=>source.kind==='product_name')?.value).toBe('Arc Chair')
})
it('excludes a version with conflicting product links instead of selecting the last row',async()=>{
 expect(await loadEditorialSources(database([row('Arc Chair'),row('Loop Lamp')]),[versionId])).toEqual([])
})
