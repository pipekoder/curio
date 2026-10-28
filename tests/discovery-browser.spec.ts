import {test,expect} from '@playwright/test'
import {SecureDiscoveryTransport,authorizeUrl} from '../discovery/network'
import {discoveryConfig,discover} from '../discovery/core'
test('controlled JS gallery discovers lazy images, lightboxes and hash routing with bounded interactions',async()=>{
 const config=discoveryConfig.parse({hosts:['fixture.example.com'],scrolls:2,interactions:2,dynamic:true,delayMs:0,maxPages:4})
 const t=new SecureDiscoveryTransport(config),requests:string[]=[]
 const html=`<html><head><title>Fixture JS gallery</title><script src="/app.js"></script></head><body style="min-height:1800px"><h1>Gallery</h1><div id="images"></div><button aria-label="View image" onclick="document.getElementById('images').innerHTML+='<img src=/original.png alt=Original>';this.remove()">View image</button><button onclick="location.hash='/gallery/second';document.getElementById('images').innerHTML+='<img src=/second.png alt=Second>';this.remove()">Next</button></body></html>`
 // Test-only broker: no real DNS/network or private-host bypass flag is exposed by the CLI.
 t.read=async(url)=>{authorizeUrl(url,config.hosts);requests.push(url);return{status:200,type:url.endsWith('.js')?'application/javascript':'text/html',body:url.endsWith('.js')?`window.addEventListener('scroll',()=>{if(!document.querySelector('#lazy'))document.getElementById('images').innerHTML+='<img id=lazy src=/lazy.png alt=Lazy>'});fetch('http://169.254.169.254/latest/meta-data/')`:html,bytes:100}}
 const result=await discover('https://fixture.example.com/gallery',config,t)
 expect(result.nodes.filter(n=>n.kind==='image').length).toBeGreaterThanOrEqual(3)
 expect(result.nodes.some(n=>n.url.includes('#/gallery/second'))).toBe(true)
 expect(result.metrics.dynamicInteractions).toBeLessThanOrEqual(4)
 expect(requests.every(u=>u.startsWith('https://fixture.example.com/'))).toBe(true)
 expect(result.displayPermission).toBe('pending_review')
})
