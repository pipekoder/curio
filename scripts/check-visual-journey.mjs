import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH})
const root='test-results/visual-journey'
await mkdir(root,{recursive:true})
try{
 for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:width===390,reducedMotion:'reduce'})
  const page=await context.newPage();let inference=0
  page.on('request',request=>{if(request.url().includes('api.meta.ai'))inference++})
  await page.route('**/api/editorial',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({status:503,body:'Unavailable'})})
  await page.goto('http://127.0.0.1:4188/?prototype=discover',{waitUntil:'networkidle'})
  await page.screenshot({path:`${root}/discover-${width}.png`,fullPage:true})
  await page.getByLabel('Your discovery prompt').fill('Quiet interiors and sculptural seating')
  await page.getByRole('button',{name:'Generate magazine'}).click()
  await page.locator('.visual-generate').waitFor()
  await page.screenshot({path:`${root}/generate-${width}.png`,fullPage:true})
  await page.locator('.visual-reader').waitFor()
  await page.screenshot({path:`${root}/read-${width}.png`,fullPage:true})
  await page.locator('.visual-reader-related').click()
  await page.locator('.visual-journey').waitFor()
  await page.screenshot({path:`${root}/journey-${width}.png`,fullPage:true})
  await page.locator('.journey-collect').click()
  await page.locator('.dialog-close').click()
  await page.getByRole('button',{name:'Your collection'}).click()
  await page.locator('.visual-collect').waitFor()
  await page.screenshot({path:`${root}/collect-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Revisit'}).click()
  await page.locator('.visual-journey').waitFor()
  await page.locator('.dialog-close').click()
  await page.getByRole('button',{name:'Your collection'}).click()
  if(await page.getByText('Your collection is waiting for a first discovery.').isVisible())throw Error('Save failed')
  await page.reload()
  await page.getByRole('button',{name:'Your collection'}).click()
  if(await page.getByText('Your collection is waiting for a first discovery.').isVisible())throw Error('Reload persistence failed')
  await page.getByRole('button',{name:'Remove',exact:true}).first().click()
  if(!await page.getByText('Your collection is waiting for a first discovery.').isVisible())throw Error('Remove failed')
  if(inference)throw Error('Unexpected paid model request')
  await writeFile(`${root}/result-${width}.json`,JSON.stringify({width,allFiveStages:true,realPendingRequest:true,authoredFallback:true,storyOpened:true,collectionPersisted:true,revisitWorked:true,removeWorked:true,inferenceRequests:inference},null,2))
  await context.close()
 }
 console.log('PASS: five real React stages, pending request, fallback, story, Collect and reload at 390/768/1440')
}finally{await browser.close()}
