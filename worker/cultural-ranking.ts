import type {ResearchSource} from './cultural-research'

// RRF is useful for independent, meaningful rankings; it never fabricates a
// semantic result when only lexical evidence exists.
export function reciprocalRankFusion(rankings:readonly (readonly string[])[],eligible:ReadonlySet<string>,k=60){
  const scores=new Map<string,number>()
  for(const ranking of rankings)ranking.forEach((id,index)=>{if(eligible.has(id))scores.set(id,(scores.get(id)??0)+1/(k+index+1))})
  return [...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id,score])=>({id,score}))
}

export function rankLexicalSources(query:string,sources:readonly ResearchSource[],qualityFloor=0){
  const eligible=sources.filter(source=>source.sourceQuality>=qualityFloor)
  const tokenRanking=[...eligible].sort((a,b)=>b.relevance-a.relevance||a.id.localeCompare(b.id)).map(source=>source.id)
  const terms=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(term=>term.length>2)??[]
  const phrases=terms.slice(0,8).map((term,index)=>index<terms.length-1?`${term} ${terms[index+1]}`:'').filter(Boolean)
  const exact=eligible.map(source=>({id:source.id,score:phrases.filter(phrase=>source.excerpt.toLowerCase().includes(phrase)).length})).filter(row=>row.score>0)
  if(eligible.length<2||!exact.length)return {mode:'lexical_only' as const,results:tokenRanking.map((id,index)=>({id,score:1/(61+index)}))}
  const phraseRanking=exact.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).map(row=>row.id)
  return {mode:'lexical_rrf' as const,results:reciprocalRankFusion([tokenRanking,phraseRanking],new Set(eligible.map(source=>source.id)))}
}
