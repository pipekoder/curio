// @vitest-environment node
import {expect,it,vi} from 'vitest'
import {articlePlan,researchForArticle} from '../worker/article-cultural-research'
import {researchReferencesCurrent} from '../worker/editorial-articles'

const id=(n:number)=>`version-${n.toString(16).padStart(64,'0')}`
const origins='https://en.wikipedia.org,https://collectionapi.metmuseum.org,https://api.vam.ac.uk'
const plan=articlePlan.parse({topic:'The everyday chair',angle:'How useful objects shape domestic rituals',argument:'A chair can become an anchor for ordinary reflection.',selectedAssetIds:[id(1),id(2)],researchQuestions:[]})

it('skips external research when the Chief Editor asks no question',async()=>{
 const fetcher=vi.fn()
 expect(await researchForArticle(plan,origins,fetcher as never)).toEqual({status:'unnecessary',findings:[],examined:0})
 expect(fetcher).not.toHaveBeenCalled()
})

it('retrieves a real-URL Wikipedia passage and stops after direct support',async()=>{
 const fetcher=vi.fn(async(url:string)=>{
  if(url.includes('list=search'))return Response.json({query:{search:[{title:'Bauhaus'}]}})
  if(url.includes('prop=extracts'))return Response.json({query:{pages:{'1':{title:'Bauhaus',fullurl:'https://en.wikipedia.org/wiki/Bauhaus',extract:'Bauhaus was a German art school that combined crafts and the fine arts. The school operated between 1919 and 1933.'}}}})
  return Response.json({objectIDs:[]})
 })
 const result=await researchForArticle({...plan,researchQuestions:[{question:'How did Bauhaus combine crafts and fine arts?',why:'It explains the editorial comparison.',query:'Bauhaus crafts fine arts',complex:false,assetId:id(1)}]},origins,fetcher as never)
 expect(result.status).toBe('sufficient')
 expect(result.findings).toMatchObject([{institution:'Wikipedia',url:'https://en.wikipedia.org/wiki/Bauhaus',assetId:id(1),status:'automatically_eligible'}])
 expect(result.findings[0].passage).toContain('combined crafts and the fine arts')
 expect(result.examined).toBe(1)
 expect(fetcher).toHaveBeenCalledTimes(2)
})

it('does not make unrelated or unavailable material automatically eligible',async()=>{
 const fetcher=vi.fn(async(url:string)=>url.includes('list=search')?Response.json({query:{search:[{title:'Bauhaus'}]}}):url.includes('prop=extracts')?Response.json({query:{pages:{'1':{title:'Bauhaus',fullurl:'https://en.wikipedia.org/wiki/Bauhaus',extract:'This page discusses unrelated photography and travel.'}}}}):Response.json({objectIDs:[]}))
 const question={question:'How did Bauhaus combine crafts and fine arts?',why:'It explains the editorial comparison.',query:'Bauhaus crafts fine arts',complex:false,assetId:id(1)}
 expect((await researchForArticle({...plan,researchQuestions:[question]},origins,fetcher as never)).findings).toEqual([])
 expect(await researchForArticle({...plan,researchQuestions:[question]},undefined,fetcher as never)).toEqual({status:'unavailable',findings:[],examined:0})
 expect((await researchForArticle({...plan,researchQuestions:[{...question,question:'Who owns this brand copyright?'}]},origins,fetcher as never)).findings).toEqual([])
 expect((await researchForArticle({...plan,researchQuestions:[{...question,question:'Did Stillform take its design from Bauhaus?'}]},origins,fetcher as never,15000,['Stillform'])).findings).toEqual([])
})

it('invalidates saved research when its allowlist or freshness expires',()=>{
 const now=Date.parse('2026-11-03T10:00:00Z')
 const reference={source:'cultural_research',retrievedAt:'2026-11-03T09:30:00Z',citations:[{url:'https://en.wikipedia.org/wiki/Bauhaus'}]}
 expect(researchReferencesCurrent([reference] as never,origins,now)).toBe(true)
 expect(researchReferencesCurrent([reference] as never,'https://collectionapi.metmuseum.org',now)).toBe(false)
 expect(researchReferencesCurrent([reference] as never,origins,now+3_600_000)).toBe(false)
})
it('binds each finding to its question asset',async()=>{
 const fetcher=vi.fn(async(url:string)=>{
  if(url.includes('list=search'))return Response.json({query:{search:[{title:url.includes('Fika')?'Fika':'Bauhaus'}]}})
  if(url.includes('prop=extracts')){
    if(url.includes('Fika'))return Response.json({query:{pages:{'1':{title:'Fika',fullurl:'https://en.wikipedia.org/wiki/Fika',extract:'Fika is a Swedish coffee break ritual combining coffee and conversation.'}}}})
    return Response.json({query:{pages:{'1':{title:'Bauhaus',fullurl:'https://en.wikipedia.org/wiki/Bauhaus',extract:'Bauhaus was a German art school that combined crafts and the fine arts.'}}}})
  }
  return Response.json({objectIDs:[]})
 })
 const result=await researchForArticle({...plan,researchQuestions:[
  {question:'How did Bauhaus combine crafts and fine arts?',why:'It explains the editorial comparison.',query:'Bauhaus crafts fine arts',complex:false,assetId:id(1)},
  {question:'What Swedish coffee ritual is Fika?',why:'A second comparison for another article.',query:'Fika Swedish coffee ritual',complex:false,assetId:id(2)}]},origins,fetcher as never)
 expect(result.status).toBe('sufficient')
 expect(result.findings.map(finding=>finding.assetId)).toEqual([id(1),id(2)])
 expect(result.findings.map(finding=>finding.title)).toEqual(['Bauhaus','Fika'])
})
it('skips questions bound outside the selected assets',async()=>{
 const fetcher=vi.fn(async()=>Response.json({query:{search:[{title:'Bauhaus'}]}}))
 const result=await researchForArticle({...plan,researchQuestions:[{question:'How did Bauhaus combine crafts and fine arts?',why:'It explains the editorial comparison.',query:'Bauhaus crafts fine arts',complex:false,assetId:id(9)}]},origins,fetcher as never)
 expect(result.status).toBe('insufficient')
 expect(result.findings).toEqual([])
 expect(fetcher).not.toHaveBeenCalled()
})
