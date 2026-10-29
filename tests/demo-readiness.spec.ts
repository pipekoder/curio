import {test,expect} from '@playwright/test'
import {writeFileSync} from 'node:fs'
for(const width of [1440,390])test.describe(`final demo at ${width}px`,()=>{
 test.use({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:width===390?'reduce':'no-preference'})
 test('approved intent-to-Collect journey survives fallback, refinement and reload',async({page})=>{
  let release!:()=>void,seen!:()=>void
  const pending=new Promise<void>(resolve=>{release=resolve}),requested=new Promise<void>(resolve=>{seen=resolve})
  const requests:{consent:boolean}[]=[],external:string[]=[]
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if(url.origin!=='http://127.0.0.1:4173'){external.push(url.hostname);return route.abort()}
   if(url.pathname==='/api/editorial'){
    requests.push(route.request().postDataJSON())
    if(requests.length===1){seen();await pending}
    return route.fulfill({status:503,json:{status:'disabled'}})
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{status:'disabled'}})
   return route.continue()
  })
  try{
   await page.goto('/?legacy=1')
   await expect(page.getByLabel('Your discovery prompt')).toBeEditable()
   await expect(page.locator('body')).toBeFocused()
   await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused()
   await page.keyboard.press('Enter');await expect(page.getByLabel('Your discovery prompt')).toBeFocused()
   await page.getByLabel('Your discovery prompt').fill('Focus on Scandinavian reading rooms and paper lamps')
   await page.getByRole('button',{name:'Generate magazine'}).click();await requested
   await expect(page.getByRole('button',{name:'Composing your issue…'})).toBeDisabled()
   await expect(page.getByLabel('Your discovery prompt')).toBeDisabled()
   release()
   await expect(page.getByRole('heading',{name:'The art of quiet rooms'})).toBeFocused()
   await expect(page.locator('.issue-cover')).toContainText('AI not used')
   const first=page.locator('.personal-feature').first()
   await expect(first.locator('.image-ready')).toHaveCount(1)
   const homeId=await first.getAttribute('id'),homeLayout=await first.getAttribute('data-layout')
   await first.screenshot({path:`test-results/final-demo-magazine-${width}.png`})
   const hotspot=first.getByRole('button',{name:'Explore Paper shade'})
   if(width===390)await hotspot.tap()
   else{await hotspot.focus();await page.keyboard.press('Enter')}
   await expect(first.getByRole('region',{name:'Paper shade editorial reveal'})).toBeVisible()
   if(width===390)await expect(first.locator('.editorial-reveal')).toHaveCSS('animation-name','none')
   await first.getByRole('button',{name:/Read the connected story/}).click()
   const dialog=page.getByRole('dialog')
   await expect(dialog).toBeVisible();await expect(dialog.locator('h2')).toBeFocused()
   const initialStory=await dialog.locator('h2').textContent()
   await dialog.locator('.related-rail button').first().click()
   await expect(dialog.locator('h2')).not.toHaveText(initialStory!)
   const collectedStory=await dialog.locator('h2').textContent()
   await dialog.getByRole('button',{name:'Collect story',exact:true}).click()
   await dialog.evaluate(element=>{element.scrollTop=0})
   await dialog.screenshot({path:`test-results/final-demo-story-${width}.png`})
   await page.keyboard.press('Escape')
   await page.reload()
   await page.getByRole('button',{name:'Your collection (1)'}).click()
   await expect(dialog).toContainText(collectedStory!)
   await dialog.screenshot({path:`test-results/final-demo-collection-${width}.png`})
   await dialog.getByRole('button',{name:'Continue exploring'}).click()
   await expect(dialog.locator('h2')).toHaveText(collectedStory!)
   await page.keyboard.press('Escape')
   await page.getByLabel('Your discovery prompt').fill('Surprise me with woodland paths and lakeside travel')
   await page.getByRole('button',{name:'Generate magazine'}).click()
   await expect(page.getByRole('heading',{name:'Into the open'})).toBeVisible()
   const travel=page.locator('.personal-feature').first()
   await expect(travel).not.toHaveAttribute('id',homeId!)
   await expect(travel).not.toHaveAttribute('data-layout',homeLayout!)
   for(const image of await page.locator('img').all())expect(await image.getAttribute('src')).toMatch(/^\/catalog\/[a-z-]+\.svg$/)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   expect(external).toEqual([]);expect(requests.every(r=>r.consent===false)).toBe(true)
   writeFileSync(`test-results/final-demo-${width}.json`,JSON.stringify({width,touch:width===390,reducedMotion:width===390,journey:'intent/magazine/image/hotspot/story/related/collect/reload/refine',homeId,travelId:await travel.getAttribute('id'),homeLayout,travelLayout:await travel.getAttribute('data-layout'),source:'authored illustrations; model unavailable by test interception',externalRequests:external.length,paidInference:0,collectionRestored:true},null,2))
  }finally{release?.()}
 })
})
