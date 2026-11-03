// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import type {ArticleEditionBody} from '../shared/editorial-articles'
import {EDITORIAL_STANDARD_VERSION,editorialDimensions} from '../shared/editorial-standard'
import {reviseArticleWithConfirmation} from '../worker/editorial-articles'
const version=(n:number)=>`version-${n.toString(16).padStart(64,'0')}`
const items=Array.from({length:6},(_,i)=>({id:`catalog-${i}`,image:{id:version(i+1)}})) as CatalogItem[]
const sources=items.map(item=>({id:`${item.image.id}:brand_name`,assetId:item.image.id,kind:'brand_name',label:'Brand name',value:'Owner Studio',authority:'owner_supplied_mockup',source:'content_studio'})) as EditorialSource[]
const contexts=items.map(item=>({assetId:item.image.id,versionId:item.image.id,imageSha256:'a'.repeat(64),source:'meta_image_observation',model:'muse-spark-1.3',observations:{subjects:['seating'],materialAppearance:[],environments:[],relationships:[]},uncertainty:'appearance_not_verified_fact'})) as VisualContext[]
const edition:ArticleEditionBody={version:'curio-editorial-articles-v1',title:'An Edition',deck:'Three related studies.',articles:Array.from({length:3},(_,index)=>({id:`article-${version(index*2+1)}`,heroAssetId:version(index*2+1),headline:`Story ${index+1}`,deck:'A related study.',narrative:'An owner-grounded narrative.',images:items.slice(index*2,index*2+2).map(item=>({catalogId:item.id,assetId:item.image.id,brandName:'Owner Studio',brandSourceId:`${item.image.id}:brand_name`,productSourceIds:[]})),sourceIds:sources.slice(index*2,index*2+2).map(source=>source.id)}))}
const review=(value:ArticleEditionBody,high=false)=>({rubricVersion:EDITORIAL_STANDARD_VERSION,dimensions:Object.fromEntries(editorialDimensions.map(key=>[key,{score:5,reason:'Supported and coherent.',evidenceRefs:[]}])),magazineFeedback:'The article reads well.',featureFeedback:value.articles.map((article,i)=>({assetId:article.heroAssetId,strengths:[],issues:high&&i===0?[{severity:'high',code:'fact_integrity',evidenceRefs:[],instruction:'Unsupported fact.'}]:[]})),revisionInstructions:[]})
const env={META_API_KEY:'mock-only',META_SPARK_MODEL:'muse-spark-1.3',EDITORIAL_FEEDBACK_ENABLED:'false'} as never
afterEach(()=>vi.unstubAllGlobals())
it('changes only the selected article and requires independent confirmation',async()=>{
 const calls:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls.push(body.response_format.json_schema.name);const output=calls.length===1?{...input.edition,articles:input.edition.articles.map((article:{id:string},i:number)=>i===0?{...article,narrative:'A focused revision.'}:article)}:review(input.edition);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})}))
 const result=await reviseArticleWithConfirmation(env,edition,edition.articles[0].id,{id:'feedback',text:'Sharpen the opening.',categories:[]},items,sources,contexts)
 expect(result.article.narrative).toBe('A focused revision.')
 expect(calls).toEqual(['curio_owner_article_revision_v1','curio_owner_article_confirmation_v1'])
})
it('rejects edits to unrelated stories and severe independent confirmation findings',async()=>{
 for(const change of ['other_story','high_review']){
  let calls=0
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body)),input=JSON.parse(body.messages[1].content);calls++;const output=calls===1?{...input.edition,articles:input.edition.articles.map((article:{id:string},i:number)=>i===1&&change==='other_story'?{...article,narrative:'Changed another article.'}:i===0?{...article,narrative:'Changed the target.'}:article)}:review(input.edition,true);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})}))
  await expect(reviseArticleWithConfirmation(env,edition,edition.articles[0].id,{id:'feedback',text:'Sharpen.',categories:[]},items,sources,contexts)).rejects.toThrow()
  expect(calls).toBe(change==='other_story'?1:2)
 }
})
