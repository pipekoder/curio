import {test,expect} from '@playwright/test'
import {editorialCopy} from '../shared/editorial'
import {externalFixture} from './hybrid-fixtures'
const item={...externalFixture,id:`catalog-${'b'.repeat(40)}`,image:{...externalFixture.image,id:`version-${'a'.repeat(64)}`}}
const plan={title:'A persisted discovery',deck:'An independently reviewed visual record.',features:[{catalogId:item.id,assetId:item.image.id,headline:editorialCopy(item).headlines[0],narrative:editorialCopy(item).narratives[0],layout:'split',motion:'still',theme:item.lifestyleTags[0]}]}
for(const approved of [true,false])test(`persistent catalog record ${approved?'renders and survives Collect reload':'is rejected without authoritative publication'}`,async({page})=>{
 let imageRequests=0
 await page.route('**/api/editorial',route=>route.fulfill({json:{plan,items:[item],source:'deterministic',retrieval:'d1',cached:false}}))
 await page.route('**/api/catalog/published?*',route=>route.fulfill({json:{items:approved?[item]:[],nextCursor:null}}))
 await page.route(item.image.externalUrl!,route=>{imageRequests++;return route.fulfill({path:'tests/fixtures/original-home-lamp.png',contentType:'image/png'})})
 await page.goto('/');await page.getByLabel('Your discovery prompt').fill('Quiet rooms and reading lamps');await page.getByRole('button',{name:'Generate magazine'}).click()
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
