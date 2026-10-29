import {test,expect} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
const output='test-results/reference-prototype'
test('Discover matches original viewport and uses actual prompt, consent and pending state',async({page})=>{
 await page.setViewportSize({width:573,height:543});await page.emulateMedia({reducedMotion:'reduce'})
 mkdirSync(output,{recursive:true})
 let release!:()=>void,seen!:()=>void
 const pending=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{seen=r})
 await page.route('**/api/editorial',async route=>{expect(route.request().postDataJSON().consent).toBe(false);seen();await pending;return route.fulfill({status:503,json:{status:'disabled'}})})
 try{
  await page.goto('/?prototype=reference')
  const canvas=page.locator('.reference-discover'),prompt=page.getByLabel('Your discovery prompt')
  await expect(prompt).toBeEditable();await expect(canvas).toHaveAttribute('data-input','empty')
  await expect(page.locator('.reference-preview .image-ready')).toHaveCount(5)
  const frame=await canvas.boundingBox(),input=await page.locator('.reference-prompt').boundingBox()
  expect(frame!.width).toBe(573);expect(frame!.height).toBe(543)
  expect(Math.abs(input!.x-132)).toBeLessThan(2);expect(Math.abs(input!.y-306)).toBeLessThan(2)
  await canvas.screenshot({path:`${output}/discover-573x543.png`})
  await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.keyboard.press('Enter');await expect(prompt).toBeFocused()
  await page.getByRole('button',{name:'Quiet luxury fashion',exact:true}).click();await expect(prompt).toHaveValue('Quiet luxury fashion')
  await page.getByRole('checkbox').check()
  await prompt.fill('Balanced home lamps chairs rooms and seating, fashion, and travel')
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await expect(canvas).toHaveAttribute('data-input','typing')
  await page.getByRole('button',{name:'Generate magazine',exact:true}).click();await requested
  await expect(page.getByRole('button',{name:'Composing your issue…'})).toBeDisabled()
  release();await expect(page.locator('.reference-reader')).toBeVisible()
  await expect(page.locator('.reference-reader-controls')).toContainText('AI not used')
  writeFileSync(`${output}/discover-geometry.json`,JSON.stringify({frame,input,expectedInput:{x:132,y:306,width:341,height:54},source:'approved illustrations; API mocked disabled'},null,2))
 }finally{release?.()}
})
test('Read at original aspect uses validated assets, actual detail selection, story and Collect',async({page})=>{
 await page.setViewportSize({width:505,height:543});await page.emulateMedia({reducedMotion:'reduce'})
 let calls=0,external=0
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4173'){external++;return route.abort()}
  if(u.pathname==='/api/editorial'){calls++;return route.fulfill({status:503,json:{status:'disabled'}})}
  return route.continue()
 })
 await page.goto('/?prototype=reference');await page.getByLabel('Your discovery prompt').fill('Balanced home lamps chairs rooms and seating, fashion, and travel');await page.getByRole('button',{name:'Generate magazine',exact:true}).click()
 const canvas=page.locator('.reference-reader');await expect(canvas).toBeVisible()
 await expect(canvas.locator('.reference-front-plane .image-ready')).toHaveCount(1)
 await expect(canvas.locator('.reference-rear-plane .image-ready')).toHaveCount(1)
 await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/read-505x543.png`})
 const frame=await canvas.boundingBox();expect(frame!.width).toBe(505);expect(frame!.height).toBe(543)
 const rear=await canvas.locator('.reference-rear-plane').boundingBox()
 const rearNormalized={x:rear!.x-frame!.x,y:rear!.y-frame!.y,width:rear!.width,height:rear!.height}
 const initial=await canvas.getAttribute('data-asset-id')
 const hotspot=canvas.locator('.reference-front-plane .image-hotspot').first();await hotspot.focus();await page.keyboard.press('Enter')
 const reveal=canvas.getByRole('region');await expect(reveal).toBeVisible();await expect(canvas.locator('.reference-context-plane')).toContainText('Selected detail');await expect(canvas.locator('.reference-front-plane .living-visual img')).toBeVisible()
 await reveal.getByRole('button',{name:'Return to original image'}).click();await expect(hotspot).toBeFocused();await expect(canvas.locator('.reference-context-plane')).toContainText('Visual detail')
 await canvas.getByRole('button',{name:'Explore the story',exact:true}).click()
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Collect story',exact:true}).click();await page.keyboard.press('Escape')
 await canvas.locator('.reference-reader-thumbnails button').first().click();await expect(canvas).not.toHaveAttribute('data-asset-id',initial!)
 await expect(canvas.locator('h2')).toBeFocused();expect(calls).toBe(1);expect(external).toBe(0)
 await page.reload();await page.getByRole('button',{name:'Your collection',exact:true}).click();await expect(dialog).toContainText('Editorial story')
 writeFileSync(`${output}/reader-state.json`,JSON.stringify({frame,rearNormalized,initialAsset:initial,requestCount:calls,externalRequests:external,source:'authored fallback; real UI state, no live model call',collectionSurvivesReload:true},null,2))
})
for(const width of [390,1440])test.describe(`responsive prototype ${width}`,()=>{
 test.use({hasTouch:width===390})
 test('remains functional without AI',async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'})
 await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{status:'disabled'}}))
 await page.goto('/?prototype=reference');await page.getByLabel('Your discovery prompt').fill('Balanced home lamps chairs rooms and seating, fashion, and travel');await page.getByRole('button',{name:'Generate magazine',exact:true}).click()
 const reader=page.locator('.reference-reader');await expect(reader).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 const button=reader.locator('.image-hotspot').first();await button.scrollIntoViewIfNeeded();if(width===390)await button.tap();else await button.click()
 await expect(reader.getByRole('region')).toBeVisible()
 await reader.getByRole('button',{name:'Return to original image'}).click();await expect(button).toBeFocused()
 await page.getByRole('button',{name:'Refine with a new prompt',exact:true}).click();await expect(page.getByLabel('Your discovery prompt')).toBeFocused()
})
})
