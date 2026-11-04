import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'

// Demo/fictional exhibits never qualify for object regions (exact
// version IDs only), so the shipped journey must fire zero
// object-regions requests. Markers on demo artwork are authored only.
// Positive SAM rendering is covered by contract-shaped fixtures in the
// unit suite: version-ID exhibits cannot be staged without fabricating
// catalog membership.
const groundedItems=JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'spatial-grounded-items.json'),'utf8')) as unknown[]
const metaPlan={
  title:'A testing promenade',
  deck:'Two grounded exhibits for the spatial suite.',
  features:[
    {catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',headline:'A closer look: Ochre Arc Chair',narrative:'A subjective visual reading of the ochre chair.',layout:'hero',motion:'still',theme:'Quiet Luxury'},
    {catalogId:'demo-curio-owner-18-v1',assetId:'curio-owner-18-v1',headline:'A closer look: Window Overshirt',narrative:'A subjective visual reading of the overshirt.',layout:'split',motion:'still',theme:'Quiet Luxury'},
  ],
}

async function openFirstCard(page:Page):Promise<void>{
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  await expect(page.locator('.spatial-rail')).toBeVisible()
}

for(const width of [1440,390]){
  test(`demo exhibits show authored hotspots with zero object-regions requests at ${width}px`,async({page})=>{
    let calls=0
    await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
    await page.route('**/api/catalog/object-regions/*',route=>{calls++;return route.fulfill({status:404,json:{error:'Unavailable'}})})
    await page.setViewportSize({width,height:width===1440?900:844})
    await page.goto('/spatial')
    await openFirstCard(page)
    const card=page.locator('#spatial-rail .rail-story')
    const markers=card.locator('.object-hotspot')
    await expect(markers.first()).toBeVisible()
    await markers.first().click()
    // The popover portals to the body: it must stay fully inside the
    // viewport on desktop and as a bottom sheet on mobile, never clipped
    // by the figure or an ancestor container.
    const popover=page.locator('.object-popover')
    await expect(popover).toContainText('no SAM inference')
    await expect(popover.getByRole('button',{name:'Close object details'})).toBeVisible()
    const box=await popover.boundingBox()
    const viewport=page.viewportSize()!
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width+1)
    expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height+1)
    if(width===390){
      expect(box!.x).toBeLessThanOrEqual(13)
      expect(viewport.width-(box!.x+box!.width)).toBeLessThanOrEqual(13)
    }
    expect(calls).toBe(0)
    await expect(card.locator('h2')).not.toBeEmpty()
    await page.screenshot({path:`test-results/spatial-hotspots-${width}.png`})
  })
}
