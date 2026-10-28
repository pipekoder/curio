import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discover,discoveryConfig } from './core'
import { SecureDiscoveryTransport } from './network'
import { discoveryManifest,type DiscoveryManifest } from '../shared/discovery'
const args=process.argv.slice(2),url=args[0]
if(!url)throw Error('Usage: npm run discover -- <https-url> <config.json> <output-directory> [--persist]; or ingest <manifest.json>')
let result:DiscoveryManifest
if(url==='ingest')result=discoveryManifest.parse(JSON.parse(await readFile(args[1],'utf8')))
else{
 const config=discoveryConfig.parse(JSON.parse(await readFile(args[1],'utf8'))),directory=resolve(args[2]??'.wrangler/discovery-manifests')
 await mkdir(directory,{recursive:true,mode:0o700})
 result=await discover(url,config,new SecureDiscoveryTransport(config))
 await writeFile(resolve(directory,`${result.jobId}.json`),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'})
}
if(url==='ingest'||args.includes('--persist')){
 const token=process.env.CURIO_CATALOG_OPERATOR_TOKEN
 if(!token||token.length<32)throw Error('Private local operator token required')
 const response=await fetch('http://127.0.0.1:18788/api/operator/catalog/intelligence/discovery/runs',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,Origin:'https://curio.test','Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(result)})
 if(!response.ok)throw Error(`Local persistence failed at ${response.status}; manifest retained for retry without crawl`)
}
console.log(JSON.stringify({jobId:result.jobId,pages:result.pages.length,images:result.nodes.filter(n=>n.kind==='image').length,status:result.status,reasons:result.stopReasons,metrics:result.metrics,permissions:'pending_review',paidCalls:0}))
