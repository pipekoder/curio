import {test,expect} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
const baseline=process.env.CURIO_VISUAL_BASELINE==='true'
for(const width of [1440,390])test.describe(`connected visual journey ${width}`,()=>{
 test.use({viewport:{width,height:1000},hasTouch:width===390,reducedMotion:'reduce'})
 test('reference stages follow real state, reverse navigation and exact saved records',async({page})=>{
  let release!:()=>void,seen!:()=>void
  const pending=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{seen=r})
  const outbound:string[]=[],requests:{consent:boolean}[]=[]
  const directory=`test-results/visual-v1/${baseline?'before':'after'}`
  mkdirSync(directory,{recursive:true})
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if(url.origin!=='http://127.0.0.1:4173'){outbound.push(url.host);return route.abort()}
   if(url.pathname==='/api/editorial'){
    requests.push(route.request().postDataJSON())
    if(requests.length===1){seen();await pending}
    return route.fulfill({status:503,json:{status:'disabled'}})
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{status:'disabled'}})
   return route.continue()
  })
  try{
   await page.goto('/')
   const prompt=page.getByLabel('Your discovery prompt'),experience=page.locator('.editorial-experience')
   await expect(prompt).toBeEditable();await expect(page.locator('body')).toBeFocused()
   if(!baseline)await expect(experience).toHaveAttribute('data-state','empty')
   await page.screenshot({path:`${directory}/discover-${width}.png`,fullPage:true})
   await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused()
   await page.keyboard.press('Enter');await expect(prompt).toBeFocused()
   await prompt.fill('Focus on Scandinavian reading rooms and paper lamps')
   if(!baseline){await expect(experience).toHaveAttribute('data-state','typing');await expect(page.locator('.entry-hud')).toHaveCSS('pointer-events','none')}
   await page.getByRole('button',{name:'Generate magazine'}).click();await requested
   await expect(page.getByRole('button',{name:'Composing your issue…'})).toBeDisabled()
   if(!baseline){await expect(experience).toHaveAttribute('data-state','loading');await expect(page.getByRole('status',{name:'Edition assembly'})).toBeInViewport();await expect(page.locator('.assembly-planes')).toHaveCSS('animation-name','none')}
   await page.screenshot({path:`${directory}/generate-${width}.png`,fullPage:true})
   release()
   await expect(page.getByRole('heading',{name:'The art of quiet rooms'})).toBeFocused()
   if(!baseline){await expect(experience).toHaveAttribute('data-state','fallback');await expect(page.getByRole('status',{name:'Edition assembly'})).toHaveCount(0)}
   await expect(page.locator('.issue-cover')).toContainText('AI not used')
   const feature=page.locator('.personal-feature').first(),hotspot=feature.getByRole('button',{name:'Explore Paper shade'})
   await expect(feature.locator('.image-ready')).toHaveCount(1)
   if(width===390)await hotspot.tap();else{await hotspot.focus();await page.keyboard.press('Enter')}
   await expect(feature.getByRole('region',{name:'Paper shade editorial reveal'})).toBeVisible()
   if(!baseline)await expect(feature.locator('.living-ad')).toHaveAttribute('data-exploring','true')
   await expect(feature.locator('.living-visual img')).toBeVisible()
   await feature.screenshot({path:`${directory}/read-explore-${width}.png`})
   await feature.getByRole('button',{name:'Return to original image'}).click();await expect(hotspot).toBeFocused()
   await hotspot.press('Enter')
   await feature.getByRole('button',{name:/Read the connected story/}).click()
   const dialog=page.getByRole('dialog')
   await expect(dialog.locator('h2')).toBeFocused()
   if(!baseline)await expect(experience).toHaveAttribute('data-view','story')
   if(!baseline)await expect(dialog.getByLabel('Current discovery trail')).toContainText('Paper shade')
   const firstStory=await dialog.locator('h2').textContent()
   if(!baseline)await dialog.locator('.journey-map').screenshot({path:`${directory}/journey-${width}.png`})
   await dialog.locator('.related-rail button').first().click()
   await expect(dialog.locator('h2')).not.toHaveText(firstStory!)
   const savedStory=await dialog.locator('h2').textContent()
   await dialog.getByRole('button',{name:'Collect story',exact:true}).click()
   if(!baseline)await expect(experience).toHaveAttribute('data-has-collection','true')
   await page.keyboard.press('Escape')
   await page.getByRole('button',{name:'Refine with a new prompt ↑'}).click();await expect(prompt).toBeFocused()
   await page.getByRole('button',{name:'Your collection (1)'}).click()
   await expect(dialog).toContainText(savedStory!)
   if(!baseline)await expect(experience).toHaveAttribute('data-view','collection')
   const collectionHeading=dialog.getByRole('heading',{name:'Your collection',exact:true})
   await expect(collectionHeading).toBeFocused()
   await dialog.evaluate(element=>{element.scrollTop=0})
   await expect(collectionHeading).toBeInViewport()
   await dialog.screenshot({path:`${directory}/collect-${width}.png`})
   await page.reload();await page.getByRole('button',{name:'Your collection (1)'}).click()
   await dialog.getByRole('button',{name:'Continue exploring'}).click();await expect(dialog.locator('h2')).toHaveText(savedStory!)
   await page.keyboard.press('Escape')
   await page.getByRole('button',{name:'Your collection (1)'}).click()
   await dialog.getByRole('button',{name:'Remove story',exact:true}).click()
   await expect(dialog).toContainText('Your collection is waiting')
   if(!baseline)await expect(experience).toHaveAttribute('data-has-collection','false')
   await page.keyboard.press('Escape')
   await expect(page.getByRole('button',{name:'Your collection (0)'})).toBeFocused()
   await page.reload();await expect(page.getByRole('button',{name:'Your collection (0)'})).toBeVisible()
   expect(outbound).toEqual([]);expect(requests.every(r=>r.consent===false)).toBe(true)
   writeFileSync(`${directory}/acceptance-${width}.json`,JSON.stringify({width,baseline,reducedMotion:true,ai:'disabled mocked endpoint; authored annotations',externalRequests:outbound.length,requests:requests.length,collectReloadRevisitRemove:true,reverseNavigation:true},null,2))
  }finally{release?.()}
 })
})

test('normal-motion HUD, prompt error and validated mocked edition follow actual state',async({page})=>{
 test.skip(baseline,'New HUD components are absent from the before-capture app')
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.setViewportSize({width:1440,height:1000})
 const {readFileSync}=await import('node:fs'),{curationCatalog}=await import('../shared/catalog')
 const plan=JSON.parse(readFileSync('tests/fixtures/editorial-v2-grounded.json','utf8'))
 let release!:()=>void,seen!:()=>void,calls=0
 const pending=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{seen=r})
 await page.route('**/api/editorial',async route=>{
  calls++;expect(route.request().postDataJSON().consent).toBe(true);seen();await pending
  return route.fulfill({json:{plan,items:curationCatalog,source:'meta',retrieval:'fictional',cached:false}})
 })
 try{
  await page.goto('/');const prompt=page.getByLabel('Your discovery prompt'),root=page.locator('.editorial-experience')
  await expect(prompt).toBeEditable();await expect(root).toHaveAttribute('data-state','empty')
  await expect(page.locator('.entry-hud')).toHaveCSS('opacity','0.38')
  await prompt.fill('No home, no fashion, no travel')
  await expect(page.locator('.entry-hud')).toHaveCSS('opacity','0.85')
  await page.getByRole('button',{name:'Generate magazine'}).click()
  await expect(page.getByRole('alert')).toBeVisible();await expect(root).toHaveAttribute('data-state','error');expect(calls).toBe(0)
  await prompt.fill('Focus on Scandinavian home lighting and reading rooms')
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:'Generate magazine'}).click();await requested
  await expect(page.getByRole('status',{name:'Edition assembly'})).toBeVisible()
  await expect(page.locator('.assembly-planes')).toHaveCSS('animation-name','assemble-pages')
  release()
  await expect(root).toHaveAttribute('data-state','generated')
  await expect(page.getByRole('heading',{name:plan.title})).toBeFocused()
  await expect(page.locator('.issue-cover')).toContainText('AI-generated visual interpretation')
  await expect(page.getByRole('status',{name:'Edition assembly'})).toHaveCount(0)
  expect(calls).toBe(1)
  await page.emulateMedia({forcedColors:'active'})
  await expect(page.locator('.entry-hud')).toHaveCSS('display','none')
  await expect(prompt).toBeEnabled()
 }finally{release?.()}
})
