import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH})
await mkdir('test-results/discover-photo-review',{recursive:true})
try{
 for(const width of [573,390]){
  const context=await browser.newContext({viewport:{width,height:width===573?543:844},hasTouch:width===390,reducedMotion:'reduce'})
  const page=await context.newPage();let metaCalls=0;page.on('request',r=>{if(new URL(r.url()).hostname==='api.meta.ai')metaCalls++})
  await page.goto('http://127.0.0.1:4188/?prototype=discover',{waitUntil:'networkidle'})
  const canvas=page.locator('.reference-discover')
  if(await page.locator('.reference-photo').count()!==5)throw Error('Missing real photographic planes')
  if(await page.locator('.reference-photo img').count()!==5)throw Error('Five independent images unavailable')
  for(const photo of await page.locator('.reference-photo img').all())if(!await photo.evaluate(img=>img.complete&&img.naturalWidth>0))throw Error('Editorial image did not load')
  if(width===573)await canvas.screenshot({path:'test-results/discover-photo-review/desktop-573x543.png'})
  else await page.screenshot({path:'test-results/discover-photo-review/mobile-390.png',fullPage:true})
  await page.getByRole('button',{name:'Modern ceramic design',exact:true}).click()
  if(await page.getByLabel('Your discovery prompt').inputValue()!=='Modern ceramic design')throw Error('Preset did not populate the real prompt')
  await page.getByLabel('Your discovery prompt').fill('A quiet magazine about home lighting')
  await page.getByRole('button',{name:'Generate magazine',exact:true}).click()
  await page.locator('.visual-reader').waitFor()
  if(!await page.getByText('AI not used').first().isVisible())throw Error('Authored fallback disclosure missing')
  if(metaCalls)throw Error('Unexpected inference')
  await writeFile(`test-results/discover-photo-review/interaction-${width}.json`,JSON.stringify({width,realFrontend:true,suggestionsWork:true,realSubmission:true,authoredFallback:true,validatedReaderRendered:true,metaCalls,photography:'five independent owner-supplied photographs'},null,2))
  await context.close()
 }
 console.log('PASS: five independent editorial photos, real prompt/preset/submission and consent-default fallback; validated Reader, no Meta calls')
}finally{await browser.close()}
