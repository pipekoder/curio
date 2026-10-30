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

test('Media Studio persists assignments across refresh and displays API errors',async({page})=>{
 const token='test-only-private-token-more-than-32-characters'
 const version=`version-${'a'.repeat(64)}`
 const media={version_id:version,filename:'chair.png',sha256:'a'.repeat(64),width:1200,height:900,mime_type:'image/png',image_type:'editorial',active:1,product_ids:null as string|null,brand_ids:null as string|null,campaign_ids:null as string|null,editorial_ready:0}
 const state={media:[media],brands:[{id:'brand-northline',name:'Northline Studio'}],products:[{id:'product-fold-chair',name:'Fold Chair',brand_id:'brand-northline'}],campaigns:[],limits:{maxBytes:2097152,accepted:['image/png']},inferenceTriggered:false}
 await page.addInitScript(value=>sessionStorage.setItem('curio.media.operator',value),token)
 await page.route('**/api/operator/media**',async route=>{
  const request=route.request()
  if(request.method()==='GET')return route.fulfill({json:state})
  if(request.method()==='PATCH'){
   const body=request.postDataJSON() as {imageType:string;productId?:string;brandId?:string}
   if(body.imageType==='brand')return route.fulfill({status:409,json:{error:'Assignment could not be saved.'}})
   media.image_type='product';media.product_ids=body.productId??null;media.editorial_ready=1
   return route.fulfill({json:{linked:true,versionId:version}})
  }
  return route.continue()
 })
 await page.route(`**/api/media/${version}`,route=>route.fulfill({status:404}))
 await page.goto('/internal/media')
 const assignment=page.getByLabel('Associate chair.png')
 await assignment.selectOption('product:product-fold-chair')
 await expect(assignment).toHaveValue('product:product-fold-chair')
 await expect(page.getByText('Assigned: Product · Fold Chair')).toBeVisible()
 await expect(page.getByText(/editorial metadata ready$/)).toBeVisible()
 await page.reload()
 await expect(page.getByLabel('Associate chair.png')).toHaveValue('product:product-fold-chair')
 await page.getByLabel('Associate chair.png').selectOption('brand:brand-northline')
 await expect(page.getByRole('alert')).toHaveText('Assignment could not be saved.')
 await expect(page.getByLabel('Associate chair.png')).toHaveValue('product:product-fold-chair')
})

test('Metadata Inspector copies the version and completes editorial readiness without losing assignments',async({page})=>{
 const token='test-only-private-token-more-than-32-characters',version=`version-${'b'.repeat(64)}`
 const brand={id:'brand-incomplete',name:'Incomplete Studio',story:'',description:'',website:null,country:null}
 const product={id:'product-chair',name:'Metadata Chair',brand_id:brand.id,description:'',category:'home',materials_json:'[]',price_minor:null,currency:null}
 const media={version_id:version,filename:'metadata-chair.png',sha256:'b'.repeat(64),width:1200,height:900,mime_type:'image/png',image_type:'product',active:1,product_ids:product.id,brand_ids:brand.id,campaign_ids:null,editorial_ready:0}
 const state={media:[media],brands:[brand],products:[product],campaigns:[],limits:{maxBytes:2097152,accepted:['image/png']},inferenceTriggered:false}
 await page.addInitScript(value=>{sessionStorage.setItem('curio.media.operator',value);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{sessionStorage.setItem('copied-version',text)}}})},token)
 await page.route('**/api/operator/media**',async route=>{
  const request=route.request()
  if(request.method()==='GET')return route.fulfill({json:state})
  if(request.method()==='PATCH'&&new URL(request.url()).pathname.endsWith('/metadata')){
   const body=request.postDataJSON() as {brand:{id:string;story:string};product:{id:string;description:string}}
   expect(body).toEqual({brand:{id:brand.id,story:'A fictional owner-supplied studio story.'},product:{id:product.id,description:'A fictional owner-supplied chair description.'}})
   brand.story=body.brand.story;product.description=body.product.description;media.editorial_ready=1
   return route.fulfill({json:{updated:true,affectedVersions:[version]}})
  }
  return route.fulfill({status:400,json:{error:'Unexpected request.'}})
 })
 await page.route(`**/api/media/${version}`,route=>route.fulfill({status:404}))
 await page.goto('/internal/media')
 await page.getByText('Inspect metadata').click()
 await expect(page.getByText(version,{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Copy',exact:true}).click();await expect(page.getByRole('button',{name:'Copied'})).toBeVisible()
 expect(await page.evaluate(()=>sessionStorage.getItem('copied-version'))).toBe(version)
 await expect(page.locator('.studio-checklist .missing')).toHaveCount(2)
 await page.getByLabel('Brand story').fill('A fictional owner-supplied studio story.')
 await page.getByLabel('Product description').fill('A fictional owner-supplied chair description.')
 await page.getByRole('button',{name:'Save metadata'}).click()
 await expect(page.getByText(/editorial metadata ready$/)).toBeVisible()
 await expect(page.locator('.studio-checklist .complete')).toHaveCount(5)
 await page.reload();await page.getByText('Inspect metadata').click()
 await expect(page.getByText('A fictional owner-supplied studio story.')).toBeVisible()
 await expect(page.getByText('A fictional owner-supplied chair description.')).toBeVisible()
 await expect(page.getByText('Assigned: Product · Metadata Chair · Brand · Incomplete Studio')).toBeVisible()
})
