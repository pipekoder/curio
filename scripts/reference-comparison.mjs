// Local/private comparison only. Never publish these original reference photographs.
import {readFile,mkdir,writeFile,chmod} from 'node:fs/promises'
import {resolve,relative,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {chromium} from '@playwright/test'
const [references,captures,target]=process.argv.slice(2)
if(!references||!captures||!target)throw Error('Usage: node scripts/reference-comparison.mjs <private-originals-dir> <captures-dir> <private-output-dir-outside-repo>')
const output=resolve(target),root=resolve('.'),rel=relative(root,output)
if(!rel||!rel.startsWith('..'+sep)&&rel!=='..')throw Error('Original-containing comparisons must remain outside the Git repository.')
await mkdir(output,{recursive:true,mode:0o700});await chmod(output,0o700)
const pairs=[
 {name:'discover',reference:'curio_01_discovery_entry.png',capture:'discover-573x543.png',width:573,height:543,hash:'a87cf637c6bcc1437a8db9ce1e6662fea52881ac8248102c311a2baea92cf7ba'},
 {name:'read-explore',reference:'curio_03_read_explore.png',capture:'read-505x543.png',width:505,height:543,hash:'abf9c12ef524812ff23bc989e5f5cc796e9058c34a5dd92adc7c2f1981bc101c'},
]
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH})
const sections=[]
let blockedRequests=0
try{
 for(const pair of pairs){
  const original=await readFile(resolve(references,pair.reference)),actual=await readFile(resolve(captures,pair.capture))
  if(createHash('sha256').update(original).digest('hex')!==pair.hash)throw Error('Original reference fingerprint differs.')
  for(const bytes of [original,actual])if(bytes.readUInt32BE(16)!==pair.width||bytes.readUInt32BE(20)!==pair.height)throw Error('Comparison images must have identical original dimensions.')
  const section=`<section><figure><figcaption>Original reference — ${pair.width} × ${pair.height}</figcaption><img width="${pair.width}" height="${pair.height}" src="data:image/png;base64,${original.toString('base64')}" alt="Owner-provided original reference"></figure><figure><figcaption>Actual browser — approved illustrations substituted</figcaption><img width="${pair.width}" height="${pair.height}" src="data:image/png;base64,${actual.toString('base64')}" alt="Actual functional prototype"></figure></section>`
  const style='<style>body{margin:16px;background:#fff;color:#222;font:12px Arial}section{display:flex;gap:16px;margin-bottom:24px}figure{margin:0}figcaption{height:24px}img{display:block;max-width:none}</style>'
  const page=await browser.newPage({viewport:{width:pair.width*2+48,height:pair.height+64},javaScriptEnabled:false})
  await page.route('**/*',route=>{blockedRequests++;return route.abort()})
  await page.setContent(style+section)
  const file=resolve(output,`${pair.name}-side-by-side.png`)
  await page.screenshot({path:file,fullPage:true});await chmod(file,0o600);await page.close()
  sections.push(section)
 }
 await writeFile(resolve(output,'index.html'),'<meta charset="utf-8"><title>Private Curio visual comparison</title><style>body{font:12px Arial;margin:16px}section{display:flex;gap:16px;margin-bottom:32px}figure{margin:0}figcaption{height:24px}img{display:block}</style>'+sections.join(''),{mode:0o600})
 console.log(JSON.stringify({output,comparisons:pairs.map(p=>({name:p.name,width:p.width,height:p.height})),privateOnly:true,blockedNetworkRequests:blockedRequests,outboundAllowed:false}))
}finally{await browser.close()}
