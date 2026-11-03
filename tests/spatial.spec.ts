import {test,expect,type Page,type Route} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'
import {articleResponseFixture} from './article-fixtures'

// Serialized readerDemoCatalog records (demo-curio-owner-08/18-v1); the
// edition adapter validates them strictly, so fixture drift fails loudly.
const groundedItems=JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'spatial-grounded-items.json'),'utf8')) as unknown[]

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
  interface Window{__spatial?:()=>{distance:number;cameraZ:number;cameraY:number;current:number;exhibits:number;nodes:number;source:string;assembly:string;mode:string;orbit:{yaw:number;pitch:number;radius:number};selected:number;staged:string[];nodeIds:string[]}}
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
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(noise).toEqual([])
})

test('scrolling travels the camera through genuine depth',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const top=await page.evaluate(()=>window.__spatial?.().cameraZ)
  await page.evaluate(()=>window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*0.8))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeLessThan(top!)
  const mid=await page.evaluate(()=>window.__spatial?.())
  expect(mid?.mode).toBe('promenade')
  await page.evaluate(()=>window.scrollTo(0,0))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeGreaterThan(top!-1)
})

test('scrolling to the end of the promenade opens the journey',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeHidden()
  await page.waitForTimeout(1800)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
})

test('clear sits with surprise me in the journey controls',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  const order=await page.evaluate(()=>{
    const bar=document.getElementById('spatial-journey')
    return [...(bar?.querySelectorAll('button')??[])].map(b=>b.textContent)
  })
  expect(order.indexOf('Clear')).toBe(order.indexOf('Surprise me')+1)
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

test('exhibit decor keeps only approved markers and an animated scroll cue',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await expect(page.locator('.exhibit-decor .decor-plane')).toHaveCount(0)
  await expect(page.locator('.exhibit-decor .decor-tag')).toHaveCount(2)
  await expect(page.locator('.exhibit-decor')).toContainText('Exhibit 01')
  await expect(page.locator('.exhibit-decor')).toContainText('Culture')
  await expect(page.locator('.exhibit-decor')).not.toContainText('Objects')
  await expect(page.locator('.exhibit-decor')).not.toContainText('Materials')
  await expect(page.locator('.exhibit-decor .decor-scroll-dot')).toHaveCount(1)
})

test('reading a story expands in place and returns without moving the camera',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  // Let the settle glide finish so the stillness check starts from rest.
  await page.waitForFunction(()=>{
    const d=window.__spatial?.().distance??0
    const w=window as unknown as {__lastD?:number}
    const settled=w.__lastD!==undefined&&Math.abs(d-w.__lastD)<1e-9
    w.__lastD=d
    return settled
  },{timeout:15000,polling:400})
  const before=await page.evaluate(()=>window.__spatial?.().distance)
  await page.getByRole('button',{name:'Read story'}).click()
  const story=page.locator('.spatial-story')
  await expect(story).toBeVisible()
  await expect(story.getByRole('heading',{name:/A closer look/})).toBeFocused()
  await expect(story.locator('.spatial-story-hero img')).toBeVisible()
  await expect(story).toContainText('Story · Exhibit 1 of')
  // Scrolling the article never dismisses it.
  await story.evaluate(el=>{el.scrollTop=el.scrollHeight})
  await expect(story).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(story).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Read story'})).toBeFocused()
  const after=await page.evaluate(()=>window.__spatial?.().distance)
  expect(after).toBeCloseTo(before!,6)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of')
})

test('a story without V3 claims offers no Sources affordance',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await page.getByRole('button',{name:'Read story'}).click()
  await expect(page.locator('.spatial-story')).toBeVisible()
  await expect(page.locator('.spatial-sources')).toHaveCount(0)
})

// Synthetic V3 plan + citations fixtures: shapes follow the contract, values
// are test-only (example.org is never presented as a real Curio source).
const v3Plan={
  ...metaPlan,
  culturalEvidenceVersion:'curio-cultural-evidence-v3.0.0',
  features:metaPlan.features.map(feature=>({...feature,culturalClaims:[{sourceId:'source:example'}]})),
}
const citationsFixture={
  version:'curio-public-citations-v1',
  features:[{
    featureIndex:0,catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',
    headline:'A closer look: Ochre Arc Chair',
    citations:[{
      claimId:'claim:ritual',sourceId:'source:example:claim:ritual',
      narrativeText:'An approved editorial comparison about an everyday ritual.',
      claimKind:'comparison',evidenceStatus:'operator_reviewed',reviewStatus:'approved',
      sources:[{
        sourceId:'source:example',passageId:'passage:example',
        canonicalUrl:'https://example.org/article',publication:'Example Review',
        support:{kind:'reviewed_paraphrase',text:'An approved editorial comparison about an everyday ritual.'},
      }],
    }],
  }],
}

test('V3 sources open on demand with reviewed claims only',async({page})=>{
  let citationsBody:unknown='unset'
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:v3Plan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.route('**/api/editorial/citations',route=>{
    citationsBody=route.request().postDataJSON()
    return route.fulfill({status:200,json:citationsFixture})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await page.getByRole('button',{name:'Read story'}).click()
  const sources=page.locator('.spatial-sources')
  await expect(sources).toHaveCount(1)
  // No lookup happens before the visitor opens Sources.
  expect(citationsBody).toBe('unset')
  await sources.getByRole('button',{name:'Sources & References ▸'}).click()
  await expect(sources).toContainText('An approved editorial comparison about an everyday ritual.')
  await expect(sources).toContainText('Comparison · Operator reviewed · Approved')
  await expect(sources).toContainText('Reviewed paraphrase · Example Review')
  await expect(sources.getByRole('link',{name:'Open source ↗'})).toHaveAttribute('href','https://example.org/article')
  // The lookup POSTs the plan alone: no prompt, preferences, or token.
  expect(Object.keys(citationsBody as Record<string,unknown>)).toEqual(['plan'])
  // Sources & References is the separated bottom section of the story frame.
  const order=await page.locator('.spatial-story').evaluate(el=>[...el.children].map(child=>child.className))
  expect(order[order.length-1]).toContain('spatial-sources')
})

test('unavailable citations hide gracefully without blocking the story',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:v3Plan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.route('**/api/editorial/citations',route=>route.fulfill({status:404,json:{error:'gone'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await page.getByRole('button',{name:'Read story'}).click()
  const sources=page.locator('.spatial-sources')
  await sources.getByRole('button',{name:/Sources/}).click()
  // An empty lookup hides the section instead of leaving a placeholder.
  await expect(sources).toHaveCount(0)
  await expect(page.locator('.spatial-story')).toContainText('A closer look: Ochre Arc Chair')
})

test('the inspiration row fills the prompt with a sentence without generating',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('.spatial-suggestions-label')).toContainText('Need a little inspiration?')
  // Measure at steady state: the dock entrance scales from .55 to 1 over 1.6s.
  await page.locator('.spatial-dock').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  const row=page.locator('.spatial-seed-row')
  const seed=row.locator('.spatial-seed')
  await expect(seed).toHaveCount(1)
  expect(await seed.textContent()).toContain('·')
  // Seed plus two perfectly round icon buttons share one row.
  const circles=row.locator('.spatial-circle')
  await expect(circles).toHaveCount(2)
  for(const circle of await circles.all()){
    const box=await circle.boundingBox()
    expect(Math.abs(box!.width-box!.height)).toBeLessThan(0.5)
    expect(box!.width).toBeGreaterThanOrEqual(36)
  }
  await expect(row.getByRole('button',{name:'Refresh suggestion'})).toHaveAttribute('title','Refresh suggestion')
  await expect(row.getByRole('button',{name:'Surprise me'})).toHaveAttribute('title','Show me something unexpected')
  await seed.click()
  const filled=await page.getByLabel('Your curiosity').inputValue()
  expect(filled.startsWith("I'm curious about ")).toBe(true)
  expect(filled.endsWith('.')).toBe(true)
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
  // Free writing still works with no fixed format.
  await page.getByLabel('Your curiosity').fill('just some words')
  await expect(page.getByLabel('Your curiosity')).toHaveValue('just some words')
})

test('refresh swaps the seed without repeating it',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const seed=page.locator('.spatial-seed')
  const first=await seed.textContent()
  await page.getByRole('button',{name:'Refresh suggestion'}).click()
  const second=await seed.textContent()
  expect(second).not.toBe(first)
})

test('surprise me fills an empty input with varied directions',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toHaveValue('')
  const surprise=page.locator('.spatial-seed-row').getByRole('button',{name:'Surprise me'})
  await surprise.click()
  const first=await page.getByLabel('Your curiosity').inputValue()
  expect(first.startsWith("I'm curious about ")).toBe(true)
  await surprise.click()
  const second=await page.getByLabel('Your curiosity').inputValue()
  expect(second.startsWith("I'm curious about ")).toBe(true)
  expect(second).not.toBe(first)
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
})

const modelCaps={version:'curio-editorial-model-routing-v1',defaultMode:'lite',liteAvailable:true,hybridAvailable:true,modes:[]}
const hybridGeneration={version:'curio-editorial-model-routing-v1',editorialMode:'hybrid',chiefEditorModel:'muse-wonder-1.0',reviewerModel:'muse-spark-1.3',revisionModel:null,confirmationModel:null}

test('hybrid stays disabled without capabilities and the mode is omitted',async({page})=>{
  let body:unknown=null
  await page.route('**/api/editorial',route=>{
    body=route.request().postDataJSON()
    return route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('input[name=editorial-mode][value=lite]')).toBeChecked()
  await expect(page.locator('input[name=editorial-mode][value=hybrid]')).toBeDisabled()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Curio-authored edition · AI not used',{timeout:15000})
  expect(Object.keys(body as Record<string,unknown>).sort()).toEqual(['consent','prompt'])
})

test('hybrid mode propagates, shows while generating, and confirms on the chip',async({page})=>{
  const bodies:unknown[]=[]
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:modelCaps}))
  await page.route('**/api/editorial',async route=>{
    bodies.push(route.request().postDataJSON())
    await new Promise(resolve=>setTimeout(resolve,1500))
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false,generation:hybridGeneration}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const hybrid=page.locator('input[name=editorial-mode][value=hybrid]')
  await expect(hybrid).toBeEnabled()
  // Native radios keep full keyboard support: arrows move the selection.
  await page.locator('input[name=editorial-mode][value=lite]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(hybrid).toBeChecked()
  await submitPrompt(page)
  await expect(page.locator('.spatial-generating')).toContainText('Hybrid · Wonder + Spark')
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  expect((bodies[0] as Record<string,unknown>).editorialMode).toBe('hybrid')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI · Hybrid')
})

test('article opt-in stages three docks and renders deck plus brand captions',async({page})=>{
  let body:unknown=null
  await page.route('**/api/editorial',route=>{
    body=route.request().postDataJSON()
    return route.fulfill({status:200,json:articleResponseFixture()})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of 3',{timeout:15000})
  expect((body as Record<string,unknown>).editionFormat).toBe('curio-editorial-articles-v1')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI · Article edition')
  await expect(page.locator('#spatial-rail')).toContainText('A short introduction to demo article 1.')
  await page.getByRole('button',{name:'Read story'}).click()
  const story=page.locator('.spatial-story')
  await expect(story).toContainText('The quiet craft of demo article 1')
  await expect(story).toContainText('A short introduction to demo article 1.')
  await expect(story.locator('figure')).toHaveCount(3)
  await expect(story).toContainText('Atelier Nord')
  await expect(story).toContainText('Casa Lumen')
  // Article editions carry no EditorialPlan, so Sources stays hidden.
  await expect(story.getByRole('button',{name:/Sources/})).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(story).toHaveCount(0)
})

test('article budget denial names the actual limit and retry time',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{format:'curio-editorial-articles-v1',source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'budget',budget:{limitType:'per_ip_hourly',limit:4,used:4,remaining:0,requestedUnits:4,measure:'units',retryAfterSeconds:3600}}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  const alert=page.getByRole('alert')
  await expect(alert).toContainText('hourly inference allowance')
  await expect(alert).toContainText('4 inference units')
  await expect(alert).toContainText('3600 seconds')
})

test('insufficient article content discloses state and retries the standard edition',async({page})=>{
  const bodies:unknown[]=[]
  await page.route('**/api/editorial',route=>{
    const payload=route.request().postDataJSON() as Record<string,unknown>
    bodies.push(payload)
    if(payload.editionFormat)return route.fulfill({status:409,json:{status:'insufficient_content',eligibleImages:5,requiredImages:6,fallbackReason:'insufficient_content'}})
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  const alert=page.getByRole('alert')
  await expect(alert).toContainText('Not enough approved imagery')
  await expect(alert).toContainText('5 of 6')
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
  await page.getByRole('button',{name:'Continue with the standard edition'}).click()
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of 2',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).not.toContainText('Article edition')
  expect(bodies).toHaveLength(2)
  expect((bodies[1] as Record<string,unknown>).editionFormat).toBeUndefined()
})

test('a refused hybrid stages nothing and retries explicitly in lite',async({page})=>{
  const bodies:unknown[]=[]
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:modelCaps}))
  await page.route('**/api/editorial',route=>{
    bodies.push(route.request().postDataJSON())
    if(bodies.length===1)return route.fulfill({status:503,json:{code:'hybrid_unavailable',error:'Hybrid editorial mode is currently unavailable.'}})
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('input[name=editorial-mode][value=hybrid]')).toBeEnabled()
  await page.locator('input[name=editorial-mode][value=hybrid]').check()
  await submitPrompt(page)
  const error=page.locator('.spatial-mode-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('Nothing was generated.')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits??0)).toBe(0)
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
  await error.getByRole('button',{name:'Switch to Lite & retry'}).click()
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  expect(bodies).toHaveLength(2)
  expect((bodies[0] as Record<string,unknown>).editorialMode).toBe('hybrid')
  expect((bodies[1] as Record<string,unknown>).editorialMode).toBe('lite')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI')
  await expect(page.getByTestId('spatial-edition-chip')).not.toContainText('Hybrid')
  await page.getByRole('button',{name:'New Discovery'}).click()
  await expect(page.locator('input[name=editorial-mode][value=lite]')).toBeChecked()
  // A new discovery reopens the prompt without wiping staged journey records.
  expect(await page.evaluate(()=>window.__spatial?.().exhibits??0)).toBeGreaterThan(0)
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds.length??0)).toBeGreaterThan(0)
})

test('journey node panel shows the node artwork',async({page})=>{
  await openJourney(page)
  await page.getByRole('button',{name:'Surprise me'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel).toBeVisible()
  const figure=panel.locator('.spatial-node-figure img')
  await expect(figure).toBeVisible()
  expect(await figure.getAttribute('src')).toMatch(/^\/(editorial|catalog)\//)
})

test('discover stays usable under reduced motion',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'})
  const page=await context.newPage()
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('.spatial-seed')).toHaveCount(1)
  await page.locator('.spatial-seed').click()
  expect(await page.getByLabel('Your curiosity').inputValue()).not.toBe('')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:30000})
  await context.close()
})

test('promenade visits every dock with its story rail',async({page})=>{
  test.setTimeout(120000)
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  // The assembly director settles the page at dock 0 when it finishes; wait
  // for that before driving the dock loop so no late settle yanks us back.
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  const exhibits=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  expect(exhibits).toBeGreaterThan(0)
  for(let i=0;i<exhibits;i++){
    await page.evaluate(([idx,count])=>{
      const max=document.documentElement.scrollHeight-window.innerHeight
      window.scrollTo(0,max*(60+idx*40)/(60+(count-1)*40+50))
    },[i,exhibits])
    await expect(page.locator('.spatial-crumb')).toContainText(`Exhibit ${i+1} of ${exhibits}`,{timeout:10000})
    await expect(page.locator('.spatial-rail')).toBeVisible()
    await expect(page.locator('.spatial-rail-card').first()).toContainText('Story')
  }
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

test('a grounded meta edition shows Meta provenance and consent off by default',async({page})=>{
  let consent:unknown='unset'
  await page.route('**/api/editorial',route=>{
    consent=(route.request().postDataJSON() as {consent:boolean})?.consent??'missing'
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.getByLabel('Allow AI curation')).not.toBeChecked()
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI')
  expect(consent).toBe(false)
})

test('checking AI curation sends the actual consent value',async({page})=>{
  let consent:unknown='unset'
  await page.route('**/api/editorial',route=>{
    consent=(route.request().postDataJSON() as {consent:boolean})?.consent??'missing'
    return route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Allow AI curation').check()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Curio-authored edition · AI not used',{timeout:15000})
  expect(consent).toBe(true)
})

test('cached meta and deterministic states stay honestly labeled',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:true}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI (cached)',{timeout:15000})
  await page.unroute('**/api/editorial')
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'deterministic',retrieval:'d1',cached:false,fallbackReason:'consent_missing'}}))
  await page.reload()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('verified catalog',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI consent off')
})

test('the no-WebGL fallback stays a readable Silver Field edition',async({page})=>{
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(function(){return null} as unknown) as typeof HTMLCanvasElement.prototype.getContext})
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.locator('.spatial-fallback')).toBeVisible()
  await expect(page.getByText('The 3D exhibition needs WebGL')).toBeVisible()
  await expect(page.locator('.spatial-canvas')).toBeHidden()
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.locator('.spatial-fallback article').first()).toBeVisible({timeout:15000})
  await expect(page.locator('.spatial-fallback section')).toContainText('Journey catalog')
})

// Version-pattern publication fixtures for the revocation suite: the same
// grounded records with exact asset-version image IDs, as real D1
// publications carry. Local demo IDs can never revalidate, by design.
type VersionedRecord={id:string;name:string;image:{id:string;path:string}}
const publishedRecords=(groundedItems as VersionedRecord[])
  .map((item,index)=>({...item,image:{...item.image,id:`version-${index.toString(16).padStart(64,'0')}`}}))
const versionPlan=(records:VersionedRecord[])=>({
  title:'A versioned promenade',
  deck:'Published exhibits for the revocation suite.',
  features:records.map((record,index)=>({
    catalogId:record.id,assetId:record.image.id,
    headline:`A closer look ${index+1}`,
    narrative:'A subjective visual reading of the composition and the space between its forms.',
    layout:'hero',motion:'still',theme:'Quiet Luxury',
  })),
})
const publishedRoute=(revoked:()=>string[])=>async(route:Route)=>{
  const ids=new URL(route.request().url()).searchParams.get('ids')?.split(',')??null
  let records=publishedRecords
  if(ids)records=records.filter(record=>ids.includes(record.image.id))
  const gone=new Set(revoked())
  records=records.filter(record=>!gone.has(record.image.id))
  await route.fulfill({status:200,json:{items:records,nextCursor:null}})
}
const stageVersionedEdition=async(page:Page,records:VersionedRecord[])=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:versionPlan(records),items:records,source:'meta',retrieval:'d1',cached:false}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI',{timeout:15000})
  await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeEnabled({timeout:15000})
}

test('re-entering journey drops records revoked mid-session',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('live catalog')
  expect(await page.evaluate(()=>window.__spatial?.().nodes)).toBe(2)
  revoked.add(publishedRecords[1].image.id)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('1 records')
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toEqual([publishedRecords[0].image.id])
  await expect(page.getByRole('status').last()).toContainText('removed from the journey')
})

test('entering a revoked exhibit stays in journey and prunes it',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await stageVersionedEdition(page,publishedRecords)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Enter exhibit →'})).toBeVisible()
  revoked.add(await page.evaluate(index=>window.__spatial?.().nodeIds[index]??'',target))
  await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  await page.waitForFunction(()=>window.__spatial?.().exhibits===1)
  expect(await page.evaluate(()=>window.__spatial?.().mode)).toBe('network')
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toHaveLength(1)
  await expect(panel).toBeHidden()
  await expect(page.locator('p.spatial-sr')).toContainText('no longer available')
})

test('returning to the promenade drops exhibits revoked mid-session',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await stageVersionedEdition(page,publishedRecords)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  revoked.add(publishedRecords[0].image.id)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(1)
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toHaveLength(1)
  await expect(page.getByRole('status').last()).toContainText('no longer lists')
})

test('unverifiable journey records fall back to the labeled manifest',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  expect(await page.evaluate(()=>window.__spatial?.().source)).toBe('published')
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().nodes)).toBeGreaterThanOrEqual(6)
  await expect(page.getByRole('status').last()).toContainText('could not be verified')
})

test('failed journey revalidation also removes staged server exhibits',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await stageVersionedEdition(page,publishedRecords)
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(2)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(0)
  await expect(page.getByTestId('spatial-edition-chip')).toBeHidden()
  await expect(page.getByRole('status').last()).toContainText('exhibits were removed')
})

test('failed journey revalidation leaves local demo exhibits alone',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI not used',{timeout:15000})
  await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeEnabled({timeout:15000})
  const staged=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  expect(staged).toBeGreaterThan(0)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(staged)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI not used')
})

test('artwork that 404s removes its exhibit instead of lingering',async({page})=>{
  await page.route('**/api/catalog/published*',publishedRoute(()=>[]))
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:versionPlan([publishedRecords[0]]),items:[publishedRecords[0]],source:'meta',retrieval:'d1',cached:false}}))
  await page.route(`**${publishedRecords[0].image.path}`,route=>route.fulfill({status:404}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  // The staged state flashes by: the 404 prune lands before any stable
  // assertion on it, so the removal message is the deterministic signal.
  await expect(page.getByRole('status').last()).toContainText('no longer lists',{timeout:15000})
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(0)
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await expect(page.getByTestId('spatial-edition-chip')).toBeHidden()
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
  await expect(page.getByRole('status').first()).toContainText(/\d+s elapsed/,{timeout:10000})
  await expect(page.getByRole('status').first()).not.toContainText('%')
  const hold=await page.evaluate(()=>window.__spatial?.())
  expect(['stream','lattice']).toContain(hold?.assembly)
  expect(hold?.cameraY??-1).toBeGreaterThan(1.9)
  expect(hold?.cameraY??9).toBeLessThan(2.5)
  await page.waitForTimeout(1200)
  await page.screenshot({path:'test-results/spatial-assembly-1440.png'})
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
})

test('ai-length headlines and narratives stay readable without overflow',async({page})=>{
  const headline='A closer look at the quiet arrangement of objects within soft northern light levels'
  const sentence='Imagine the visible arrangement inviting a closer look at the space around each form. '
  const narrative=sentence.repeat(4).trim().slice(0,395)
  const longPlan={...metaPlan,features:metaPlan.features.map(feature=>({...feature,headline,narrative}))}
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:longPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    await page.goto('/')
    await submitPrompt(page)
    await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI',{timeout:15000})
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
    await expect(page.locator('.spatial-rail')).toBeVisible()
    await expect(page.locator('.spatial-rail-card h2').first()).toContainText('A closer look')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
    await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeVisible()
    await page.locator('.spatial-rail-card').first().getByRole('button',{name:'Inspect exhibit'}).click()
    await expect(page.locator('.spatial-inspect')).toBeVisible()
    await expect(page.locator('.spatial-inspect p').first()).not.toBeEmpty()
    await page.keyboard.press('Escape')
  }
})

test('a slow full-review workflow still stages meta past the old bound',async({page})=>{
  test.setTimeout(90000)
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,25000))
    await route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText(/\d+s elapsed/,{timeout:10000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI',{timeout:45000})
})

test('Clear wipes the visit session and says what was removed',async({page})=>{
  test.setTimeout(90000)
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  await expect(page.getByRole('status').last()).toContainText('curio.spatial.session.v1')
  await expect(page.getByRole('status').last()).toContainText('pending confirmation')
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.getByRole('status').last()).toContainText('No visit data was found in this browser')
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await page.screenshot({path:'test-results/spatial-discover-390.png'})
})

async function stageFallbackEdition(page:Page):Promise<void>{
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
}

async function openJourney(page:Page):Promise<void>{
  await stageFallbackEdition(page)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
}

test('journey opens the network of real catalog nodes',async({page})=>{
  await openJourney(page)
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.nodes).toBeGreaterThanOrEqual(6)
  expect(snapshot?.source).toBe('manifest')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await expect(page.locator('.spatial-crumb')).toContainText('Journey')
  await expect(page.locator('.spatial-rail')).toBeHidden()
  await page.screenshot({path:'test-results/spatial-network-1440.png'})
})

test('orbit drag and wheel zoom move the chamber camera',async({page})=>{
  await openJourney(page)
  const before=await page.evaluate(()=>window.__spatial?.().orbit)
  await page.mouse.move(720,450)
  await page.mouse.down()
  await page.mouse.move(920,450,{steps:10})
  await page.mouse.up()
  await page.mouse.wheel(0,400)
  await page.waitForTimeout(300)
  const after=await page.evaluate(()=>window.__spatial?.().orbit)
  expect(after?.yaw).not.toBeCloseTo(before?.yaw??0,5)
  expect(after?.radius).toBeGreaterThan(before?.radius??0)
})

test('surprise highlights a node without diving',async({page})=>{
  await openJourney(page)
  const orbitBefore=await page.evaluate(()=>window.__spatial?.().orbit)
  await page.getByRole('button',{name:'Surprise me'}).click()
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('network')
  expect(snapshot?.selected).toBeGreaterThanOrEqual(0)
  const orbitAfter=await page.evaluate(()=>window.__spatial?.().orbit)
  expect(orbitAfter).toEqual(orbitBefore)
  await expect(page.locator('.spatial-crumb')).toContainText('Journey · ')
  await expect(page.getByRole('button',{name:'Close node panel'})).toBeVisible()
})

test('entering a staged node dives to its exhibit',async({page})=>{
  await openJourney(page)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Enter exhibit →'})).toBeVisible()
  await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit',{timeout:10000})
})

test('curating from an unstaged node starts a new edition',async({page})=>{
  await openJourney(page)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>!snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Curate from this node →'})).toBeVisible()
  await panel.getByRole('button',{name:'Curate from this node →'}).click()
  await expect(page.getByRole('status').first()).toContainText('Composing your exhibition')
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('promenade')
})

test('clear from the network exhales and wipes the visit',async({page})=>{
  await openJourney(page)
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForTimeout(1800)
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('promenade')
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
})

test('reduced-motion journey uses the toolbar and panel',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await stageFallbackEdition(page)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await page.getByRole('button',{name:'Surprise me'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel).toBeVisible()
  if(await panel.getByRole('button',{name:'Enter exhibit →'}).count()){
    await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  }else{
    await panel.getByRole('button',{name:'Curate from this node →'}).click()
  }
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
})

test('network stays usable at mobile width',async({page})=>{
  test.setTimeout(60000)
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await page.getByRole('button',{name:'Surprise me'}).click()
  await expect(page.getByTestId('spatial-node-panel')).toBeVisible()
  await page.screenshot({path:'test-results/spatial-network-390.png'})
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
})

test('/ is the spatial homepage and /legacy keeps the 2D edition',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await page.goto('/legacy')
  await expect(page.getByLabel('Your discovery prompt')).toBeVisible()
  await expect(page.getByText('AI not used').first()).toBeHidden()
})

test('/spatial redirects to / for backward compatibility',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
})
