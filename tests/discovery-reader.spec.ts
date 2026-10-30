import {test,expect} from '@playwright/test'
import {editorialCopy} from '../shared/editorial'
import {externalFixture} from './hybrid-fixtures'
const item={...externalFixture,id:`catalog-${'b'.repeat(40)}`,image:{...externalFixture.image,id:`version-${'a'.repeat(64)}`}}
const plan={title:'A persisted discovery',deck:'An independently reviewed visual record.',features:[{catalogId:item.id,assetId:item.image.id,headline:editorialCopy(item).headlines[0],narrative:editorialCopy(item).narratives[0],layout:'split',motion:'still',theme:item.lifestyleTags[0]}]}
const source={id:`${item.image.id}:product_description`,assetId:item.image.id,kind:'product_description',label:'Product description',value:'Owner supplied fictional editorial object.',authority:'owner_supplied_mockup',source:'content_studio'} as const
for(const approved of [true,false])test(`persistent catalog record ${approved?'renders and survives Collect reload':'is rejected without authoritative publication'}`,async({page})=>{
 let imageRequests=0
 await page.route('**/api/editorial',route=>route.fulfill({json:{plan,items:[item],source:'deterministic',retrieval:'d1',cached:false}}))
 await page.route('**/api/catalog/published?*',route=>route.fulfill({json:{items:approved?[item]:[],nextCursor:null}}))
 await page.route(item.image.externalUrl!,route=>{imageRequests++;return route.fulfill({path:'tests/fixtures/original-home-lamp.png',contentType:'image/png'})})
 await page.goto('/?legacy=1');await page.getByLabel('Your discovery prompt').fill('Quiet rooms and reading lamps');await page.getByRole('button',{name:'Generate magazine'}).click()
 if(approved){
  await expect(page.getByRole('heading',{name:'A persisted discovery'})).toBeVisible()
  await expect(page.locator('.personal-feature .image-ready')).toHaveCount(1)
  await page.getByRole('button',{name:'Collect image',exact:true}).click()
  await page.reload();await page.getByRole('button',{name:'Your collection (1)'}).click()
  await expect(page.getByRole('dialog')).toContainText(item.name)
  expect(imageRequests).toBeGreaterThan(0)
 }else{
  await expect(page.getByRole('heading',{name:'The art of quiet rooms'})).toBeVisible()
  expect(imageRequests).toBe(0)
 }
})

test('Chief Editor D1 edition remains dynamic through Reader, Story, related discovery and Collect',async({page})=>{
 const chiefPlan={qualityVersion:3,title:'The Architecture of Attention',deck:'Light and space guide attention from foreground to background.',features:[{catalogId:item.id,assetId:item.image.id,headline:'Where Light Meets Form',narrative:'Light frames the visible form, while shadow separates its edge from the background.',observationKeys:['subjects.lighting'],discoveryQuestion:'How might the surrounding space redirect attention?',sourceIds:[source.id],layout:'hero',motion:'still',theme:item.lifestyleTags[0]}],connections:[]}
 await page.route('**/api/editorial',route=>route.fulfill({json:{plan:chiefPlan,items:[item],editorialSources:[source],source:'meta',retrieval:'d1',cached:false}}))
 await page.route('**/api/catalog/published?*',route=>route.fulfill({json:{items:[item],nextCursor:null}}))
 await page.route(item.image.externalUrl!,route=>route.fulfill({path:'tests/fixtures/original-home-lamp.png',contentType:'image/png'}))
 await page.goto('/');await page.getByLabel('Your discovery prompt').fill('Explore how light frames an object');await page.getByRole('checkbox',{name:/Use Meta AI/}).check();await page.getByRole('button',{name:'Generate magazine'}).click()
 await expect(page.locator('.visual-reader')).toHaveAttribute('data-asset-id',item.image.id)
 await page.getByRole('button',{name:`Open ${item.name} story`}).click()
 await expect(page.locator('.visual-journey')).toBeVisible()
 await expect(page.getByRole('dialog')).toContainText('Owner supplied fictional editorial object.')
 await expect(page.getByRole('dialog')).toContainText('not independently verified')
 await page.locator('.journey-collect').click();await page.getByRole('button',{name:'Open collection'}).click()
 await expect(page.locator('.visual-collect')).toContainText(item.name)
 await page.getByRole('button',{name:'Return to reading'}).click();await expect(page.locator('.visual-reader')).toHaveAttribute('data-asset-id',item.image.id)
 await page.reload();await page.getByRole('button',{name:'Your collection'}).click();await expect(page.getByRole('button',{name:'Remove',exact:true}).first()).toBeVisible()
})
