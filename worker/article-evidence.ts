import type {Bindings} from './index'
import type {ArticlePool} from './editorial-article-pool'
import type {EditorialPreferences} from '../shared/editorial'
import {ARTICLE_EVIDENCE_VERSION,ARTICLE_INTERPRETATION_VERSION,articleEvidencePack,type ArticleInterpretation} from '../shared/article-evidence'
import {catalogDigest} from './catalog-store'

const topics=[['craft',/\b(craft|maker|handmade|making)\b/i],['ritual',/\b(ritual|everyday|daily|routine)\b/i],['culture',/\b(cultur|heritage|histor|tradition)\b/i],['movement',/\b(travel|journey|movement|walking)\b/i],['material',/\b(material|textile|fabric|surface)\b/i],['space',/\b(space|room|interior|architecture)\b/i],['light',/\b(light|shadow|illumination)\b/i],['design',/\b(design|object|furniture|fashion)\b/i]] as const
const topicFor=(prompt:string)=>topics.find(([,test])=>test.test(prompt))?.[0]??'design'
const questionFor=(topic:string,product:string,subject:string)=>`How might ${product} and the observed ${subject} invite a question about ${topic}?`.slice(0,240)

// No model call: this is a bounded editorial question, never a new factual
// assertion. Original owner facts and exact-version observations remain separate.
export async function articleEvidenceForPrompt(env:Bindings,p:EditorialPreferences,pool:ArticlePool){
  if(!env.CATALOG_DB)throw Error('Evidence storage unavailable')
  // A bounded topic represents the reusable interpretation intent. Different
  // prompts in the same topic reuse evidence; other topics coexist by ID.
  const topic=topicFor(p.interests),intentDigest=await catalogDigest(topic)
  const candidates=pool.items.slice(0,24)
  const drafts:ArticleInterpretation[]=[]
  for(const item of candidates){
    const context=pool.visualContexts.find(row=>row.assetId===item.image.id)
    const sources=pool.sources.filter(source=>source.assetId===item.image.id&&source.source==='content_studio').slice(0,12)
    if(!context?.imageSha256||!sources.some(source=>source.kind==='brand_name')||!sources.some(source=>source.kind==='product_description'))continue
    const sourceDigest=await catalogDigest(JSON.stringify(sources)),observationDigest=await catalogDigest(JSON.stringify(context))
    const id=`interpretation-${await catalogDigest(JSON.stringify([item.image.id,context.imageSha256,intentDigest,sourceDigest,observationDigest,ARTICLE_INTERPRETATION_VERSION]))}`
    const product=sources.find(source=>source.kind==='product_name')?.value?.slice(0,72)??'this owner-described product'
    const subject=context.observations.subjects[0]?.slice(0,48)??'image composition'
    drafts.push({id,assetVersionId:item.image.id,imageSha256:context.imageSha256,intentDigest,sourceDigest,observationDigest,
      profileVersion:ARTICLE_INTERPRETATION_VERSION,origin:'deterministic',status:'editorial_perspective',topic,
      focusQuestion:questionFor(topic,product,subject),sourceIds:sources.map(source=>source.id)})
  }
  if(!drafts.length)return articleEvidencePack.parse({version:ARTICLE_EVIDENCE_VERSION,interpretations:[]})
  const ids=drafts.map(row=>row.id)
  const rows=(await env.CATALOG_DB.prepare(`SELECT id,asset_version,image_sha256,intent_digest,source_digest,observation_digest,profile_version,topic,focus_question,source_ids_json FROM article_interpretations WHERE id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string,unknown>>()).results
  const existing=new Map(rows.map(row=>[String(row.id),row]))
  const missing=drafts.filter(row=>!existing.has(row.id))
  if(missing.length){
    // D1 allows at most 100 bound variables per statement with 11 per row,
    // so a full prompt stages its interpretations in bounded batches.
    for(let i=0;i<missing.length;i+=9){
      const batch=missing.slice(i,i+9)
      const values=batch.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(',')
      await env.CATALOG_DB.prepare(`INSERT INTO article_interpretations(id,asset_version,image_sha256,intent_digest,source_digest,observation_digest,profile_version,topic,focus_question,source_ids_json,created_at) VALUES ${values} ON CONFLICT(id) DO NOTHING`)
        .bind(...batch.flatMap(row=>[row.id,row.assetVersionId,row.imageSha256,row.intentDigest,row.sourceDigest,row.observationDigest,row.profileVersion,row.topic,row.focusQuestion,JSON.stringify(row.sourceIds),Date.now()])).run()
    }
  }
  // Re-query persisted rows and accept only exact current evidence digests.
  const saved=(await env.CATALOG_DB.prepare(`SELECT id,asset_version,image_sha256,intent_digest,source_digest,observation_digest,profile_version,topic,focus_question,source_ids_json FROM article_interpretations WHERE id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string,unknown>>()).results
  const byId=new Map(saved.map(row=>[String(row.id),row]))
  const interpretations=drafts.flatMap(draft=>{
    const row=byId.get(draft.id)
    if(!row||row.asset_version!==draft.assetVersionId||row.image_sha256!==draft.imageSha256||row.intent_digest!==draft.intentDigest||row.source_digest!==draft.sourceDigest||row.observation_digest!==draft.observationDigest||row.profile_version!==draft.profileVersion||row.topic!==draft.topic||row.focus_question!==draft.focusQuestion||row.source_ids_json!==JSON.stringify(draft.sourceIds))return []
    return [draft]
  })
  if(interpretations.length!==drafts.length)throw Error('Article evidence changed during preparation')
  return articleEvidencePack.parse({version:ARTICLE_EVIDENCE_VERSION,interpretations})
}
