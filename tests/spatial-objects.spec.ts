import {expect,test,type Page} from '@playwright/test'

// Demo/fictional exhibits never qualify for object regions (exact
// version IDs only), so the shipped journey must fire zero
// object-regions requests and render zero region UI. Positive rendering
// is covered by contract-shaped fixtures in the unit suite: version-ID
// exhibits cannot be staged without fabricating catalog membership.
async function submitPrompt(page:Page):Promise<void>{
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
}

async function openFirstInspect(page:Page):Promise<void>{
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  await expect(page.locator('.spatial-rail')).toBeVisible()
  await page.locator('.spatial-rail-card').first().getByRole('button',{name:'Inspect exhibit'}).click()
  await expect(page.locator('.spatial-inspect')).toBeVisible()
}

for(const width of [1440,390]){
  test(`demo inspection fires no object-regions request at ${width}px`,async({page})=>{
    let calls=0
    await page.route('**/api/catalog/object-regions/*',route=>{calls++;return route.fulfill({status:404,json:{error:'Unavailable'}})})
    await page.setViewportSize({width,height:width===1440?900:844})
    await page.goto('/spatial')
    await openFirstInspect(page)
    await expect(page.locator('.object-region')).toHaveCount(0)
    await expect(page.locator('.object-discovery')).toHaveCount(0)
    expect(calls).toBe(0)
    await expect(page.locator('.spatial-inspect h2')).not.toBeEmpty()
    await page.screenshot({path:`test-results/spatial-objects-inspect-${width}.png`})
  })
}
