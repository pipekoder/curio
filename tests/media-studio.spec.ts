import {test,expect,type Route} from '@playwright/test'

test('owner can bulk-upload and review a structured multi-product import without inference',async({page})=>{
 const token='test-only-owner-token-longer-than-thirty-two-characters'
 const mediaRoute=async (route:Route)=>{
  const url=new URL(route.request().url())
  expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
  if(url.pathname.endsWith('/batches'))return route.fulfill({status:201,json:{batchId:'4f591adf-6fb2-48a0-a7ac-0c8df891a15b'}})
  if(url.pathname.endsWith('/uploads'))return route.fulfill({status:201,json:{versionId:`version-${'a'.repeat(64)}`}})
  if(url.pathname.endsWith('/parse'))return route.fulfill({json:{sourceText:'fixture',brands:[{name:'Northline Studio',story:'Fictional owner mockup brand.',description:'',website:null,country:null}],products:[{brand:'Northline Studio',name:'Fold Chair',description:'Fictional concept.',category:'home',materials:[],price:null,currency:null,imageFilenames:['fold-chair.png'],lifestyleTags:[]}],campaigns:[]}})
  if(url.pathname.endsWith('/imports'))return route.fulfill({status:201,json:{batchId:'4f591adf-6fb2-48a0-a7ac-0c8df891a15b',brands:['brand-northline'],products:[{id:'product-fold-chair',name:'Fold Chair'}],campaigns:[],unmatched:[]}})
  return route.fulfill({json:{media:[],brands:[],products:[],campaigns:[],limits:{maxBytes:2097152,accepted:['image/jpeg','image/png','image/webp']},inferenceTriggered:false}})
 }
 await page.route('**/api/operator/media',mediaRoute)
 await page.route('**/api/operator/media/**',mediaRoute)
 await page.goto('/internal/media')
 await expect(page.getByRole('heading',{name:'Content Studio'})).toBeVisible()
 await page.getByLabel('Operator token').fill(token);await page.getByRole('button',{name:'Open Content Studio'}).click()
 await expect(page.getByRole('heading',{name:'Bulk images'})).toBeVisible()
 await page.locator('.studio-drop input').setInputFiles({name:'fold-chair.png',mimeType:'image/png',buffer:Buffer.from('owner-created-test-image')})
 await page.getByRole('button',{name:'Upload queued images'}).click();await expect(page.getByText('complete')).toBeVisible()
 await page.locator('.studio-import>textarea').fill('Brand: Northline Studio\n\nProduct: Fold Chair')
 await page.getByRole('button',{name:'Extract structured records'}).click();await expect(page.getByLabel('Review and edit structured import')).toContainText('Fold Chair')
 await page.getByRole('button',{name:'Save mockup catalog'}).click()
 expect(await page.evaluate(()=>localStorage.length)).toBe(0)
})
