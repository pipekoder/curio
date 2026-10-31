import {test,expect,type Page} from '@playwright/test'

// Grounded in readerDemoCatalog records: names, tags, and the fixed
// editorialCopy narrative shared by every catalog item.
const metaPlan={
  title:'A testing promenade',
  deck:'Two grounded exhibits for the spatial suite.',
  features:[
    {catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',headline:'A closer look: Ochre Arc Chair',narrative:'A subjective visual reading: consider the drawn forms and the space between them. Let this composition lead to another idea, without inferring materials or product identity.',layout:'hero',motion:'still',theme:'Quiet Luxury'},
    {catalogId:'demo-curio-owner-18-v1',assetId:'curio-owner-18-v1',headline:'A closer look: Window Overshirt',narrative:'An invitation to pause: look at the relationship between silhouette, scale and empty space. This editorial interpretation is a point of departure, not a factual claim about an object.',layout:'split',motion:'still',theme:'Quiet Luxury'},
  ],
}

declare global{
  interface Window{__spatial?:()=>{distance:number;cameraZ:number;cameraY:number;current:number;exhibits:number;nodes:number;source:string;assembly:string}}
}

async function submitPrompt(page:Page):Promise<void>{
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
}

test('/spatial opens the silver field with an immediately usable prompt',async({page})=>{
  const noise:string[]=[]
  // Resource-load failures are the handled fallback paths (no Worker in
  // preview): the manifest fallback and authored edition are asserted below.
  page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))noise.push(message.text())})
  page.on('pageerror',error=>{noise.push(String(error))})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Curio-authored edition · AI not used')
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.exhibits).toBeGreaterThan(0)
  expect(snapshot?.nodes).toBeGreaterThanOrEqual(6)
  expect(snapshot?.source).toBe('manifest')
  await expect(page.locator('.spatial-source')).toContainText('local manifest')
  await expect(page.locator('#spatial-index li')).toHaveCount(snapshot?.nodes??0)
  expect(noise).toEqual([])
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

test('arriving at an exhibit reveals its lateral rail',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  const exhibits=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-crumb')).toContainText(`Exhibit 1 of ${exhibits}`,{timeout:10000})
  await expect(page.locator('.spatial-rail')).toBeVisible()
  await expect(page.locator('.spatial-rail-card').first()).toContainText('Story')
  await page.locator('.spatial-rail').evaluate(el=>{el.scrollLeft=el.scrollWidth})
  await expect(page.locator('.spatial-rail-card').last()).toBeInViewport()
  await page.screenshot({path:'test-results/spatial-promenade-1440.png'})
})

test('inspecting an exhibit shows its authored detail and releases',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-rail')).toBeVisible()
  await page.locator('.spatial-rail-card').first().getByRole('button',{name:'Inspect exhibit'}).click()
  await expect(page.locator('.spatial-inspect')).toBeVisible()
  await expect(page.locator('.spatial-inspect h2')).not.toBeEmpty()
  await page.screenshot({path:'test-results/spatial-inspect-1440.png'})
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-inspect')).toBeHidden()
})

test('clicking a staged mount opens inspection through the scene',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:10000})
  await page.mouse.click(720,420)
  await expect(page.locator('.spatial-inspect')).toBeVisible({timeout:5000})
})

test('a grounded meta edition stages without the fallback disclosure',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:[],source:'meta',retrieval:'d1',cached:false}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toBeHidden()
  const exhibits=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  expect(exhibits).toBeGreaterThan(0)
})

test('assembly honors the director minimum on instant responses',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  const begun=Date.now()
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText('Composing your exhibition')
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  expect(Date.now()-begun).toBeGreaterThanOrEqual(1800)
})

test('slow generation holds with honest elapsed time and no simulated progress',async({page})=>{
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,4000))
    await route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText(/\(\ds\)/,{timeout:10000})
  await expect(page.getByRole('status').first()).not.toContainText('%')
  const hold=await page.evaluate(()=>window.__spatial?.())
  expect(['stream','lattice']).toContain(hold?.assembly)
  expect(hold?.cameraY??-1).toBeGreaterThan(1.9)
  expect(hold?.cameraY??9).toBeLessThan(2.5)
  await page.waitForTimeout(1200)
  await page.screenshot({path:'test-results/spatial-assembly-1440.png'})
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
})

test('Clear wipes the visit session and says what was removed',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  await expect(page.getByRole('status').last()).toContainText('curio.spatial.session.v1')
  await expect(page.getByRole('status').last()).toContainText('pending confirmation')
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await page.screenshot({path:'test-results/spatial-discover-390.png'})
})
