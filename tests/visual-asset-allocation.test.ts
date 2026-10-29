import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'
import {demoMedia} from '../src/editorial-demo-media'

const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const manifest=JSON.parse(readFileSync(join(root,'docs/DISCOVER_ASSET_ALLOCATION.json'),'utf8')) as Array<{id:string;filename:string;stage:string;sha256:string;width:number;height:number}>
const folders:Record<string,string>={'Discover':'discover','Generate':'generate','Read & Explore':'read','Curiosity Journey':'journey','Collect':'collect'}

describe('owner editorial image allocation',()=>{
 it('keeps every approved source unique, byte-identical and assigned to one stage',()=>{
  expect(manifest).toHaveLength(26)
  expect(new Set(manifest.map(item=>item.id)).size).toBe(26)
  expect(new Set(manifest.map(item=>item.filename)).size).toBe(26)
  expect(new Set(manifest.map(item=>item.sha256)).size).toBe(26)
  expect(Object.fromEntries(Object.keys(folders).map(stage=>[stage,manifest.filter(item=>item.stage===stage).length]))).toEqual({'Discover':5,'Generate':5,'Read & Explore':5,'Curiosity Journey':6,'Collect':5})
  for(const item of manifest){
   const folder=folders[item.stage];expect(folder).toBeDefined()
   const bytes=readFileSync(join(root,'public/editorial',folder,item.filename))
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
   expect(bytes.readUInt32BE(16)).toBe(item.width)
   expect(bytes.readUInt32BE(20)).toBe(item.height)
  }
 })
 it('maps each approved source to exactly one versioned stage record and coded media path',()=>{
  const source=readFileSync(join(root,'src/DiscoverPreview.tsx'),'utf8')+readFileSync(join(root,'src/VisualStages.tsx'),'utf8')
  for(const item of manifest){
   const records=demoMedia.filter(record=>record.id===item.id)
   expect(records).toHaveLength(1)
   expect(records[0].stage).toBe(item.stage)
   expect(records[0].assetId).toBe(`${item.id}-v1`)
   expect(records[0].path).toBe(`/editorial/${folders[item.stage]}/${item.filename}`)
   if(item.stage==='Discover')expect(source).toContain(item.filename)
   if(item.stage!=='Discover'&&item.stage!=='Read & Explore')expect(source).toContain(`${folders[item.stage]}/${item.filename}`)
  }
 })
})
