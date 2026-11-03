// Editorial Book: deterministic template assignment plus the on-demand
// display font. Assignment hashes the stable article ID only — no index,
// no rotation, no backend, no persistence — so each article keeps its
// layout across refreshes and sessions. Anything unexpected falls back
// to Editorial Spread; presentation never fails a valid story.
export type BookTemplate='spread'|'gallery'|'fullbleed'
const TEMPLATES:BookTemplate[]=['spread','gallery','fullbleed']

export function templateOf(articleId:string):BookTemplate{
  if(typeof articleId!=='string'||!articleId)return 'spread'
  let hash=2166136261
  for(let i=0;i<articleId.length;i++){hash^=articleId.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return TEMPLATES[(hash>>>0)%TEMPLATES.length]
}

export function normalizeTemplate(value:unknown):BookTemplate{
  return value==='spread'||value==='gallery'||value==='fullbleed'?value:'spread'
}

let fontRequested=false
export function loadEditorialFont(){
  if(fontRequested||typeof document==='undefined')return
  fontRequested=true
  if(document.querySelector('link[data-editorial-display]'))return
  const link=document.createElement('link')
  link.rel='stylesheet'
  link.setAttribute('data-editorial-display','')
  link.href='https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap'
  document.head.appendChild(link)
}
