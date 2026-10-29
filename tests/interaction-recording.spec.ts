import {test,expect} from '@playwright/test'
import {readFileSync} from 'node:fs'

// This is an offline acceptance recording. The editorial response is a captured
// plan fixture, never a live Meta call. Playwright stores the video in test-results/.
test.use({video:'on'})
const captured=JSON.parse(readFileSync('tests/fixtures/editorial-live-home.json','utf8')) as {plan:{features:{catalogId:string;assetId:string}[]}}

for(const width of [390,1440])test(`recorded lamp-to-collection interaction at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900})
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.route('**/api/editorial',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({source:'meta',retrieval:'fictional',cached:false,plan:captured.plan,items:captured.plan.features.map(f=>({id:f.catalogId,image:{id:f.assetId}}))})}))
 await page.goto('/')
 await page.getByLabel('Your discovery prompt').fill('Create a quiet magazine about paper lamps and calm reading rooms')
 await page.getByRole('checkbox',{name:/Use Meta AI/}).check()
 await page.getByRole('button',{name:'Generate magazine'}).click()
 await expect(page.locator('.visual-reader')).toBeVisible()
 await page.screenshot({path:`test-results/interaction-reader-${width}.png`})
 await page.getByRole('button',{name:'Explore image details'}).click()
 await page.getByRole('button',{name:'Explore Paper shade'}).click()
 await expect(page.getByRole('region',{name:'Paper shade editorial reveal'})).toBeVisible()
 await page.screenshot({path:`test-results/interaction-detail-${width}.png`})
 await page.getByRole('button',{name:/Read the connected story/}).click()
 await expect(page.locator('.visual-journey')).toBeVisible()
 await page.screenshot({path:`test-results/interaction-journey-${width}.png`})
 await page.locator('.journey-collect').click()
 await expect(page.locator('.visual-journey')).toBeVisible()
 await page.getByRole('button',{name:'Open collection'}).click()
 await expect(page.locator('.visual-collect')).toBeVisible()
 await page.screenshot({path:`test-results/interaction-collection-${width}.png`})
 await page.getByRole('button',{name:'Return to reading'}).click()
 await expect(page.locator('.visual-reader')).toHaveAttribute('data-asset-id','asset-home-lamp-v1')
})
