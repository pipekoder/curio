import {test,expect} from '@playwright/test'

declare global{
  interface Window{__spatial?:()=>{distance:number;cameraZ:number;nodes:number;source:string}}
}

test('/spatial opens the silver field with an immediately usable prompt',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const prompt=page.getByLabel('Your curiosity')
  await expect(prompt).toBeVisible()
  await prompt.fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText('Curiosity noted')
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.nodes).toBeGreaterThanOrEqual(6)
  expect(snapshot?.source).toBe('manifest')
  await expect(page.locator('.spatial-source')).toContainText('local manifest')
  await expect(page.locator('#spatial-index li')).toHaveCount(snapshot?.nodes??0)
})

test('scrolling travels the camera through genuine depth',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const top=await page.evaluate(()=>window.__spatial?.().cameraZ)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeLessThan(top!)
  await page.evaluate(()=>window.scrollTo(0,0))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeGreaterThan(top!-1)
})

test('Clear wipes the visit session and says what was removed',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  await expect(page.getByRole('status').last()).toContainText('curio.spatial.session.v1')
  await expect(page.getByRole('status').last()).toContainText('pending confirmation')
})
