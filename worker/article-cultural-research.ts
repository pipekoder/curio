import {z} from 'zod'
import {boundedText} from './meta'
import {CULTURAL_EVIDENCE_VERSION,validateCulturalEvidence} from '../shared/cultural-evidence'

export const articlePlan=z.strictObject({
  topic:z.string().trim().min(4).max(120),
  angle:z.string().trim().min(8).max(240),
  argument:z.string().trim().min(12).max(320),
  selectedAssetIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(2).max(3),
  researchQuestions:z.array(z.strictObject({question:z.string().trim().min(12).max(160),why:z.string().trim().min(12).max(200),query:z.string().trim().min(3).max(100),complex:z.boolean()})).max(2),
})
export type ArticlePlan=z.infer<typeof articlePlan>
export type ResearchFinding={id:string;title:string;institution:string;url:string;passage:string;assetId:string;retrievedAt:string;status:'automatically_eligible'}
export type ResearchOutcome={status:'sufficient'|'insufficient'|'unavailable'|'unnecessary';findings:ResearchFinding[];examined:number}

const allowed=new Set(['https://en.wikipedia.org','https://collectionapi.metmuseum.org','https://api.vam.ac.uk'])
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
const words=(value:string)=>new Set(value.toLowerCase().match(/[a-z]{4,}/g)??[])
const prohibited=/\b(brand ownership|licensing|copyright|stock|availability|product specification|brand history|collaboration)\b/i
const json=async(url:string,signal:AbortSignal,fetcher:typeof fetch)=>{
  if(!allowed.has(new URL(url).origin))throw Error('Research origin unavailable')
  const response=await fetcher(url,{redirect:'manual',signal,headers:{Accept:'application/json'}})
  if(!response.ok||response.redirected||Number(response.headers.get('content-length')??0)>65536)throw Error('Research source unavailable')
  return JSON.parse(await boundedText(response.body,65536)) as unknown
}
const candidate=z.strictObject({title:z.string().min(3).max(160),institution:z.string().max(80),url:z.url(),passage:z.string().min(30).max(240)})
type Candidate=z.infer<typeof candidate>
function directSupport(question:string,passage:string){
  const terms=[...words(question)].filter(word=>!['what','when','where','which','does','about','meaning','history'].includes(word))
  const text=passage.toLowerCase()
  // Search relevance alone is not evidence: require several specific question
  // terms in the actual retrieved passage before offering it to the editor.
  return terms.length>=2&&terms.filter(term=>text.includes(term)).length>=Math.min(3,terms.length)&&passage.length>=40
}

// Fixed official search APIs supply URLs; the planner never supplies a URL.
async function* search(question:string,configured:Set<string>,signal:AbortSignal,fetcher:typeof fetch):AsyncGenerator<Candidate>{
  const query=encodeURIComponent(question)
  const wiki=configured.has('https://en.wikipedia.org')?await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=2&format=json`,signal,fetcher).catch(()=>null) as {query?:{search?:{title?:string}[]}}|null:null
  for(const hit of wiki?.query?.search??[]){
    if(typeof hit.title!=='string')continue
    const title=hit.title.slice(0,160)
    const page=await json(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&exintro=1&titles=${encodeURIComponent(title)}&format=json`,signal,fetcher).catch(()=>null) as {query?:{pages?:Record<string,{title?:string;fullurl?:string;extract?:string}>}}|null
    const record=Object.values(page?.query?.pages??{})[0]
    const extract=record?.extract??''
    const passage=extract.split(/(?<=[.!?])\s+/).find(sentence=>sentence.length<=240&&directSupport(question,sentence))
    if(passage&&record?.fullurl&&new URL(record.fullurl).origin==='https://en.wikipedia.org')yield {title:record.title??title,institution:'Wikipedia',url:record.fullurl,passage}
  }
  const met=configured.has('https://collectionapi.metmuseum.org')?await json(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${query}&hasImages=true`,signal,fetcher).catch(()=>null) as {objectIDs?:number[]}|null:null
  for(const id of (met?.objectIDs??[]).slice(0,2)){
    if(!Number.isInteger(id))continue
    const object=await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,signal,fetcher).catch(()=>null) as {title?:string;objectURL?:string;objectDate?:string;culture?:string;medium?:string}|null
    if(!object?.title||!object.objectURL)continue
    const passage=`${object.title}. ${[object.objectDate,object.culture,object.medium].filter(Boolean).join('. ')}.`
    if(passage.length<=240&&directSupport(question,passage))yield {title:object.title.slice(0,160),institution:'The Metropolitan Museum of Art',url:object.objectURL,passage}
  }
  const va=configured.has('https://api.vam.ac.uk')?await json(`https://api.vam.ac.uk/v2/objects/search?q=${query}&page_size=1`,signal,fetcher).catch(()=>null) as {records?:{systemNumber?:string;_primaryTitle?:string;_primaryDate?:string;_primaryPlace?:string}[]}|null:null
  for(const row of va?.records??[]){
    if(!row.systemNumber||!row._primaryTitle)continue
    const passage=`${row._primaryTitle}. ${[row._primaryDate,row._primaryPlace].filter(Boolean).join('. ')}.`
    if(passage.length<=240&&directSupport(question,passage))yield {title:row._primaryTitle.slice(0,160),institution:'Victoria and Albert Museum',url:`https://collections.vam.ac.uk/item/${encodeURIComponent(row.systemNumber)}/`,passage}
  }
}

export async function researchForArticle(plan:ArticlePlan,originList:string|undefined,fetcher:typeof fetch=fetch,timeoutMs=15000,brandNames:readonly string[]=[]):Promise<ResearchOutcome>{
  if(!plan.researchQuestions.length)return {status:'unnecessary',findings:[],examined:0}
  const configured=new Set((originList??'').split(',').map(value=>value.trim()).filter(Boolean))
  if(![...allowed].some(origin=>configured.has(origin)))return {status:'unavailable',findings:[],examined:0}
  const signal=AbortSignal.timeout(timeoutMs),findings:ResearchFinding[]=[],seen=new Set<string>()
  let examined=0,allAnswered=true
  try{
    for(const question of plan.researchQuestions){
      if(prohibited.test(question.question)||prohibited.test(question.query)||brandNames.some(name=>name.length>=4&&[question.question,question.query].some(text=>text.toLowerCase().includes(name.toLowerCase())))){allAnswered=false;continue}
      let answered=0
      const institutions=new Set<string>()
      let examinedForQuestion=0
      for await(const source of search(question.query,configured,signal,fetcher)){
        if(examinedForQuestion>=5||findings.length>=3)break
        examined++
        examinedForQuestion++
        const parsed=candidate.safeParse(source)
        if(!parsed.success||!directSupport(question.question,source.passage)||!['https://en.wikipedia.org','https://www.metmuseum.org','https://collections.vam.ac.uk'].includes(new URL(source.url).origin))continue
        const fingerprint=await hash(source.url+':'+source.passage)
        const id=`research:${fingerprint.slice(0,32)}`
        if(seen.has(id))continue
        const passageId=`passage:${fingerprint.slice(0,32)}`
        // Reuse the existing cultural evidence identity, passage and asset
        // validator as a candidate. Only this fixed-source, short-passage
        // path can become automatically eligible; no operator approval is
        // forged in the stored evidence model.
        try{validateCulturalEvidence({version:CULTURAL_EVIDENCE_VERSION,id:`auto-research:${fingerprint.slice(0,32)}`,createdAt:new Date().toISOString(),assetVersionIds:[plan.selectedAssetIds[0]],sourceIds:[id],sources:[{id,canonicalUrl:source.url,origin:new URL(source.url).origin,retrievedAt:new Date().toISOString(),sha256:fingerprint,author:null,publication:source.institution,publishedAt:null,rights:'pending',verification:'pending'}],passages:[{id:passageId,sourceId:id,text:source.passage,documentSha256:fingerprint,start:0,end:source.passage.length}],claims:[{id:`claim:${fingerprint.slice(0,32)}`,text:source.passage,kind:'factual',assetVersionIds:[plan.selectedAssetIds[0]],passageIds:[passageId],status:'pending',conflict:null}],relationships:[],reviewRevision:0,reviewHistory:[],status:'candidate'},plan.selectedAssetIds)}catch{continue}
        seen.add(id)
        if(question.complex&&institutions.has(source.institution))continue
        findings.push({...source,id,assetId:plan.selectedAssetIds[0],retrievedAt:new Date().toISOString(),status:'automatically_eligible'})
        institutions.add(source.institution)
        answered++
        if(!question.complex||answered>=2)break
      }
      if(answered<(question.complex?2:1))allAnswered=false
      if(findings.length>=3)break
    }
    return {status:allAnswered?'sufficient':'insufficient',findings,examined}
  }catch{return {status:'unavailable',findings:[],examined}}
}
