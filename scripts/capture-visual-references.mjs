import {chromium} from '@playwright/test'
import {mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
const referenceDir=process.env.CURIO_REFERENCE_DIR
if(!referenceDir)throw Error('Set CURIO_REFERENCE_DIR to the private five-reference directory')
const output='test-results/visual-journey/native'
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH})
const context=await browser.newContext({viewport:{width:573,height:543},reducedMotion:'reduce'})
const page=await context.newPage()
const stages=[['discover','curio_01_discovery_entry.png',573,543],['generate','curio_02_generate.png',451,543],['read','curio_03_read_explore.png',505,543],['journey','curio_04_curiosity_journey.png',853,475],['collect','curio_05_collect.png',678,475]]
try{
 await page.route('**/api/editorial',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({status:503,body:'Unavailable'})})
 await page.goto('http://127.0.0.1:4188/?prototype=discover',{waitUntil:'networkidle'})
 await page.locator('.reference-discover').screenshot({path:join(output,'discover.png')})
 await page.getByLabel('Your discovery prompt').fill('Quiet interiors and sculptural seating')
 await page.setViewportSize({width:451,height:543})
 await page.getByRole('button',{name:'Generate magazine'}).click()
 await page.locator('.visual-generate').screenshot({path:join(output,'generate.png')})
 await page.locator('.visual-reader').waitFor()
 await page.setViewportSize({width:505,height:543})
 await page.locator('.visual-reader').screenshot({path:join(output,'read.png')})
 await page.locator('.visual-reader-related').click()
 await page.setViewportSize({width:853,height:475})
 await page.locator('.visual-journey').screenshot({path:join(output,'journey.png')})
 await page.locator('.journey-collect').click()
 await page.locator('.dialog-close').click()
 await page.getByRole('button',{name:'Your collection'}).click()
 await page.setViewportSize({width:678,height:475})
 await page.locator('.visual-collect').screenshot({path:join(output,'collect.png')})
 for(const [stage,reference,width,height] of stages){
  const ref=await readFile(join(referenceDir,reference))
  const actual=await readFile(join(output,`${stage}.png`))
  const compare=await browser.newPage({viewport:{width:width*2+24,height:height+30},deviceScaleFactor:1})
  await compare.setContent(`<style>body{margin:0;background:white;font:11px Arial}main{display:flex;gap:24px}img{display:block;width:${width}px;height:${height}px}p{margin:8px 0}</style><main><section><p>Reference ${stage}</p><img src="data:image/png;base64,${ref.toString('base64')}"></section><section><p>Actual browser ${stage}</p><img src="data:image/png;base64,${actual.toString('base64')}"></section></main>`)
  await compare.screenshot({path:join(output,`${stage}-comparison.png`)})
  await compare.close()
 }
 console.log('Captured five native-size stages and reference comparisons')
}finally{await browser.close()}
